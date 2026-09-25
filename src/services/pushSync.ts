import * as Notifications from 'expo-notifications';
import { LocalAlarm, SyncAckPayload } from '../types';
import { registerGeofence } from './geofence';
import { saveAlarm, logDiagnosticEvent, getAllAlarms } from './db';
import { getBatterySnapshot } from './battery';
import { validateAntiProbingAck } from './antiProbing';

export { validateAntiProbingAck };

export type PushSyncCallback = (ack: SyncAckPayload) => void;

let ackListener: PushSyncCallback | null = null;

export function setAckListener(listener: PushSyncCallback | null): void {
  ackListener = listener;
}

/**
 * Hantera inkommande push-synk från avsändare
 */
export async function handleIncomingPushPayload(payload: any): Promise<SyncAckPayload | null> {
  const battery = await getBatterySnapshot();
  const nowIso = new Date().toISOString();

  logDiagnosticEvent({
    timestamp: nowIso,
    eventType: 'PUSH_SYNC_RECEIVED',
    targetId: payload.alarm?.id || 'UNKNOWN',
    batteryLevel: battery.batteryLevel,
    isCharging: battery.isCharging,
    lowPowerMode: battery.lowPowerMode,
    lifecycleState: 'BACKGROUND',
    note: `Push-typ: ${payload.type || 'standard'}. Payload togs emot på enheten.`,
  });

  if (payload.type === 'SYNC_GEOFENCE' && payload.alarm) {
    const existingAlarms = getAllAlarms();
    const alreadyRegistered = existingAlarms.some(
      (a) => a.id === payload.alarm.id && a.status === 'ACTIVE_GEOFENCE'
    );

    // Idempotenskontroll: Om larmet redan är aktivt on-device, skicka ACK utan att dubbelregistrera i OS
    if (alreadyRegistered) {
      const existingAck: SyncAckPayload = {
        alarmId: payload.alarm.id,
        status: 'REGISTERED_ON_DEVICE',
        deviceTimestamp: nowIso,
      };
      validateAntiProbingAck(existingAck);
      if (ackListener) {
        ackListener(existingAck);
      }
      return existingAck;
    }

    const alarm: LocalAlarm = {
      ...payload.alarm,
      status: 'ACTIVE_GEOFENCE',
      createdAt: payload.alarm.createdAt || nowIso,
    };

    // 1. Spara lokalt i SQLite
    saveAlarm(alarm);

    // 2. Registrera geofence i OS (CoreLocation / Play Services)
    if (alarm.location) {
      await registerGeofence(alarm.location, alarm);
    }

    // 3. Skapa och validera strikt ACK (Princip 5)
    const ack: SyncAckPayload = {
      alarmId: alarm.id,
      status: 'REGISTERED_ON_DEVICE',
      deviceTimestamp: new Date().toISOString(),
    };

    validateAntiProbingAck(ack);

    logDiagnosticEvent({
      timestamp: ack.deviceTimestamp,
      eventType: 'PUSH_ACK_DISPATCHED',
      targetId: alarm.id,
      batteryLevel: battery.batteryLevel,
      isCharging: battery.isCharging,
      lowPowerMode: battery.lowPowerMode,
      lifecycleState: 'BACKGROUND',
      note: 'Strikt ACK skickad: REGISTERED_ON_DEVICE (inga koordinater).',
    });

    if (ackListener) {
      ackListener(ack);
    }

    return ack;
  }

  return null;
}

/**
 * Initiera lyssnare för bakgrunds- och interaktiva notiser
 */
export function setupPushListeners(): () => void {
  try {
    // Lyssnar på notiser när appen är öppen eller väcks
    const subReceived = Notifications.addNotificationReceivedListener((notification) => {
      try {
        const data = notification?.request?.content?.data;
        if (data && data.type === 'SYNC_GEOFENCE') {
          handleIncomingPushPayload(data);
        }
      } catch (err) {
        console.warn('[PushSync] Fel vid hantering av mottagen notis:', err);
      }
    });

    // Lyssnar på när användaren trycker på en synlig Fallback-notis
    const subResponse = Notifications.addNotificationResponseReceivedListener((response) => {
      try {
        const data = response?.notification?.request?.content?.data;
        if (data && data.type === 'SYNC_GEOFENCE') {
          handleIncomingPushPayload(data);
        }
      } catch (err) {
        console.warn('[PushSync] Fel vid hantering av notissvar:', err);
      }
    });

    return () => {
      try {
        subReceived.remove();
        subResponse.remove();
      } catch (unsubErr) {
        console.warn('[PushSync] Fel vid avregistrering av lyssnare:', unsubErr);
      }
    };
  } catch (err) {
    console.warn('[PushSync] Kunde inte initiera push-lyssnare (normalt i Expo Go):', err);
    return () => {};
  }
}
