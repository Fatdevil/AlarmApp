import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { SNOOZE_MINUTES } from '../constants';
import { WEEKDAY_NUMBERS } from '../logic/time';
import { LocalAlarm } from '../types';

/**
 * Larmkanal på Android. Kanalinställningar är oföränderliga efter att de skapats,
 * därför ett nytt ID (v2) när ljudet nu spelas som *larm* (AudioUsage.ALARM) och
 * får bryta igenom Stör ej.
 */
export const ALARM_CHANNEL_ID = 'alarms_v2';
const FRIEND_CHANNEL_ID = 'friend_requests';

export const ALARM_CATEGORY = 'ALARM';
export const FRIEND_CATEGORY = 'FRIEND_REQUEST';

export const ACTION_DONE = 'DONE';
export const ACTION_SNOOZE = 'SNOOZE';
export const ACTION_ACCEPT = 'ACCEPT';
export const ACTION_DECLINE = 'DECLINE';

export type NotificationKind = 'ALARM' | 'FRIEND_REQUEST';

export interface AlarmNotificationData extends Record<string, unknown> {
  kind: NotificationKind;
  alarmId: string;
}

// Visa notiser även när appen är i förgrunden
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** Kanaler (Android) och åtgärdsknappar (båda plattformarna). Idempotent. */
export async function initNotificationChannels(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ALARM_CHANNEL_ID, {
      name: 'Larm',
      description: 'Tids- och platslarm som du har skapat',
      importance: Notifications.AndroidImportance.MAX,
      bypassDnd: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      vibrationPattern: [0, 500, 250, 500, 250, 500],
      enableVibrate: true,
      audioAttributes: {
        usage: Notifications.AndroidAudioUsage.ALARM,
        contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      },
    });
    await Notifications.setNotificationChannelAsync(FRIEND_CHANNEL_ID, {
      name: 'Förfrågningar från vänner',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    // Den gamla kanalen (alarm_channel_high_priority) behålls: redan schemalagda larm
    // från tidigare version pekar på den och skulle annars inte visas.
  }

  await Notifications.setNotificationCategoryAsync(ALARM_CATEGORY, [
    { identifier: ACTION_DONE, buttonTitle: 'Klar', options: { opensAppToForeground: true } },
    {
      identifier: ACTION_SNOOZE,
      buttonTitle: `Snooza ${SNOOZE_MINUTES} min`,
      options: { opensAppToForeground: true },
    },
  ]);
  await Notifications.setNotificationCategoryAsync(FRIEND_CATEGORY, [
    { identifier: ACTION_ACCEPT, buttonTitle: 'Aktivera', options: { opensAppToForeground: true } },
    {
      identifier: ACTION_DECLINE,
      buttonTitle: 'Avböj',
      options: { opensAppToForeground: true, isDestructive: true },
    },
  ]);
}

function alarmContent(alarm: LocalAlarm, title: string): Notifications.NotificationContentInput {
  const data: AlarmNotificationData = { kind: 'ALARM', alarmId: alarm.id };
  return {
    title,
    body: alarm.content,
    // iOS: ringsignalen är längre och tydligare än standardljudet
    sound: Platform.OS === 'ios' ? 'defaultRingtone' : true,
    priority: Notifications.AndroidNotificationPriority.MAX,
    // iOS: bryter igenom Fokus (kräver time-sensitive-entitlement, se app.json)
    interruptionLevel: 'timeSensitive',
    categoryIdentifier: ALARM_CATEGORY,
    data,
  };
}

/**
 * Schemalägger ett tidslarm i OS och returnerar notis-ID:n. Sparar ingenting –
 * anroparen ansvarar för att skriva ID:n till databasen (se services/alarms.ts).
 */
export async function scheduleTimeAlarm(alarm: LocalAlarm, now: Date = new Date()): Promise<string[]> {
  if (!alarm.dateTime) throw new Error('Tid saknas för tidslarm.');
  const first = new Date(alarm.dateTime);
  if (isNaN(first.getTime())) throw new Error('Ogiltig tid.');

  const repeat = alarm.repeat ?? 'NONE';
  const content = alarmContent(alarm, '⏰ Larm');
  const hour = first.getHours();
  const minute = first.getMinutes();

  if (repeat === 'NONE') {
    if (first.getTime() <= now.getTime()) throw new Error('Tiden har redan passerat. Välj en ny tid.');
    const id = await Notifications.scheduleNotificationAsync({
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: first,
        channelId: ALARM_CHANNEL_ID,
      },
    });
    return [id];
  }

  if (repeat === 'DAILY') {
    const id = await Notifications.scheduleNotificationAsync({
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
        channelId: ALARM_CHANNEL_ID,
      },
    });
    return [id];
  }

  // Vardagar: en veckotrigger per dag. Rulla tillbaka om någon misslyckas.
  const ids: string[] = [];
  try {
    for (const weekday of WEEKDAY_NUMBERS) {
      ids.push(
        await Notifications.scheduleNotificationAsync({
          content,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday,
            hour,
            minute,
            channelId: ALARM_CHANNEL_ID,
          },
        })
      );
    }
  } catch (err) {
    await cancelNotifications(ids);
    throw err;
  }
  return ids;
}

export async function scheduleSnooze(alarm: LocalAlarm, now: Date = new Date()): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: alarmContent(alarm, '⏰ Larm (snoozat)'),
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(now.getTime() + SNOOZE_MINUTES * 60_000),
      channelId: ALARM_CHANNEL_ID,
    },
  });
}

export async function cancelNotifications(ids: string[] | undefined): Promise<void> {
  for (const id of ids ?? []) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch (err) {
      console.warn('[Notifications] Kunde inte avbryta notis:', err);
    }
  }
}

export async function cancelAllScheduledNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/** Omedelbar lokal notis när en geofence löser ut på enheten. */
export async function fireGeofenceNotification(alarm: LocalAlarm, isEnter: boolean): Promise<void> {
  const place = alarm.location?.name ?? 'platsen';
  await Notifications.scheduleNotificationAsync({
    content: alarmContent(alarm, isEnter ? `📍 Framme vid ${place}` : `📍 Lämnat ${place}`),
    trigger: { channelId: ALARM_CHANNEL_ID },
  });
}

/** Lokal notis om att en vän vill skicka ett platslarm – kräver aktivt godkännande. */
export async function presentFriendRequest(alarm: LocalAlarm): Promise<void> {
  const data: AlarmNotificationData = { kind: 'FRIEND_REQUEST', alarmId: alarm.id };
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Nytt platslarm från en vän',
      body: `”${alarm.content}” vid ${alarm.location?.name ?? 'en plats'}. Vill du aktivera det?`,
      categoryIdentifier: FRIEND_CATEGORY,
      data,
    },
    trigger: { channelId: FRIEND_CHANNEL_ID },
  });
}

/** alarmId → schemalagda notis-ID:n som OS faktiskt har kvar. */
export async function getScheduledByAlarm(): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  const requests = await Notifications.getAllScheduledNotificationsAsync();
  for (const req of requests) {
    const alarmId = req.content?.data?.alarmId;
    if (typeof alarmId === 'string') {
      map.set(alarmId, [...(map.get(alarmId) ?? []), req.identifier]);
    }
  }
  return map;
}

export function readNotificationData(
  notification: Notifications.Notification
): AlarmNotificationData | null {
  const data = notification.request.content.data;
  if (
    data &&
    typeof data.alarmId === 'string' &&
    (data.kind === 'ALARM' || data.kind === 'FRIEND_REQUEST')
  ) {
    return { kind: data.kind, alarmId: data.alarmId };
  }
  return null;
}
