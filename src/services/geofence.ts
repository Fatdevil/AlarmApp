import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { GeofenceLocation, LocalAlarm } from '../types';
import {
  MIN_GEOFENCE_RADIUS_METERS,
  DEFAULT_GEOFENCE_RADIUS_METERS,
  IOS_MAX_GEOFENCES,
} from '../constants';
import { getBatterySnapshot } from './battery';
import { logDiagnosticEvent, updateAlarmStatus, getAllAlarms } from './db';
import { fireImmediateNotification } from './notifications';

export {
  MIN_GEOFENCE_RADIUS_METERS,
  DEFAULT_GEOFENCE_RADIUS_METERS,
  IOS_MAX_GEOFENCES,
};

export const GEOFENCE_BACKGROUND_TASK = 'ALARM_APP_GEOFENCE_TASK';

/**
 * Top-level TaskManager definition för On-Device Geofencing.
 * Exekveras av operativsystemet (iOS CoreLocation / Android Play Services)
 * även när appen är suspenderad i bakgrunden eller nyligen väckt efter att ha varit avslutad.
 */
TaskManager.defineTask(
  GEOFENCE_BACKGROUND_TASK,
  async ({ data, error }: { data: any; error: any }) => {
    if (error) {
      console.error('[GeofenceTask] Fel vid geofence-händelse:', error.message);
      return;
    }

    if (data) {
      const { eventType, region } = data;
      const battery = await getBatterySnapshot();
      const nowIso = new Date().toISOString();

      const isEnter = eventType === Location.GeofencingEventType.Enter;
      const isExit = eventType === Location.GeofencingEventType.Exit;

      const eventName = isEnter ? 'GEOFENCE_ENTER' : 'GEOFENCE_EXIT';
      const triggerType = isEnter ? 'ENTER_LOCATION' : 'EXIT_LOCATION';

      console.log(`[GeofenceTask] OS triggade ${eventName} för region: ${region.identifier}`);

      // Hitta motsvarande larm från lokal SQLite
      const allAlarms = getAllAlarms();
      const matchingAlarm = allAlarms.find((a) => a.location?.id === region.identifier);

      // KONTROLL 1: Larmet måste existera och vara i status ACTIVE_GEOFENCE
      if (!matchingAlarm || matchingAlarm.status !== 'ACTIVE_GEOFENCE') {
        console.log(`[GeofenceTask] Larm ${region.identifier} är inte aktivt (${matchingAlarm?.status}). Avregistrerar zon ur OS.`);
        await removeGeofence(region.identifier);
        return;
      }

      // KONTROLL 2: Händelsen måste matcha larmets konfigurerade triggerType
      if (matchingAlarm.triggerType !== triggerType) {
        console.log(`[GeofenceTask] Händelsetyp matchar inte: larmet väntar på ${matchingAlarm.triggerType} men OS rapporterade ${triggerType}.`);
        return;
      }

      const title = isEnter ? '📍 Platsalarm (Anlänt)' : '🚗 Platsalarm (Lämnat)';
      const body = matchingAlarm.content;

      // 1. Avfyra omedelbar lokal notis till användaren (helt offline)
      await fireImmediateNotification(title, body, region.identifier, triggerType);

      // 2. Uppdatera lokal status till FIRED_LOCALLY
      updateAlarmStatus(matchingAlarm.id, 'FIRED_LOCALLY');

      // 3. Avregistrera geofence omedelbart från OS hårdvara (P0 Buggfix: förhindrar oändliga larmloopar och frigör iOS-slots!)
      await removeGeofence(region.identifier);

      // 4. Logga i Diagnostikloggen för 48h/7-dagars R0-mätning
      logDiagnosticEvent({
        timestamp: nowIso,
        eventType: eventName,
        targetId: region.identifier,
        batteryLevel: battery.batteryLevel,
        isCharging: battery.isCharging,
        lowPowerMode: battery.lowPowerMode,
        lifecycleState: 'BACKGROUND',
        locationSnapshot: {
          latitude: region.latitude,
          longitude: region.longitude,
          accuracy: region.radius,
        },
        note: `Triggades on-device och avregistrerades ur OS. Matchade larm: ${matchingAlarm.id}`,
      });

      /**
       * ARKITEKTURPRINCIP 2 & 5 (BINDANDE):
       * Ingen status eller koordinater skickas till servern härifrån!
       * Mottagarens gränskorsning är strikt lokal på enheten.
       */
    }
  }
);

