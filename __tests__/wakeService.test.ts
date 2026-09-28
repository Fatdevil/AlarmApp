import { WakeAlarm } from '../src/logic/wake';

const mockStore = new Map<string, WakeAlarm>();
jest.mock('../src/services/db', () => ({
  getWakeAlarm: jest.fn((id: string) => mockStore.get(id) ?? null),
  getWakeAlarms: jest.fn(() => [...mockStore.values()]),
  saveWakeAlarm: jest.fn((a: WakeAlarm) => mockStore.set(a.id, a)),
  deleteWakeAlarm: jest.fn((id: string) => mockStore.delete(id)),
}));
let mockSeq = 0;
jest.mock('../src/services/notifications', () => ({
  scheduleWakePlan: jest.fn(async (_w: unknown, plan: { repeating: unknown; fixed: Date[] }) => {
    const n = (plan.repeating ? 1 : 0) + plan.fixed.length;
    return Array.from({ length: n }, () => `os-${++mockSeq}`);
  }),
  scheduleWakeSnooze: jest.fn(async () => 'snooze-1'),
  cancelNotifications: jest.fn(async () => {}),
  cancelNotificationsBestEffort: jest.fn(async () => {}),
  CancelNotificationsError: class MockCancelError extends Error {
    failedIds: string[];
    constructor(ids: string[]) {
      super('cancel');
      this.failedIds = ids;
    }
  },
  retryPendingAlarmCancellations: jest.fn(async () => 0),
  stillScheduled: jest.fn(async (ids: string[]) => ids),
  hasPendingNativeSnooze: jest.fn(async () => false),
}));
jest.mock('../src/services/diagnostics', () => ({ logEvent: jest.fn() }));
jest.mock('../modules/native-alarm', () => ({
  consumeNativeSkips: jest.fn(async () => new Map()),
}));
jest.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` };
});

/* eslint-disable import/first */
import * as Native from '../modules/native-alarm';
import * as db from '../src/services/db';
import * as notif from '../src/services/notifications';
import {
  createWakeAlarms,
  imAwake,
  reconcileWakeAlarms,
  removeWakeAlarms,
  restoreWakeAlarms,
  setWakeEnabled,
  skipNextWake,
  snoozeWake,
  updateWakeAlarm,
  wakeDismissed,
} from '../src/services/wake';
/* eslint-enable import/first */

const MockCancelError = jest.requireMock('../src/services/notifications').CancelNotificationsError as new (
  ids: string[]
) => Error & { failedIds: string[] };

const m = <T extends (...args: any[]) => any>(fn: T) => fn as unknown as jest.MockedFunction<T>;

// Lördag 2026-09-26 05:00
const sat5 = new Date(2026, 8, 26, 5, 0);
const everyDay = [1, 2, 3, 4, 5, 6, 7];

beforeEach(() => {
  mockStore.clear();
  jest.clearAllMocks();
  // clearAllMocks tömmer inte köade *Once-svar – återställ så att inget läcker mellan tester
  m(notif.cancelNotifications).mockReset().mockImplementation(async () => {});
  m(notif.stillScheduled).mockReset().mockImplementation(async (ids: string[]) => ids);
  m(notif.hasPendingNativeSnooze).mockReset().mockImplementation(async () => false);
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
    expect(mockStore.size).toBe(0);
    expect(notif.cancelNotificationsBestEffort).toHaveBeenCalledWith(['a']);
    expect(notif.cancelNotificationsBestEffort).toHaveBeenCalledWith(['b']);
  });

  it('lämnar misslyckade rollback-avbokningar till den beständiga kön', async () => {
    m(notif.scheduleWakePlan)
      .mockResolvedValueOnce(['first-os-id'])
      .mockRejectedValueOnce(new Error('andra larmet kunde inte schemaläggas'));

    await expect(
      createWakeAlarms({ hour: 6, minute: 0, label: '', weekdays: everyDay }, { count: 2, intervalMinutes: 5 }, sat5)
    ).rejects.toThrow('andra larmet kunde inte schemaläggas');

    // cancelNotificationsBestEffort ansvarar för att beständigt köa ett ID som
    // OS inte kan avboka; dess separata tester verifierar både köning och retry.
    expect(notif.cancelNotificationsBestEffort).toHaveBeenCalledWith(['first-os-id']);
    expect(mockStore.size).toBe(0);
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
    expect(mockStore.get(a.id)!.skipUntil).not.toBeNull();
  });

  it('avstängning schemalägger ingenting', async () => {
    const [a] = await createWakeAlarms({ hour: 6, minute: 0, label: '', weekdays: everyDay }, undefined, sat5);
    await setWakeEnabled(a.id, false, sat5);
    expect(mockStore.get(a.id)!.enabled).toBe(false);
    expect(mockStore.get(a.id)!.osIds).toEqual([]);
  });

  it('radera + ångra återskapar larmet i OS', async () => {
    const [a] = await createWakeAlarms({ hour: 6, minute: 0, label: '', weekdays: everyDay }, undefined, sat5);
    const removed = await removeWakeAlarms([a.id]);
    expect(mockStore.size).toBe(0);
    await restoreWakeAlarms(removed, sat5);
    expect(mockStore.get(a.id)!.osIds.length).toBe(1);
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
    expect(mockStore.get(series[0].id)!.skipUntil).toBeNull();
    expect(mockStore.get(series[1].id)!.skipUntil).not.toBeNull();
    expect(mockStore.get(series[2].id)!.skipUntil).not.toBeNull();
  });

  it('"Klar" på ett engångslarm stänger av det', async () => {
    const [a] = await createWakeAlarms({ hour: 5, minute: 30, label: '', weekdays: [] }, undefined, sat5);
    await wakeDismissed(a.id, new Date(2026, 8, 26, 5, 31));
    expect(mockStore.get(a.id)!.enabled).toBe(false);
  });
});

describe('reconcileWakeAlarms', () => {
  it('försöker tömma den beständiga rollback-kön vid avstämning', async () => {
    await reconcileWakeAlarms(sat5);
    expect(notif.retryPendingAlarmCancellations).toHaveBeenCalledTimes(1);
  });

  it('stänger av engångslarm som har ringt', async () => {
    const [a] = await createWakeAlarms({ hour: 5, minute: 30, label: '', weekdays: [] }, undefined, sat5);
    await reconcileWakeAlarms(new Date(2026, 8, 26, 9, 0));
    expect(mockStore.get(a.id)!.enabled).toBe(false);
  });

  it('återställer serien när en överhoppning har passerat', async () => {
    const [a] = await createWakeAlarms({ hour: 6, minute: 0, label: '', weekdays: everyDay }, undefined, sat5);
    await skipNextWake(a.id, sat5);
    const skippedKey = mockStore.get(a.id)!.planKey;
    jest.clearAllMocks();
    await reconcileWakeAlarms(new Date(2026, 8, 26, 12, 0));
    expect(notif.scheduleWakePlan).toHaveBeenCalledTimes(1);
    expect(mockStore.get(a.id)!.planKey).not.toBe(skippedKey);
  });

  it('gör ingenting när allt redan stämmer', async () => {
    await createWakeAlarms({ hour: 6, minute: 0, label: '', weekdays: everyDay }, undefined, sat5);
    jest.clearAllMocks();
    await expect(reconcileWakeAlarms(sat5)).resolves.toBe(0);
    expect(notif.scheduleWakePlan).not.toHaveBeenCalled();
  });

  it('behåller snoozen på ett engångslarm som redan har ringt', async () => {
    const [a] = await createWakeAlarms({ hour: 5, minute: 30, label: '', weekdays: [] }, undefined, sat5);
    await snoozeWake(a.id, new Date(2026, 8, 26, 5, 31));
    jest.clearAllMocks();

    await reconcileWakeAlarms(new Date(2026, 8, 26, 5, 32));
    expect(mockStore.get(a.id)!.enabled).toBe(true);
    expect(mockStore.get(a.id)!.osIds).toContain('snooze-1');
    expect(notif.cancelNotifications).not.toHaveBeenCalled();
    expect(notif.scheduleWakePlan).not.toHaveBeenCalled();

    // När snoozen har ringt stängs larmet av som vanligt
    await reconcileWakeAlarms(new Date(2026, 8, 26, 5, 45));
    expect(mockStore.get(a.id)!.enabled).toBe(false);
  });

  it('snooze efter en samtidig avstämning slår på engångslarmet igen', async () => {
    const [a] = await createWakeAlarms({ hour: 5, minute: 30, label: '', weekdays: [] }, undefined, sat5);
    const at = new Date(2026, 8, 26, 5, 31);
    // Knappen öppnar appen: avstämningen hinner starta före snoozen
    await Promise.all([reconcileWakeAlarms(at), snoozeWake(a.id, at)]);
    expect(mockStore.get(a.id)!.enabled).toBe(true);
    expect(mockStore.get(a.id)!.osIds).toEqual(['snooze-1']);

    jest.clearAllMocks();
    await reconcileWakeAlarms(new Date(2026, 8, 26, 5, 32));
    expect(notif.cancelNotifications).not.toHaveBeenCalled();
  });

  it('avbryter inte en snooze som Android själv har lagt på ett engångslarm', async () => {
    const [a] = await createWakeAlarms({ hour: 5, minute: 30, label: '', weekdays: [] }, undefined, sat5);
    jest.clearAllMocks();
    m(notif.hasPendingNativeSnooze).mockResolvedValueOnce(true);

    await reconcileWakeAlarms(new Date(2026, 8, 26, 5, 32));
    expect(notif.cancelNotifications).not.toHaveBeenCalled();
    expect(mockStore.get(a.id)!.enabled).toBe(true);

    // Snoozen har ringt → stängs av som vanligt
    await reconcileWakeAlarms(new Date(2026, 8, 26, 5, 45));
    expect(mockStore.get(a.id)!.enabled).toBe(false);
  });

  it('avstängning: gamla ID:n som inte gick att avboka väntar separat och avbokas vid nästa avstämning', async () => {
    const [a] = await createWakeAlarms({ hour: 6, minute: 0, label: '', weekdays: everyDay }, undefined, sat5);
    const oldIds = mockStore.get(a.id)!.osIds;
    m(notif.cancelNotifications).mockRejectedValueOnce(new MockCancelError(oldIds));

    await setWakeEnabled(a.id, false, sat5);
    expect(mockStore.get(a.id)!.enabled).toBe(false);
    expect(mockStore.get(a.id)!.osIds).toEqual([]);
    expect(mockStore.get(a.id)!.pendingCancellationIds).toEqual(oldIds);

    await reconcileWakeAlarms(sat5);
    expect(notif.cancelNotifications).toHaveBeenLastCalledWith(oldIds);
    expect(mockStore.get(a.id)!.pendingCancellationIds).toEqual([]);
  });

  describe('aktiv tidsändring där avbokningen av det gamla schemat misslyckas', () => {
    it('det nya schemat gäller, det gamla väntar separat och räknas inte som aktuellt', async () => {
      const [a] = await createWakeAlarms({ hour: 6, minute: 0, label: '', weekdays: everyDay }, undefined, sat5);
      const oldIds = mockStore.get(a.id)!.osIds;
      m(notif.cancelNotifications).mockRejectedValueOnce(new MockCancelError(oldIds));

      await updateWakeAlarm(a.id, { hour: 7, minute: 15, label: '', weekdays: everyDay }, sat5);
      const updated = mockStore.get(a.id)!;
      expect(updated.hour).toBe(7);
      expect(updated.enabled).toBe(true);
      expect(updated.osIds).toHaveLength(1);
      expect(updated.osIds).not.toEqual(oldIds);
      expect(updated.pendingCancellationIds).toEqual(oldIds);

      // Det gamla schemat finns kvar i OS, men det nya saknas: avstämningen ska
      // schemalägga om det nya – inte luras av det gamla ID:t
      jest.clearAllMocks();
      m(notif.stillScheduled).mockImplementationOnce(async (ids: string[]) =>
        ids.filter((id) => oldIds.includes(id))
      );
      m(notif.cancelNotifications).mockRejectedValueOnce(new MockCancelError(oldIds)); // fortfarande fel
      await reconcileWakeAlarms(sat5);
      expect(notif.scheduleWakePlan).toHaveBeenCalledTimes(1);
      expect(mockStore.get(a.id)!.pendingCancellationIds).toEqual(oldIds);
    });

    it('nästa start avbokar det gamla schemat och tömmer listan', async () => {
      const [a] = await createWakeAlarms({ hour: 6, minute: 0, label: '', weekdays: everyDay }, undefined, sat5);
      const oldIds = mockStore.get(a.id)!.osIds;
      m(notif.cancelNotifications).mockRejectedValueOnce(new MockCancelError(oldIds));
      await updateWakeAlarm(a.id, { hour: 7, minute: 15, label: '', weekdays: everyDay }, sat5);
      const newIds = mockStore.get(a.id)!.osIds;

      jest.clearAllMocks();
      await reconcileWakeAlarms(sat5);
      expect(notif.cancelNotifications).toHaveBeenCalledWith(oldIds);
      expect(notif.cancelNotifications).not.toHaveBeenCalledWith(newIds);
      expect(mockStore.get(a.id)!.pendingCancellationIds).toEqual([]);
      expect(mockStore.get(a.id)!.osIds).toEqual(newIds);
    });
  });

  describe('serieradering där avbokning nummer två misslyckas', () => {
    it('ingen rad raderas, avbokade larm schemaläggs om och felet kastas', async () => {
      const series = await createWakeAlarms(
        { hour: 6, minute: 0, label: '', weekdays: everyDay },
        { count: 3, intervalMinutes: 10 },
        sat5
      );
      const before = series.map((a) => mockStore.get(a.id)!);
      m(notif.cancelNotifications)
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new MockCancelError(before[1].osIds))
        .mockResolvedValueOnce(undefined);
      jest.spyOn(console, 'warn').mockImplementation(() => {});

      await expect(removeWakeAlarms(series.map((a) => a.id), sat5)).rejects.toBeInstanceOf(MockCancelError);

      expect(mockStore.size).toBe(3);
      expect(db.deleteWakeAlarm).not.toHaveBeenCalled();
      // Larm 1 och 3 avbokades – de schemaläggs om så att serien fortfarande ringer
      expect(mockStore.get(series[0].id)!.osIds).toHaveLength(1);
      expect(mockStore.get(series[0].id)!.osIds).not.toEqual(before[0].osIds);
      expect(mockStore.get(series[2].id)!.osIds).not.toEqual(before[2].osIds);
      // Larm 2 avbokades aldrig – det är oförändrat
      expect(mockStore.get(series[1].id)!.osIds).toEqual(before[1].osIds);
      expect(mockStore.get(series[1].id)!.pendingCancellationIds).toEqual([]);
    });

    it('när avbokningen sedan lyckas raderas hela serien', async () => {
      const series = await createWakeAlarms(
        { hour: 6, minute: 0, label: '', weekdays: everyDay },
        { count: 3, intervalMinutes: 10 },
        sat5
      );
      m(notif.cancelNotifications).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new MockCancelError(['x']));
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      await expect(removeWakeAlarms(series.map((a) => a.id), sat5)).rejects.toBeDefined();

      const removed = await removeWakeAlarms(series.map((a) => a.id), sat5);
      expect(removed).toHaveLength(3);
      expect(mockStore.size).toBe(0);
    });

    it('delvis misslyckad avbokning: det som hann avbokas schemaläggs om, resten väntar', async () => {
      const [a] = await createWakeAlarms({ hour: 6, minute: 0, label: '', weekdays: everyDay }, undefined, sat5);
      await skipNextWake(a.id, sat5); // flera OS-ID:n (serie + ersättningslarm)
      const ids = mockStore.get(a.id)!.osIds;
      expect(ids.length).toBeGreaterThan(1);
      m(notif.cancelNotifications).mockRejectedValueOnce(new MockCancelError([ids[0]]));

      await expect(removeWakeAlarms([a.id], sat5)).rejects.toBeInstanceOf(MockCancelError);
      expect(db.deleteWakeAlarm).not.toHaveBeenCalled();
      const kept = mockStore.get(a.id)!;
      expect(kept.pendingCancellationIds).toEqual([ids[0]]);
      expect(kept.osIds.some((id) => ids.includes(id))).toBe(false);
      expect(kept.osIds.length).toBe(ids.length);
    });
  });

  it('schemalägger om larm som saknas i OS', async () => {
    await createWakeAlarms({ hour: 6, minute: 0, label: '', weekdays: everyDay }, undefined, sat5);
    m(notif.stillScheduled).mockResolvedValueOnce([]);
    await expect(reconcileWakeAlarms(sat5)).resolves.toBe(1);
  });
});

describe('väckningsserie – ordning och midnatt', () => {
  it('engångsserie som skapas efter första klockslaget hamnar i rätt ordning (hela serien imorgon)', async () => {
    const at0605 = new Date(2026, 8, 26, 6, 5);
    const created = await createWakeAlarms(
      { hour: 6, minute: 0, label: '', weekdays: [] },
      { count: 3, intervalMinutes: 10 },
      at0605
    );
    const fires = created.map((a) => new Date(a.nextFireAt!));
    expect(fires.map((d) => d.getDate())).toEqual([27, 27, 27]);
    expect(fires[0] < fires[1] && fires[1] < fires[2]).toBe(true);
  });

  it('larm efter midnatt i en vardagsserie ringer dagen efter (tis–lör)', async () => {
    const created = await createWakeAlarms(
      { hour: 23, minute: 50, label: '', weekdays: [2, 3, 4, 5, 6] },
      { count: 3, intervalMinutes: 10 },
      sat5
    );
    expect(created.map((a) => `${a.hour}:${a.minute}`)).toEqual(['23:50', '0:0', '0:10']);
    expect(created[0].weekdays).toEqual([2, 3, 4, 5, 6]);
    expect(created[1].weekdays).toEqual([3, 4, 5, 6, 7]);
    expect(created[2].weekdays).toEqual([3, 4, 5, 6, 7]);
  });

  it('engångsserie över midnatt ringer i ordning över dygnsgränsen', async () => {
    const created = await createWakeAlarms(
      { hour: 23, minute: 55, label: '', weekdays: [] },
      { count: 2, intervalMinutes: 10 },
      sat5
    );
    const [a, b] = created.map((x) => new Date(x.nextFireAt!));
    expect(b.getTime() - a.getTime()).toBe(10 * 60_000);
  });
});

describe('överhoppningar gjorda av Android', () => {
  it('förs över till databasen så att larmet inte schemaläggs igen', async () => {
    const [oneTime] = await createWakeAlarms({ hour: 6, minute: 10, label: '', weekdays: [] }, undefined, sat5);
    const [repeating] = await createWakeAlarms({ hour: 6, minute: 20, label: '', weekdays: everyDay }, undefined, sat5);
    // Låtsas att båda schemalades som systemlarm
    mockStore.set(oneTime.id, { ...mockStore.get(oneTime.id)!, osIds: ['native:aaa'] });
    mockStore.set(repeating.id, { ...mockStore.get(repeating.id)!, osIds: ['native:bbb'] });

    const at0601 = new Date(2026, 8, 26, 6, 1);
    (Native.consumeNativeSkips as jest.Mock).mockResolvedValueOnce(
      new Map([
        ['aaa', new Date(2026, 8, 26, 6, 11)],
        ['bbb', new Date(2026, 8, 26, 6, 21)],
      ])
    );
    m(notif.stillScheduled).mockImplementation(async (ids: string[]) =>
      ids.filter((id) => id !== 'native:aaa')
    );

    await reconcileWakeAlarms(at0601);
    expect(mockStore.get(oneTime.id)!.enabled).toBe(false);
    expect(mockStore.get(repeating.id)!.skipUntil).toBe(new Date(2026, 8, 26, 6, 21).toISOString());
    // Engångslarmet får inte schemaläggas på nytt
    const scheduledFor = m(notif.scheduleWakePlan).mock.calls.map(([w]) => (w as WakeAlarm).id);
    expect(scheduledFor.filter((id) => id === oneTime.id)).toHaveLength(1); // bara när det skapades
  });
});
