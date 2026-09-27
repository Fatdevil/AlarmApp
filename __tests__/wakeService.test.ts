import { WakeAlarm } from '../src/logic/wake';

const store = new Map<string, WakeAlarm>();
jest.mock('../src/services/db', () => ({
  getWakeAlarm: jest.fn((id: string) => store.get(id) ?? null),
  getWakeAlarms: jest.fn(() => [...store.values()]),
  saveWakeAlarm: jest.fn((a: WakeAlarm) => store.set(a.id, a)),
  deleteWakeAlarm: jest.fn((id: string) => store.delete(id)),
}));
let seq = 0;
jest.mock('../src/services/notifications', () => ({
  scheduleWakePlan: jest.fn(async (_w: unknown, plan: { repeating: unknown; fixed: Date[] }) => {
    const n = (plan.repeating ? 1 : 0) + plan.fixed.length;
    return Array.from({ length: n }, () => `os-${++seq}`);
  }),
  scheduleWakeSnooze: jest.fn(async () => 'snooze-1'),
  cancelNotifications: jest.fn(async () => {}),
  stillScheduled: jest.fn(async (ids: string[]) => ids),
}));
jest.mock('../src/services/diagnostics', () => ({ logEvent: jest.fn() }));
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` };
});

/* eslint-disable import/first */
import * as notif from '../src/services/notifications';
import {
  createWakeAlarms,
  imAwake,
  reconcileWakeAlarms,
  removeWakeAlarms,
  restoreWakeAlarms,
  setWakeEnabled,
  skipNextWake,
  wakeDismissed,
} from '../src/services/wake';
/* eslint-enable import/first */

const m = <T extends (...args: any[]) => any>(fn: T) => fn as unknown as jest.MockedFunction<T>;

// Lördag 2026-09-26 05:00
const sat5 = new Date(2026, 8, 26, 5, 0);
const everyDay = [1, 2, 3, 4, 5, 6, 7];

beforeEach(() => {
  store.clear();
  jest.clearAllMocks();
});

describe('createWakeAlarms', () => {
  it('skapar en serie med gemensamt seriesId och rätt klockslag', async () => {
    const created = await createWakeAlarms(
      { hour: 6, minute: 0, label: 'Jobb', weekdays: everyDay },
      { count: 4, intervalMinutes: 10 },
      sat5
    );
    expect(created.map((a) => `${a.hour}:${a.minute}`)).toEqual(['6:0', '6:10', '6:20', '6:30']);
    expect(new Set(created.map((a) => a.seriesId)).size).toBe(1);
    expect(created[0].seriesId).not.toBeNull();
    expect(created.every((a) => a.osIds.length === 1 && a.planKey)).toBe(true);
  });

  it('rullar tillbaka hela serien om ett larm inte kan schemaläggas', async () => {
    m(notif.scheduleWakePlan)
      .mockResolvedValueOnce(['a'])
      .mockResolvedValueOnce(['b'])
      .mockRejectedValueOnce(new Error('OS nej'));
    await expect(
      createWakeAlarms({ hour: 6, minute: 0, label: '', weekdays: everyDay }, { count: 3, intervalMinutes: 5 }, sat5)
    ).rejects.toThrow('OS nej');
    expect(store.size).toBe(0);
    expect(notif.cancelNotifications).toHaveBeenCalledWith(['a']);
    expect(notif.cancelNotifications).toHaveBeenCalledWith(['b']);
  });

  it('engångslarm får ett nextFireAt', async () => {
    const [a] = await createWakeAlarms({ hour: 7, minute: 30, label: '', weekdays: [] }, undefined, sat5);
    expect(new Date(a.nextFireAt!).getHours()).toBe(7);
  });
});

describe('ändringar', () => {
  it('schemalägger nya planen före den gamla avbryts', async () => {
    const [a] = await createWakeAlarms({ hour: 6, minute: 0, label: '', weekdays: everyDay }, undefined, sat5);
    jest.clearAllMocks();
    await skipNextWake(a.id, sat5);
    const scheduled = m(notif.scheduleWakePlan).mock.invocationCallOrder[0];
    const cancelled = m(notif.cancelNotifications).mock.invocationCallOrder[0];
    expect(scheduled).toBeLessThan(cancelled);
    expect(notif.cancelNotifications).toHaveBeenCalledWith(a.osIds);
    expect(store.get(a.id)!.skipUntil).not.toBeNull();
  });

  it('avstängning schemalägger ingenting', async () => {
    const [a] = await createWakeAlarms({ hour: 6, minute: 0, label: '', weekdays: everyDay }, undefined, sat5);
    await setWakeEnabled(a.id, false, sat5);
    expect(store.get(a.id)!.enabled).toBe(false);
    expect(store.get(a.id)!.osIds).toEqual([]);
  });

  it('radera + ångra återskapar larmet i OS', async () => {
    const [a] = await createWakeAlarms({ hour: 6, minute: 0, label: '', weekdays: everyDay }, undefined, sat5);
    const removed = await removeWakeAlarms([a.id]);
    expect(store.size).toBe(0);
    await restoreWakeAlarms(removed, sat5);
    expect(store.get(a.id)!.osIds.length).toBe(1);
  });
});

describe('Jag är vaken', () => {
  it('hoppar över resten av serien inom tre timmar', async () => {
    const series = await createWakeAlarms(
      { hour: 6, minute: 0, label: '', weekdays: everyDay },
      { count: 3, intervalMinutes: 10 },
      sat5
    );
    const at0601 = new Date(2026, 8, 26, 6, 1);
    const n = await imAwake(series[0].seriesId!, at0601);
    expect(n).toBe(2); // 06:10 och 06:20 (06:00 har redan ringt)
    expect(store.get(series[0].id)!.skipUntil).toBeNull();
    expect(store.get(series[1].id)!.skipUntil).not.toBeNull();
    expect(store.get(series[2].id)!.skipUntil).not.toBeNull();
  });

  it('"Klar" på ett engångslarm stänger av det', async () => {
    const [a] = await createWakeAlarms({ hour: 5, minute: 30, label: '', weekdays: [] }, undefined, sat5);
    await wakeDismissed(a.id, new Date(2026, 8, 26, 5, 31));
    expect(store.get(a.id)!.enabled).toBe(false);
  });
});

describe('reconcileWakeAlarms', () => {
  it('stänger av engångslarm som har ringt', async () => {
    const [a] = await createWakeAlarms({ hour: 5, minute: 30, label: '', weekdays: [] }, undefined, sat5);
    await reconcileWakeAlarms(new Date(2026, 8, 26, 9, 0));
    expect(store.get(a.id)!.enabled).toBe(false);
  });

  it('återställer serien när en överhoppning har passerat', async () => {
    const [a] = await createWakeAlarms({ hour: 6, minute: 0, label: '', weekdays: everyDay }, undefined, sat5);
    await skipNextWake(a.id, sat5);
    const skippedKey = store.get(a.id)!.planKey;
    jest.clearAllMocks();
    await reconcileWakeAlarms(new Date(2026, 8, 26, 12, 0));
    expect(notif.scheduleWakePlan).toHaveBeenCalledTimes(1);
    expect(store.get(a.id)!.planKey).not.toBe(skippedKey);
  });

  it('gör ingenting när allt redan stämmer', async () => {
    await createWakeAlarms({ hour: 6, minute: 0, label: '', weekdays: everyDay }, undefined, sat5);
    jest.clearAllMocks();
    await expect(reconcileWakeAlarms(sat5)).resolves.toBe(0);
    expect(notif.scheduleWakePlan).not.toHaveBeenCalled();
  });

  it('schemalägger om larm som saknas i OS', async () => {
    await createWakeAlarms({ hour: 6, minute: 0, label: '', weekdays: everyDay }, undefined, sat5);
    m(notif.stillScheduled).mockResolvedValueOnce([]);
    await expect(reconcileWakeAlarms(sat5)).resolves.toBe(1);
  });
});