/**
 * Begär platsrättigheter (Förgrund + Bakgrund "Always")
 */
export async function requestLocationPermissions(): Promise<{
  foreground: boolean;
  background: boolean;
}> {
  try {
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    if (fgStatus !== 'granted') {
      return { foreground: false, background: false };
    }

    const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
    return {
      foreground: true,
      background: bgStatus === 'granted',
    };
  } catch (err) {
    console.warn('[Geofence] Fel vid requestLocationPermissions:', err);
    return { foreground: false, background: false };
  }
}

/**
 * Kontrollera aktuella rättigheter
 */
export async function checkLocationPermissions(): Promise<{
  foreground: boolean;
  background: boolean;
}> {
  try {
    const fg = await Location.getForegroundPermissionsAsync();
    const bg = await Location.getBackgroundPermissionsAsync();

    return {
      foreground: fg.granted,
      background: bg.granted,
    };
  } catch (err) {
    console.warn('[Geofence] Fel vid checkLocationPermissions:', err);
    return {
      foreground: false,
      background: false,
    };
  }
}

/**
 * Registrera en ny geofence-region on-device
 */
export async function registerGeofence(
  location: GeofenceLocation,
  alarm: LocalAlarm
): Promise<void> {
  // 1. Validera minimiradie enligt MUST-gate i kravspecen
  if (location.radius < MIN_GEOFENCE_RADIUS_METERS) {
    throw new Error(
      `Otillåten radie: ${location.radius} m. Minsta tillåtna radie för tillförlitlig triggning är ${MIN_GEOFENCE_RADIUS_METERS} meter.`
    );
  }

  // 2. Kontrollera iOS 20-regionsgräns (räkna övriga aktiva regioner exklusive denna)
  const otherActiveAlarms = getAllAlarms().filter(
    (a) => a.status === 'ACTIVE_GEOFENCE' && a.location && a.location.id !== location.id
  );

  if (Platform.OS === 'ios' && otherActiveAlarms.length >= IOS_MAX_GEOFENCES) {
    throw new Error(
      `Maxgräns för iOS (${IOS_MAX_GEOFENCES} samtidigt aktiva zoner) har uppnåtts. Avaktivera en befintlig zon först.`
    );
  }

  // 3. Bygg upp regioner för TaskManager
  const newRegion: Location.LocationRegion = {
    identifier: location.id,
    latitude: location.latitude,
    longitude: location.longitude,
    radius: location.radius,
    notifyOnEnter: alarm.triggerType === 'ENTER_LOCATION',
    notifyOnExit: alarm.triggerType === 'EXIT_LOCATION',
  };

  const allRegionsToMonitor = [
    ...otherActiveAlarms.map((a) => ({
      identifier: a.location!.id,
      latitude: a.location!.latitude,
      longitude: a.location!.longitude,
      radius: a.location!.radius,
      notifyOnEnter: a.triggerType === 'ENTER_LOCATION',
      notifyOnExit: a.triggerType === 'EXIT_LOCATION',
    })),
    newRegion,
  ];

  await Location.startGeofencingAsync(GEOFENCE_BACKGROUND_TASK, allRegionsToMonitor);

  const battery = await getBatterySnapshot();
  logDiagnosticEvent({
    timestamp: new Date().toISOString(),
    eventType: 'GEOFENCE_REGISTERED',
    targetId: location.id,
    batteryLevel: battery.batteryLevel,
    isCharging: battery.isCharging,
    lowPowerMode: battery.lowPowerMode,
    lifecycleState: 'FOREGROUND',
    locationSnapshot: {
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.radius,
    },
    note: `Registrerad med radie ${location.radius}m. Totalt aktiva regioner: ${allRegionsToMonitor.length}`,
  });
}

