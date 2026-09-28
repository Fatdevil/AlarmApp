import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { IOS_MAX_GEOFENCES, MIN_GEOFENCE_RADIUS_METERS } from '../constants';
import { isTriggeringTransition, RegionDefinition, sameRegions } from '../logic/regionState';
import { GeofenceLocation, LocalAlarm } from '../types';
import {
  clearRegionStates,
  findActiveAlarmsByLocationId,
  getAlarmsByStatus,
  getRegionState,
  pruneRegionStates,
  setRegionState,
  updateAlarmStatus,
} from './db';
import { logEvent } from './diagnostics';
import { fireGeofenceNotification } from './notifications';

export const GEOFENCE_BACKGROUND_TASK = 'ALARM_APP_GEOFENCE_TASK';

// Android (Play Services) tillåter 100 geofences per app
const MAX_GEOFENCES = Platform.OS === 'ios' ? IOS_MAX_GEOFENCES : 100;

interface GeofenceTaskData {
  eventType: Location.GeofencingEventType;
  region: Location.LocationRegion;
}

/**
 * Top-level TaskManager-definition för geofencing på enheten. Måste definieras i
 * modulscope och importeras tidigt (se index.ts) så att OS kan väcka appen.
 */
TaskManager.defineTask<GeofenceTaskData>(GEOFENCE_BACKGROUND_TASK, async ({ data, error }) => {
  if (error) {
    console.error('[GeofenceTask] Fel vid geofence-händelse:', error.message);
    return;
  }
  const regionId = data?.region?.identifier;
  if (!data || !regionId) return;

  const { eventType, region } = data;
  const isEnter = eventType === Location.GeofencingEventType.Enter;

  // Spara läget först: även händelser som inte larmar behövs för att känna igen nästa passage
  const observed = isEnter ? 'INSIDE' : 'OUTSIDE';
  const previous = getRegionState(regionId);
  setRegionState(regionId, observed);

  // Flera larm kan dela samma zon (t.ex. "kommer hem" och "lämnar hemmet")
  const alarms = findActiveAlarmsByLocationId(regionId);

  // Inga aktiva larm – zonen är kvarglömd i OS
  if (alarms.length === 0) {
    await syncGeofencesWithOs().catch((err) => console.warn('[GeofenceTask] Synk:', err));
    return;
  }
  // Lägesbesked (efter registrering/omstart), dubbletter och fel riktning larmar inte
  const due = alarms.filter((a) => isTriggeringTransition(previous, observed, a.triggerType));
  if (due.length === 0) return;

  for (const alarm of due) {
    await fireGeofenceNotification(alarm, isEnter);
    updateAlarmStatus(alarm.id, 'FIRED_LOCALLY');
  }

  // Avregistrera direkt: förhindrar upprepade larm och frigör iOS-platser
  await syncGeofencesWithOs().catch((err) => console.warn('[GeofenceTask] Synk:', err));

  for (const alarm of due) {
    await logEvent(isEnter ? 'GEOFENCE_ENTER' : 'GEOFENCE_EXIT', regionId, {
      locationSnapshot: {
        latitude: region.latitude,
        longitude: region.longitude,
        accuracy: region.radius,
      },
      note: `Utlöst på enheten och avregistrerad. Larm: ${alarm.id}`,
    }, 'BACKGROUND');
  }

  // ARKITEKTURPRINCIP 2 & 5: ingen status eller position skickas till någon server härifrån.
});

/** Båda riktningarna bevakas så att appen alltid vet om man är innanför eller utanför. */
function toRegion(loc: GeofenceLocation): Location.LocationRegion & RegionDefinition {
  return {
    identifier: loc.id,
    latitude: loc.latitude,
    longitude: loc.longitude,
    radius: loc.radius,
    notifyOnEnter: true,
    notifyOnExit: true,
  };
}

