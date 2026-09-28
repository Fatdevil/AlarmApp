import { LocalAlarm } from '../src/types';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  scheduleNotificationAsync: jest.fn(async () => 'notif-1'),
  cancelScheduledNotificationAsync: jest.fn(),
  cancelAllScheduledNotificationsAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily', WEEKLY: 'weekly' },
  AndroidNotificationPriority: { MAX: 'max' },
}));
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` };
});
jest.mock('../modules/native-alarm', () => ({
  getNativeAlarmAuthorization: jest.fn(async () => 'authorized'),
  scheduleNativeAlarm: jest.fn(async () => {}),
  cancelNativeAlarm: jest.fn(async () => {}),
  cancelAllNativeAlarms: jest.fn(async () => {}),
  getScheduledNativeAlarmIds: jest.fn(async () => []),
}));

/* eslint-disable import/first */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import * as Native from '../modules/native-alarm';
import { planSchedule, SKIP_COVER_WEEKS, WakeAlarm } from '../src/logic/wake';
import {
  cancelAllScheduledNotifications,
  CancelNotificationsError,
  cancelNotifications,
  getScheduledByAlarm,
  hasPendingNativeSnooze,
  scheduleTimeAlarm,
  scheduleWakePlan,
} from '../src/services/notifications';
/* eslint-enable import/first */

const UUID = '0b8f6c2e-1d2a-4c3b-9e8f-7a6b5c4d3e2f';
const future = new Date(Date.now() + 3600_000).toISOString();

function alarm(overrides: Partial<LocalAlarm> = {}): LocalAlarm {
  return {
    id: `alarm_${UUID}`,
    creatorId: 'ME',
    recipientId: 'ME',
    content: 'Väckning',
    triggerType: 'TIME',
    dateTime: future,
    repeat: 'NONE',
    status: 'SCHEDULED',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

beforeEach(() => jest.clearAllMocks());

/** Ett vardagslarm där nästa tillfälle har hoppats över. */
function skippedWake(): WakeAlarm {
  return {
    id: 'w1',
    hour: 6,
    minute: 30,
    label: 'Jobb',
    weekdays: [2, 3, 4, 5, 6],
    enabled: true,
    skipUntil: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    seriesId: null,
    seriesIndex: 0,
    osIds: [],
    pendingCancellationIds: [],
    planKey: null,
    nextFireAt: null,
    createdAt: new Date().toISOString(),
  };
}

describe('scheduleWakePlan vid "Hoppa över nästa"', () => {
  it('Android: ett enda återkommande systemlarm som startar efter överhoppningen', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    const wake = skippedWake();
    const ids = await scheduleWakePlan(wake, planSchedule(wake));
    expect(ids).toHaveLength(1);
    expect(Native.scheduleNativeAlarm).toHaveBeenCalledTimes(1);
    expect(Native.scheduleNativeAlarm).toHaveBeenCalledWith(
      expect.objectContaining({ weekdays: [2, 3, 4, 5, 6], startAt: new Date(wake.skipUntil!) })
    );
  });

  it('iOS: ersättningslarm där det sista säger att appen behöver öppnas', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    const wake = skippedWake();
    await scheduleWakePlan(wake, planSchedule(wake));
    const titles = (Native.scheduleNativeAlarm as jest.Mock).mock.calls
      .map(([spec]) => spec)
      .filter((spec) => spec.weekdays.length === 0)
      .map((spec) => spec.title);
    expect(titles).toHaveLength(SKIP_COVER_WEEKS);
    expect(titles.slice(0, -1).every((t: string) => t === 'Jobb')).toBe(true);
    expect(titles[titles.length - 1]).toContain('öppna appen');
  });
});

describe('cancelNotifications', () => {
  it('försöker med alla ID:n och rapporterar de som misslyckades', async () => {
    (Native.cancelNativeAlarm as jest.Mock).mockRejectedValueOnce(new Error('fel'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    const err = await cancelNotifications([`native:${UUID}`, 'notif-1']).catch((e) => e);
    expect(err).toBeInstanceOf(CancelNotificationsError);
    expect(err.failedIds).toEqual([`native:${UUID}`]);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notif-1');
  });
});

describe('scheduleTimeAlarm', () => {
  it('använder systemlarm när de är tillåtna, med larmets UUID', async () => {
    await expect(scheduleTimeAlarm(alarm())).resolves.toEqual([`native:${UUID}`]);
    expect(Native.scheduleNativeAlarm).toHaveBeenCalledWith(
      expect.objectContaining({ id: UUID, title: 'Väckning', weekdays: [] })
    );
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  it('skickar veckodagar för upprepning', async () => {
    await scheduleTimeAlarm(alarm({ repeat: 'WEEKDAYS' }));
    expect(Native.scheduleNativeAlarm).toHaveBeenCalledWith(
      expect.objectContaining({ weekdays: [2, 3, 4, 5, 6] })
    );
    await scheduleTimeAlarm(alarm({ repeat: 'DAILY' }));
    expect(Native.scheduleNativeAlarm).toHaveBeenLastCalledWith(
      expect.objectContaining({ weekdays: [1, 2, 3, 4, 5, 6, 7] })
    );
  });

  it('faller tillbaka till notis om systemlarm inte är tillåtna', async () => {
    (Native.getNativeAlarmAuthorization as jest.Mock).mockResolvedValueOnce('unavailable');
    await expect(scheduleTimeAlarm(alarm())).resolves.toEqual(['notif-1']);
    expect(Native.scheduleNativeAlarm).not.toHaveBeenCalled();
  });

  it('faller tillbaka till notis om systemlarmet misslyckas', async () => {
    (Native.scheduleNativeAlarm as jest.Mock).mockRejectedValueOnce(new Error('nej'));
    await expect(scheduleTimeAlarm(alarm())).resolves.toEqual(['notif-1']);
  });

  it('vägrar passerad tid för engångslarm', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    await expect(scheduleTimeAlarm(alarm({ dateTime: past }))).rejects.toThrow('passerat');
    expect(Native.scheduleNativeAlarm).not.toHaveBeenCalled();
  });
});

describe('cancelNotifications', () => {
  it('avbryter systemlarm och notiser via rätt API', async () => {
    await cancelNotifications([`native:${UUID}`, 'notif-1']);
    expect(Native.cancelNativeAlarm).toHaveBeenCalledWith(UUID);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notif-1');
  });
});

describe('getScheduledByAlarm', () => {
  it('matchar systemlarm (och Android-snooze) mot sparade ID:n', async () => {
    (Native.getScheduledNativeAlarmIds as jest.Mock).mockResolvedValueOnce([`${UUID}:snooze`]);
    const a = alarm({ notificationIds: [`native:${UUID}`] });
    const b = alarm({ id: 'alarm_other', notificationIds: ['native:ffffffff-ffff-4fff-8fff-ffffffffffff'] });
    const map = await getScheduledByAlarm([a, b]);
    expect(map.get(a.id)).toEqual([`native:${UUID}`]);
    expect(map.has(b.id)).toBe(false);
  });
});

describe('hasPendingNativeSnooze', () => {
  it('känner igen en snooze som Android lagt för ett systemlarm', async () => {
    (Native.getScheduledNativeAlarmIds as jest.Mock).mockResolvedValueOnce([`${UUID}:snooze`]);
    await expect(hasPendingNativeSnooze([`native:${UUID}`])).resolves.toBe(true);
  });

  it('ignorerar själva larmet och notis-ID:n', async () => {
    (Native.getScheduledNativeAlarmIds as jest.Mock).mockResolvedValueOnce([UUID]);
    await expect(hasPendingNativeSnooze([`native:${UUID}`, 'notif-1'])).resolves.toBe(false);
    await expect(hasPendingNativeSnooze(['notif-1'])).resolves.toBe(false);
  });
});

describe('cancelAllScheduledNotifications', () => {
  it('avbryter även systemlarm (annars ringer de efter "Radera all data")', async () => {
    await cancelAllScheduledNotifications();
    expect(Native.cancelAllNativeAlarms).toHaveBeenCalled();
    expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
  });
});