/**
 * Avregistrera en specifik geofence
 */
export async function removeGeofence(locationId: string): Promise<void> {
  try {
    const activeAlarms = getAllAlarms().filter(
      (a) => a.status === 'ACTIVE_GEOFENCE' && a.location && a.location.id !== locationId
    );

    if (activeAlarms.length === 0) {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(GEOFENCE_BACKGROUND_TASK);
      if (isRegistered) {
        await Location.stopGeofencingAsync(GEOFENCE_BACKGROUND_TASK);
      }
    } else {
      const remainingRegions = activeAlarms.map((a) => ({
        identifier: a.location!.id,
        latitude: a.location!.latitude,
        longitude: a.location!.longitude,
        radius: a.location!.radius,
        notifyOnEnter: a.triggerType === 'ENTER_LOCATION',
        notifyOnExit: a.triggerType === 'EXIT_LOCATION',
      }));
      await Location.startGeofencingAsync(GEOFENCE_BACKGROUND_TASK, remainingRegions);
    }
  } catch (err) {
    console.warn('[Geofence] Kunde inte avregistrera zon:', err);
  }
}

/**
 * Rensa alla aktiva geofences från OS
 */
export async function clearAllGeofences(): Promise<void> {
  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(GEOFENCE_BACKGROUND_TASK);
    if (isRegistered) {
      await Location.stopGeofencingAsync(GEOFENCE_BACKGROUND_TASK);
    }
  } catch (err) {
    console.warn('[Geofence] Fel vid clearAllGeofences:', err);
  }
}

/**
 * Återställ alla aktiva geofences vid reboot eller appstart (P0 Buggfix)
 */
export async function restoreGeofencesOnBoot(): Promise<number> {
  try {
    const pending = getAllAlarms().filter(
      (a) => a.status === 'ACTIVE_GEOFENCE' && a.location
    );

    if (pending.length === 0) {
      try {
        const isRegistered = await TaskManager.isTaskRegisteredAsync(GEOFENCE_BACKGROUND_TASK);
        if (isRegistered) {
          await Location.stopGeofencingAsync(GEOFENCE_BACKGROUND_TASK);
        }
      } catch (err) {
        // Ignorera om stopGeofencingAsync misslyckas vid tom lista
      }
      return 0;
    }

    // 1. Kontrollera platsbehörighet innan vi försöker registrera geofences i OS
    const perms = await checkLocationPermissions();
    if (!perms.background) {
      console.log('[Geofence] Bakgrundsplatsbehörighet saknas, hoppar över återställning av geofences i OS.');
      return 0;
    }

    // Om över 20 zoner finns på iOS, begränsa till 20 nyaste
    const alarmsToRestore = Platform.OS === 'ios' ? pending.slice(0, IOS_MAX_GEOFENCES) : pending;

    const regions: Location.LocationRegion[] = alarmsToRestore.map((a) => ({
      identifier: a.location!.id,
      latitude: a.location!.latitude,
      longitude: a.location!.longitude,
      radius: a.location!.radius,
      notifyOnEnter: a.triggerType === 'ENTER_LOCATION',
      notifyOnExit: a.triggerType === 'EXIT_LOCATION',
    }));

    await Location.startGeofencingAsync(GEOFENCE_BACKGROUND_TASK, regions);

    const battery = await getBatterySnapshot();
    logDiagnosticEvent({
      timestamp: new Date().toISOString(),
      eventType: 'BOOT_RESTORE_TRIGGERED',
      targetId: 'GEOFENCE_SYSTEM',
      batteryLevel: battery.batteryLevel,
      isCharging: battery.isCharging,
      lowPowerMode: battery.lowPowerMode,
      lifecycleState: 'TERMINATED_WAKEUP',
      note: `Återställde ${regions.length} aktiva geofences efter omstart/appstart.`,
    });

    return regions.length;
  } catch (err) {
    console.warn('[Geofence] Fel vid restoreGeofencesOnBoot:', err);
    return 0;
  }
}
