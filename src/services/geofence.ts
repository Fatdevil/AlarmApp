import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { IOS_MAX_GEOFENCES, MIN_GEOFENCE_RADIUS_METERS } from '../constants';
import { LocalAlarm } from '../types';
import { findAlarmByLocationId, getAlarmsByStatus, updateAlarmStatus } from './db';
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
  const triggerType = isEnter ? 'ENTER_LOCATION' : 'EXIT_LOCATION';

  const alarm = findAlarmByLocationId(regionId);

  // Larmet måste finnas och vara aktivt – annars är zonen kvarglömd i OS
  if (!alarm || alarm.status !== 'ACTIVE_GEOFENCE') {
    await syncGeofencesWithOs().catch((err) => console.warn('[GeofenceTask] Synk:', err));
    return;
  }
  // Händelsen måste matcha larmets typ (vi registrerar bara rätt riktning, men var defensiv)
  if (alarm.triggerType !== triggerType) return;

  await fireGeofenceNotification(alarm, isEnter);
  updateAlarmStatus(alarm.id, 'FIRED_LOCALLY');

  // Avregistrera direkt: förhindrar upprepade larm och frigör iOS-platser
  await syncGeofencesWithOs().catch((err) => console.warn('[GeofenceTask] Synk:', err));

  await logEvent(isEnter ? 'GEOFENCE_ENTER' : 'GEOFENCE_EXIT', regionId, {
    locationSnapshot: {
      latitude: region.latitude,
      longitude: region.longitude,
      accuracy: region.radius,
    },
    note: `Utlöst på enheten och avregistrerad. Larm: ${alarm.id}`,
  }, 'BACKGROUND');

  // ARKITEKTURPRINCIP 2 & 5: ingen status eller position skickas till någon server härifrån.
});

function toRegion(alarm: LocalAlarm): Location.LocationRegion {
  const loc = alarm.location!;
  return {
    identifier: loc.id,
    latitude: loc.latitude,
    longitude: loc.longitude,
    radius: loc.radius,
    notifyOnEnter: alarm.triggerType === 'ENTER_LOCATION',
    notifyOnExit: alarm.triggerType === 'EXIT_LOCATION',
  };
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
    return 0;
  }

  const perms = await checkLocationPermissions();
  if (!perms.background) {
    throw new Error(
      'Platslarm kräver platsåtkomst "Tillåt alltid". Ändra i Inställningar för att aktivera larmet.'
    );
  }

  const regions = active.slice(0, MAX_GEOFENCES).map(toRegion);
  await Location.startGeofencingAsync(GEOFENCE_BACKGROUND_TASK, regions);
  return regions.length;
}

/** Kontroller som måste passera innan ett platslarm sparas som aktivt. */
export function assertCanAddGeofence(alarm: LocalAlarm): void {
  if (!alarm.location) throw new Error('Plats saknas.');
  if (alarm.location.radius < MIN_GEOFENCE_RADIUS_METERS) {
    throw new Error(`Minsta radie är ${MIN_GEOFENCE_RADIUS_METERS} meter.`);
  }
  const others = getAlarmsByStatus(['ACTIVE_GEOFENCE']).filter((a) => a.id !== alarm.id);
  if (others.length >= MAX_GEOFENCES) {
    throw new Error(
      `Du kan ha högst ${MAX_GEOFENCES} aktiva platslarm samtidigt. Markera ett som klart först.`
    );
  }
}

export async function clearAllGeofences(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(GEOFENCE_BACKGROUND_TASK)) {
    await Location.stopGeofencingAsync(GEOFENCE_BACKGROUND_TASK);
  }
}
