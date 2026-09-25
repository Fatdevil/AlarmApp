/**
 * Vänlarm via push (Fas 5).
 *
 * Säkerhetsmodell:
 * 1. Payloaden valideras strikt (logic/validation.ts) – okända fält ignoreras.
 * 2. Ett mottaget vänlarm sparas som PENDING_ACCEPTANCE. Ingen geofence registreras
 *    och inget ACK skickas förrän mottagaren aktivt godkänner det.
 * 3. ACK:et innehåller aldrig plats eller triggerstatus (Princip 5).
 *
 * OBS: Avsändarens identitet kan inte verifieras på enheten ännu – det kräver
 * signerade payloads från en backend. Samtyckessteget är skyddet tills dess.
 */
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { SyncAckPayload } from '../types';
import { validateIncomingAlarm } from '../logic/validation';
import { validateAntiProbingAck } from './antiProbing';
import { deleteAlarm, getAlarm, saveAlarm, updateAlarmStatus } from './db';
import { logEvent } from './diagnostics';
import { assertCanAddGeofence, syncGeofencesWithOs } from './geofence';
import { presentFriendRequest } from './notifications';

export const BACKGROUND_NOTIFICATION_TASK = 'ALARM_APP_BACKGROUND_NOTIFICATION_TASK';

export type AckTransport = (ack: SyncAckPayload) => void;

let ackTransport: AckTransport | null = null;

/** Kopplar in hur ACK skickas (backend saknas i R0 – diagnostikvyn lyssnar här). */
export function setAckTransport(transport: AckTransport | null): void {
  ackTransport = transport;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Hittar SYNC_GEOFENCE-datat oavsett om det kommer som objekt eller JSON-sträng (FCM). */
export function extractSyncPayload(raw: unknown): Record<string, unknown> | null {
  const candidates: unknown[] = [raw];
  if (isRecord(raw)) {
    candidates.push(raw.data, raw.body);
    if (isRecord(raw.data)) candidates.push(raw.data.body, raw.data.dataString);
    if (typeof raw.dataString === 'string') candidates.push(raw.dataString);
  }
  for (const c of candidates) {
    let value = c;
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch {
        continue;
      }
    }
    if (isRecord(value) && value.type === 'SYNC_GEOFENCE') return value;
  }
  return null;
}

/** Tar emot ett vänlarm. Returnerar true om en ny förfrågan skapades. */
export async function handleIncomingPushPayload(raw: unknown): Promise<boolean> {
  const payload = extractSyncPayload(raw);
  if (!payload) return false;

  const result = validateIncomingAlarm(payload.alarm, new Date().toISOString());
  if (!result.ok) {
    await logEvent('PUSH_SYNC_REJECTED', 'UNKNOWN', { note: `Avvisad payload: ${result.reason}` });
    return false;
  }

  // Idempotens: samma larm kan levereras flera gånger (t.ex. både task och listener)
  if (getAlarm(result.alarm.id)) return false;

  saveAlarm(result.alarm);
  await presentFriendRequest(result.alarm);
  await logEvent('PUSH_SYNC_RECEIVED', result.alarm.id, {
    note: 'Vänlarm mottaget – väntar på mottagarens godkännande.',
  });
  return true;
}

/** Mottagaren godkänner: aktivera geofence och skicka strikt ACK. */
export async function acceptFriendAlarm(alarmId: string): Promise<SyncAckPayload> {
  const alarm = getAlarm(alarmId);
  if (!alarm || alarm.status !== 'PENDING_ACCEPTANCE') {
    throw new Error('Förfrågan finns inte längre.');
  }

  const active = { ...alarm, status: 'ACTIVE_GEOFENCE' as const };
  assertCanAddGeofence(active);
  updateAlarmStatus(alarm.id, 'ACTIVE_GEOFENCE');
  try {
    await syncGeofencesWithOs();
  } catch (err) {
    updateAlarmStatus(alarm.id, 'PENDING_ACCEPTANCE');
    throw err;
  }

  const ack: SyncAckPayload = {
    alarmId: alarm.id,
    status: 'REGISTERED_ON_DEVICE',
    deviceTimestamp: new Date().toISOString(),
  };
  validateAntiProbingAck(ack);
  ackTransport?.(ack);

  await logEvent('PUSH_ACK_DISPATCHED', alarm.id, {
    note: 'Strikt ACK: REGISTERED_ON_DEVICE (inga koordinater).',
  });
  return ack;
}

/** Mottagaren avböjer: raderas lokalt. Avsändaren får inget besked. */
export function declineFriendAlarm(alarmId: string): void {
  const alarm = getAlarm(alarmId);
  if (alarm?.status === 'PENDING_ACCEPTANCE') deleteAlarm(alarmId);
}

/**
 * Bakgrundstask för inkommande push (förgrund, bakgrund och avslutad app).
 * Ersätter addNotificationReceivedListener, som bara körs när appen är öppen.
 */
TaskManager.defineTask<Notifications.NotificationTaskPayload>(
  BACKGROUND_NOTIFICATION_TASK,
  async ({ data, error }) => {
    if (error || !data || 'actionIdentifier' in data) {
      return Notifications.BackgroundNotificationTaskResult.NoData;
    }
    try {
      const created = await handleIncomingPushPayload(data);
      return created
        ? Notifications.BackgroundNotificationTaskResult.NewData
        : Notifications.BackgroundNotificationTaskResult.NoData;
    } catch (err) {
      console.warn('[PushSync] Fel i bakgrundstask:', err);
      return Notifications.BackgroundNotificationTaskResult.Failed;
    }
  }
);

export async function registerBackgroundPushTask(): Promise<void> {
  if (!(await TaskManager.isTaskRegisteredAsync(BACKGROUND_NOTIFICATION_TASK))) {
    await Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK);
  }
}
