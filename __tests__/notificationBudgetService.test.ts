jest.mock('../src/services/db', () => ({
  getAlarmsByStatus: jest.fn(() => []),
  setNotificationIds: jest.fn(),
}));
jest.mock('../src/services/notifications', () => ({
  cancelReturningFailed: jest.fn(async () => []),
  getNotificationScheduleSummary: jest.fn(async () => ({ total: 0, snoozeIds: new Set<string>() })),
  getScheduledByAlarm: jest.fn(async () => new Map()),
  isNotificationBudgetLimited: jest.fn(async () => true),
  scheduleTimeAlarm: jest.fn(async () => ['ny']),
}));

/* eslint-disable import/first */
import * as db from '../src/services/db';
import { rebalanceNotificationBudget, shouldDeferScheduling } from '../src/services/notificationBudget';
import * as notif from '../src/services/notifications';
import { LocalAlarm } from '../src/types';
/* eslint-enable import/first */

const m = <T extends (...args: any[]) => any>(fn: T) => fn as unknown as jest.MockedFunction<T>;
const now = new Date(2026, 8, 29, 12, 0);

function alarm(id: string, daysAhead: number, notificationIds: string[] = []): LocalAlarm {
  return {
    id,
    creatorId: 'ME',
    recipientId: 'ME',
    content: id,
    triggerType: 'TIME',
    dateTime: new Date(2026, 8, 29 + daysAhead, 9, 0).toISOString(),
    repeat: 'NONE',
    status: 'SCHEDULED',
    createdAt: now.toISOString(),
    notificationIds,
  };
}

/** Ett larm senare idag, före alla i det fulla schemat. */
const soon = () => ({ ...alarm('snart', 0), dateTime: new Date(2026, 8, 29, 18, 0).toISOString() });

/** 60 larm (ett per dag) ligger i schemat – det är fullt (64 − 4 reserverade). */
function fullSchedule() {
  const alarms = Array.from({ length: 60 }, (_, i) => alarm(`a${String(i + 1).padStart(2, '0')}`, i + 1, [`n${i + 1}`]));
  const inOs = new Map(alarms.map((a) => [a.id, a.notificationIds!]));
  return { alarms, inOs };
}

function summary(total: number, snoozeIds: string[] = []) {
  m(notif.getNotificationScheduleSummary).mockResolvedValue({ total, snoozeIds: new Set(snoozeIds) });
}

beforeEach(() => {
  jest.clearAllMocks();
  m(notif.isNotificationBudgetLimited).mockResolvedValue(true);
  summary(0);
  m(notif.getScheduledByAlarm).mockResolvedValue(new Map());
  m(notif.cancelReturningFailed).mockResolvedValue([]);
  m(db.getAlarmsByStatus).mockReturnValue([]);
  m(db.setNotificationIds).mockImplementation(() => {});
});

describe('rebalanceNotificationBudget', () => {
  it('gör ingenting när ingen gräns gäller (Android, AlarmKit)', async () => {
    m(notif.isNotificationBudgetLimited).mockResolvedValue(false);
    m(db.getAlarmsByStatus).mockReturnValue([alarm('väntar', 3)]);
    await expect(rebalanceNotificationBudget(now)).resolves.toEqual({ added: 0, removed: 0 });
    expect(notif.scheduleTimeAlarm).not.toHaveBeenCalled();
  });

  it('lägger in väntande larm när det finns plats', async () => {
    m(db.getAlarmsByStatus).mockReturnValue([alarm('väntar', 3)]);
    await expect(rebalanceNotificationBudget(now)).resolves.toEqual({ added: 1, removed: 0 });
    expect(db.setNotificationIds).toHaveBeenCalledWith('väntar', ['ny']);
  });

  it('ett nytt tidigare larm tränger ut det som ligger längst fram', async () => {
    const { alarms, inOs } = fullSchedule();
    const earlier = soon();
    m(db.getAlarmsByStatus).mockReturnValue([...alarms, earlier]);
    m(notif.getScheduledByAlarm).mockResolvedValue(inOs);
    summary(60);

    await expect(rebalanceNotificationBudget(now)).resolves.toEqual({ added: 1, removed: 1 });
    expect(notif.cancelReturningFailed).toHaveBeenCalledWith(['n60']);
    expect(db.setNotificationIds).toHaveBeenCalledWith('a60', []);
    expect(db.setNotificationIds).toHaveBeenCalledWith('snart', ['ny']);
    // Utträngningen sker före inläggningen
    const cancelOrder = m(notif.cancelReturningFailed).mock.invocationCallOrder[0];
    const scheduleOrder = m(notif.scheduleTimeAlarm).mock.invocationCallOrder[0];
    expect(cancelOrder).toBeLessThan(scheduleOrder);
  });

  it('räknar med snoozar och andra notiser som tar plats', async () => {
    m(db.getAlarmsByStatus).mockReturnValue([alarm('väntar', 3)]);
    summary(60); // 60 notiser som inte hör till planen
    await expect(rebalanceNotificationBudget(now)).resolves.toEqual({ added: 0, removed: 0 });
  });

  it('en notis som iOS har kastat märks som väntande igen', async () => {
    m(db.getAlarmsByStatus).mockReturnValue([alarm('kastad', 3, ['borta'])]);
    // Finns inte i OS – planen säger att den ska in igen
    await rebalanceNotificationBudget(now);
    expect(db.setNotificationIds).toHaveBeenCalledWith('kastad', ['ny']);
  });

  it('en avbokning som misslyckas behåller sitt ID', async () => {
    const { alarms, inOs } = fullSchedule();
    m(db.getAlarmsByStatus).mockReturnValue([...alarms, soon()]);
    m(notif.getScheduledByAlarm).mockResolvedValue(inOs);
    summary(60);
    m(notif.cancelReturningFailed).mockResolvedValueOnce(['n60']);
    const r = await rebalanceNotificationBudget(now);
    expect(r.removed).toBe(0);
    expect(db.setNotificationIds).toHaveBeenCalledWith('a60', ['n60']);
  });
});

