/**
 * Vänlarm – prototyp som endast nås från diagnostikvyn.
 *
 * Integritetsreglerna finns i docs/PRIVACY.md. I korthet:
 * 1. Payloaden valideras strikt (logic/validation.ts) – okända fält ignoreras.
 * 2. Ett mottaget vänlarm sparas som PENDING_ACCEPTANCE. Ingen geofence registreras
 *    förrän mottagaren aktivt godkänner det.
 * 3. Appen skickar ingenting tillbaka – inte heller att larmet godkänts eller registrerats.
 *
 * Push tas inte emot i vanliga byggen: avsändarens identitet kan inte verifieras förrän
 * det finns en backend med inloggning. En bakgrundstask från äldre versioner avregistreras.
 */
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { validateIncomingAlarm } from '../logic/validation';
import { deleteAlarm, getAlarm, saveAlarm, updateAlarmStatus } from './db';
import { logEvent } from './diagnostics';
import { assertCanAddGeofence, syncGeofencesWithOs } from './geofence';
import { presentFriendRequest } from './notifications';

/** Namnet på bakgrundstasken som äldre versioner registrerade för inkommande push. */
export const LEGACY_PUSH_TASK = 'ALARM_APP_BACKGROUND_NOTIFICATION_TASK';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Hittar SYNC_GEOFENCE-datat oavsett om det kommer som objekt eller JSON-sträng (FCM). */
export function extractSyncPayload(raw: unknown): Record<string, unknown> | null {
  const candidates: unknown[] = [raw];
  if (isRecord(raw)) {
    candidates.push(raw.data, raw.body);
    // SDK 57 bakgrundstask (Android + iOS): { data: { dataString, ...fält }, notification }
    if (isRecord(raw.data)) candidates.push(raw.data.body, raw.data.dataString);
    if (typeof raw.dataString === 'string') candidates.push(raw.dataString);
    // Expo Notification-omslag (t.ex. från lyssnare): request.content.data
    const request = isRecord(raw.request)
      ? raw.request
      : isRecord(raw.notification) && isRecord(raw.notification.request)
        ? raw.notification.request
        : null;
    if (request && isRecord(request.content)) candidates.push(request.content.data);
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

/** Mottagaren godkänner: aktivera geofence. Inget besked skickas någonstans. */
export async function acceptFriendAlarm(alarmId: string): Promise<void> {
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
}

/** Mottagaren avböjer: raderas lokalt. Avsändaren får inget besked. */
export function declineFriendAlarm(alarmId: string): void {
  const alarm = getAlarm(alarmId);
  if (alarm?.status === 'PENDING_ACCEPTANCE') deleteAlarm(alarmId);
}

/** Tar bort push-tasken som äldre versioner registrerade, så att push inte längre tas emot. */
export async function unregisterLegacyPushTask(): Promise<void> {
  if (await TaskManager.isTaskRegisteredAsync(LEGACY_PUSH_TASK)) {
    await Notifications.unregisterTaskAsync(LEGACY_PUSH_TASK);
  }
}