/** En zon per plats-ID, i larmens ordning (nyaste först). */
function uniquePlaces(alarms: LocalAlarm[]): GeofenceLocation[] {
  const byId = new Map<string, GeofenceLocation>();
  for (const a of alarms) {
    if (a.location && !byId.has(a.location.id)) byId.set(a.location.id, a.location);
  }
  return [...byId.values()];
}

async function registeredRegions(): Promise<RegionDefinition[] | null> {
  try {
    if (!(await TaskManager.isTaskRegisteredAsync(GEOFENCE_BACKGROUND_TASK))) return null;
    const options = await TaskManager.getTaskOptionsAsync<{ regions?: RegionDefinition[] }>(
      GEOFENCE_BACKGROUND_TASK
    );
    return options?.regions ?? null;
  } catch {
    return null; // Osäkert läge – registrera om hellre än att riskera att zoner saknas
  }
}

export async function checkLocationPermissions(): Promise<{ foreground: boolean; background: boolean }> {
  try {
    const [fg, bg] = await Promise.all([
      Location.getForegroundPermissionsAsync(),
      Location.getBackgroundPermissionsAsync(),
    ]);
    return { foreground: fg.granted, background: bg.granted };
  } catch {
    return { foreground: false, background: false };
  }
}

/**
 * Speglar databasens aktiva platslarm (nyaste först, upp till OS-gränsen) till OS.
 * Enda stället som anropar start/stopGeofencingAsync – så kan OS och databas inte glida isär.
 */
export async function syncGeofencesWithOs(): Promise<number> {
  const active = getAlarmsByStatus(['ACTIVE_GEOFENCE']).filter((a) => a.location);

  if (active.length === 0) {
    if (await TaskManager.isTaskRegisteredAsync(GEOFENCE_BACKGROUND_TASK)) {
      await Location.stopGeofencingAsync(GEOFENCE_BACKGROUND_TASK);
    }
    pruneRegionStates([]);
    return 0;
  }

  const perms = await checkLocationPermissions();
  if (!perms.background) {
    throw new Error(
      'Platslarm kräver platsåtkomst "Tillåt alltid". Ändra i Inställningar för att aktivera larmet.'
    );
  }

  const regions = uniquePlaces(active).slice(0, MAX_GEOFENCES).map(toRegion);
  const ids = regions.map((r) => r.identifier);
  pruneRegionStates(ids);

  // Omregistrering får OS att skicka nya lägesbesked för alla zoner – gör den bara vid
  // faktisk ändring, och glöm sparade lägen först: ett gammalt läge jämfört med ett
  // nytt besked (t.ex. efter ändrad radie) skulle annars se ut som en passage.
  const current = await registeredRegions();
  if (!current || !sameRegions(current, regions)) {
    clearRegionStates(ids);
    await Location.startGeofencingAsync(GEOFENCE_BACKGROUND_TASK, regions);
  }
  return regions.length;
}

/** Kontroller som måste passera innan ett platslarm sparas som aktivt. */
export function assertCanAddGeofence(alarm: LocalAlarm): void {
  if (!alarm.location) throw new Error('Plats saknas.');
  if (alarm.location.radius < MIN_GEOFENCE_RADIUS_METERS) {
    throw new Error(`Minsta radie är ${MIN_GEOFENCE_RADIUS_METERS} meter.`);
  }
  // Gränsen gäller unika platser: larm som delar plats använder samma zon
  const places = new Set(
    uniquePlaces(getAlarmsByStatus(['ACTIVE_GEOFENCE']).filter((a) => a.id !== alarm.id)).map((l) => l.id)
  );
  if (!places.has(alarm.location.id) && places.size >= MAX_GEOFENCES) {
    throw new Error(
      `Du kan bevaka högst ${MAX_GEOFENCES} olika platser samtidigt. Markera ett platslarm som klart först.`
    );
  }
}

export async function clearAllGeofences(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(GEOFENCE_BACKGROUND_TASK)) {
    await Location.stopGeofencingAsync(GEOFENCE_BACKGROUND_TASK);
  }
}
