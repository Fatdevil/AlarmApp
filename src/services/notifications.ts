import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { LocalAlarm } from '../types';
import { getBatterySnapshot } from './battery';
import { logDiagnosticEvent, updateAlarmStatus, getPendingAlarms, saveAlarm } from './db';

const ALARM_CHANNEL_ID = 'alarm_channel_high_priority';

// Konfigurera standardbeteende för notiser i förgrunden
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Initiera notiskanaler (Android kräver High Importance för att väcka skärmen)
 */
export async function initNotificationChannels(): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync(ALARM_CHANNEL_ID, {
        name: 'Kritiska Alarm & Påminnelser',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 250, 500],
        lightColor: '#FF231F7C',
        enableVibrate: true,
        showBadge: true,
      });
    } catch (err) {
      console.log('[Notifications] Info notiskanal (systembegränsning/Expo Go fallback):', err);
    }
  }
}

/**
 * Begär notisbehörighet
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  try {
    const settings = await Notifications.getPermissionsAsync();
    if (settings.granted || settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL) {
      return true;
    }
    const request = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    return request.granted;
  } catch (err) {
    console.warn('[Notifications] Fel vid begäran av notisbehörighet:', err);
    return false;
  }
}

/**
 * Schemalägg ett lokalt tidsalarm (Fas 3).
 * Fungerar 100 % offline utan internetuppkoppling vid triggertillfället.
 */
export async function scheduleTimeAlarm(alarm: LocalAlarm): Promise<string | null> {
  if (!alarm.dateTime) {
    throw new Error('dateTime krävs för tidsalarm');
  }

  const targetDate = new Date(alarm.dateTime);
  const now = new Date();

  if (targetDate.getTime() <= now.getTime()) {
    throw new Error('Alarmtiden måste vara i framtiden');
  }

  // Avbryt eventuell tidigare schemalagd notis för att undvika dubbletter i OS
  if (alarm.notificationId) {
    await cancelTimeAlarm(alarm.notificationId);
  }

  const notificationId = await Notifications.scheduleNotificationAsync({
    content: {
      title: '⏰ Alarm',
      body: alarm.content,
      sound: true,
      priority: Notifications.AndroidNotificationPriority.MAX,
      data: {
        alarmId: alarm.id,
        triggerType: 'TIME',
        scheduledTime: alarm.dateTime,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: targetDate,
      channelId: ALARM_CHANNEL_ID,
    },
  });

  // Spara notificationId i SQLite så att notisen kan avbrytas vid radering/klarmarkering
  saveAlarm({ ...alarm, notificationId });

  const battery = await getBatterySnapshot();
  logDiagnosticEvent({
    timestamp: new Date().toISOString(),
    eventType: 'ALARM_SCHEDULED',
    targetId: alarm.id,
    scheduledTime: alarm.dateTime,
    batteryLevel: battery.batteryLevel,
    isCharging: battery.isCharging,
    lowPowerMode: battery.lowPowerMode,
    lifecycleState: 'FOREGROUND',
    note: `Notis-ID: ${notificationId}`,
  });

  return notificationId;
}

/**
 * Avbryt en schemalagd notis i operativsystemet (P0 Buggfix för Ghost Alarms)
 */
export async function cancelTimeAlarm(notificationId: string): Promise<void> {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (err) {
    console.warn('[Notifications] Kunde inte avbryta notis:', err);
  }
}

/**
 * Avbryt alla schemalagda notiser i operativsystemet (för GDPR/Reset)
 */
export async function cancelAllTimeAlarms(): Promise<void> {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (err) {
    console.warn('[Notifications] Kunde inte avbryta alla notiser:', err);
  }
}

/**
 * Skicka en omedelbar lokal notis (används när ett geofence triggas on-device)
 */
export async function fireImmediateNotification(
  title: string,
  body: string,
  alarmId: string,
  eventType: 'ENTER_LOCATION' | 'EXIT_LOCATION'
): Promise<void> {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: true,
      priority: Notifications.AndroidNotificationPriority.MAX,
      data: {
        alarmId,
        triggerType: eventType,
      },
    },
    trigger: { channelId: ALARM_CHANNEL_ID },
  });
}

/**
 * Återställ larm efter reboot (RECEIVE_BOOT_COMPLETED / App launch)
 * Läser alla kvarvarande larm från SQLite och schemalägger om dem i OS.
 * Kontrollerar befintliga OS-schemaläggningar för att förhindra dubbletter (Stampede).
 */
export async function restoreAlarmsOnBoot(): Promise<number> {
  try {
    const pending = getPendingAlarms();
    const now = Date.now();
    let restoredCount = 0;

    // Hämta redan schemalagda notiser i OS för att inte duplicera
    let scheduledInOs: Notifications.NotificationRequest[] = [];
    try {
      scheduledInOs = await Notifications.getAllScheduledNotificationsAsync();
    } catch (err) {
      console.warn('[Notifications] Kunde inte läsa befintliga schemalagda notiser från OS:', err);
    }

    const scheduledMap = new Map<string, string>(); // alarmId -> notificationId
    for (const req of scheduledInOs) {
      const alarmId = req.content?.data?.alarmId;
      if (alarmId && typeof alarmId === 'string') {
        scheduledMap.set(alarmId, req.identifier);
      }
    }

    for (const alarm of pending) {
      if (alarm.triggerType === 'TIME' && alarm.dateTime) {
        const alarmTime = new Date(alarm.dateTime).getTime();
        if (alarmTime > now) {
          // Om inte redan schemalagd i OS, schemalägg nu
          if (!scheduledMap.has(alarm.id)) {
            try {
              const notificationId = await Notifications.scheduleNotificationAsync({
                content: {
                  title: '⏰ Alarm (Återställt efter omstart)',
                  body: alarm.content,
                  sound: true,
                  priority: Notifications.AndroidNotificationPriority.MAX,
                  data: { alarmId: alarm.id, triggerType: 'TIME' },
                },
                trigger: {
                  type: Notifications.SchedulableTriggerInputTypes.DATE,
                  date: new Date(alarm.dateTime),
                  channelId: ALARM_CHANNEL_ID,
                },
              });
              saveAlarm({ ...alarm, notificationId });
              restoredCount++;
            } catch (schedErr) {
              console.warn(`[Notifications] Kunde inte schemalägga larm ${alarm.id}:`, schedErr);
            }
          } else {
            // Den är redan schemalagd i OS – se till att DB har rätt ID
            const existingNotifId = scheduledMap.get(alarm.id);
            if (existingNotifId && alarm.notificationId !== existingNotifId) {
              saveAlarm({ ...alarm, notificationId: existingNotifId });
            }
          }
        } else {
          // Förfallet under tiden telefonen var avstängd
          updateAlarmStatus(alarm.id, 'FIRED_LOCALLY');
        }
      }
    }

    try {
      const battery = await getBatterySnapshot();
      logDiagnosticEvent({
        timestamp: new Date().toISOString(),
        eventType: 'BOOT_RESTORE_TRIGGERED',
        targetId: 'SYSTEM',
        batteryLevel: battery.batteryLevel,
        isCharging: battery.isCharging,
        lowPowerMode: battery.lowPowerMode,
        lifecycleState: 'TERMINATED_WAKEUP',
        note: `Återställde ${restoredCount} larm efter systemomstart.`,
      });
    } catch (diagErr) {
      console.warn('[Notifications] Kunde inte logga diagnostik för återställning:', diagErr);
    }

    return restoredCount;
  } catch (err) {
    console.warn('[Notifications] Övergripande fel i restoreAlarmsOnBoot:', err);
    return 0;
  }
}
