import { LocalAlarm } from '../src/types';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  scheduleNotificationAsync: jest.fn(async () => 'notif-1'),
  cancelScheduledNotificationAsync: jest.fn(),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily', WEEKLY: 'weekly' },
  AndroidNotificationPriority: { MAX: 'max' },
}));
jest.mock('../modules/native-alarm', () => ({
  getNativeAlarmAuthorization: jest.fn(async () => 'authorized'),
  scheduleNativeAlarm: jest.fn(async () => {}),
  cancelNativeAlarm: jest.fn(async () => {}),
  getScheduledNativeAlarmIds: jest.fn(async () => []),
}));

/* eslint-disable import/first */
import * as Notifications from 'expo-notifications';
import * as Native from '../modules/native-alarm';
import {
  cancelNotifications,
  getScheduledByAlarm,
  scheduleTimeAlarm,
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
