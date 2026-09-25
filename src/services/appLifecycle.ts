/**
 * Appstart och hantering av notissvar (knapptryck i notiser).
 */
import * as Notifications from 'expo-notifications';
import { acknowledgeAlarm, markFired, reconcileScheduledAlarms, snoozeAlarm } from './alarms';
import { syncGeofencesWithOs } from './geofence';
import {
  ACTION_ACCEPT,
  ACTION_DECLINE,
  ACTION_DONE,
  ACTION_SNOOZE,
  initNotificationChannels,
  readNotificationData,
} from './notifications';
import { acceptFriendAlarm, declineFriendAlarm, registerBackgroundPushTask } from './pushSync';

export async function initializeApp(): Promise<void> {
  const steps: [string, () => Promise<unknown>][] = [
    ['notiskanaler', initNotificationChannels],
    ['push-task', registerBackgroundPushTask],
    ['tidslarm', () => reconcileScheduledAlarms()],
    ['geofences', syncGeofencesWithOs],
  ];
  // Varje steg körs oberoende – ett fel i ett steg får inte stoppa de andra
  for (const [name, step] of steps) {
    try {
      await step();
    } catch (err) {
      console.warn(`[AppInit] ${name}:`, err);
    }
  }
}

export interface ResponseOutcome {
  /** Larm att lyfta fram på startsidan, om något. */
  focusAlarmId: string | null;
  /** Felmeddelande att visa för användaren, om något. */
  error: string | null;
}

export async function handleNotificationResponse(
  response: Notifications.NotificationResponse
): Promise<ResponseOutcome> {
  const data = readNotificationData(response.notification);
  if (!data) return { focusAlarmId: null, error: null };

  try {
    switch (response.actionIdentifier) {
      case ACTION_DONE:
        await acknowledgeAlarm(data.alarmId);
        return { focusAlarmId: null, error: null };
      case ACTION_SNOOZE:
        await snoozeAlarm(data.alarmId);
        return { focusAlarmId: null, error: null };
      case ACTION_ACCEPT:
        await acceptFriendAlarm(data.alarmId);
        return { focusAlarmId: data.alarmId, error: null };
      case ACTION_DECLINE:
        declineFriendAlarm(data.alarmId);
        return { focusAlarmId: null, error: null };
      default:
        if (data.kind === 'ALARM') markFired(data.alarmId);
        return { focusAlarmId: data.alarmId, error: null };
    }
  } catch (err) {
    return {
      focusAlarmId: data.alarmId,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export function handleNotificationReceived(notification: Notifications.Notification): void {
  const data = readNotificationData(notification);
  if (data?.kind === 'ALARM') markFired(data.alarmId);
}