describe('snoozar och samtidighet', () => {
  it('en snooze tas aldrig ut, även när larmet trängs ut', async () => {
    const { alarms, inOs } = fullSchedule();
    inOs.set('a60', ['n60', 'snooze-60']);
    m(db.getAlarmsByStatus).mockReturnValue([...alarms, soon()]);
    m(notif.getScheduledByAlarm).mockResolvedValue(inOs);
    summary(61, ['snooze-60']);

    await rebalanceNotificationBudget(now);
    expect(notif.cancelReturningFailed).toHaveBeenCalledWith(['n60']);
    expect(db.setNotificationIds).toHaveBeenCalledWith('a60', ['snooze-60']);
  });

  it('snoozar räknas som upptagna platser', async () => {
    m(db.getAlarmsByStatus).mockReturnValue([alarm('väntar', 3)]);
    summary(60, Array.from({ length: 60 }, (_, i) => `s${i}`));
    await expect(rebalanceNotificationBudget(now)).resolves.toEqual({ added: 0, removed: 0 });
  });

  it('två samtidiga påfyllningar lägger inte in samma larm två gånger', async () => {
    // Databasen speglar det som schemaläggs, som i appen
    const waiting = alarm('väntar', 3);
    m(db.getAlarmsByStatus).mockImplementation(() => [waiting]);
    m(notif.getScheduledByAlarm).mockImplementation(async () =>
      waiting.notificationIds?.length ? new Map([[waiting.id, waiting.notificationIds]]) : new Map()
    );
    m(db.setNotificationIds).mockImplementation((_, ids) => {
      waiting.notificationIds = ids;
    });

    await Promise.all([rebalanceNotificationBudget(now), rebalanceNotificationBudget(now)]);
    expect(notif.scheduleTimeAlarm).toHaveBeenCalledTimes(1);
  });

  it('ett fel i en påfyllning stoppar inte nästa', async () => {
    m(notif.isNotificationBudgetLimited).mockRejectedValueOnce(new Error('iOS'));
    m(db.getAlarmsByStatus).mockReturnValue([alarm('väntar', 3)]);
    await expect(rebalanceNotificationBudget(now)).rejects.toThrow('iOS');
    await expect(rebalanceNotificationBudget(now)).resolves.toEqual({ added: 1, removed: 0 });
  });
});

describe('shouldDeferScheduling', () => {
  it('ett larm längre fram än ett fullt schema får vänta', async () => {
    const { alarms, inOs } = fullSchedule();
    m(db.getAlarmsByStatus).mockReturnValue(alarms);
    m(notif.getScheduledByAlarm).mockResolvedValue(inOs);
    summary(60);
    await expect(shouldDeferScheduling(alarm('långt', 90), now)).resolves.toBe(true);
    await expect(shouldDeferScheduling(soon(), now)).resolves.toBe(false);
  });

  it('väntar aldrig när ingen gräns gäller', async () => {
    m(notif.isNotificationBudgetLimited).mockResolvedValue(false);
    await expect(shouldDeferScheduling(alarm('långt', 90), now)).resolves.toBe(false);
  });
});
