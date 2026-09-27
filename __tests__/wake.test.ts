import {
  awakeSkips,
  buildSeriesTimes,
  describeDays,
  nextWakeOccurrence,
  planKeyOf,
  planSchedule,
  SKIP_COVER_WEEKS,
  upcomingOccurrence,
  WakeAlarm,
} from '../src/logic/wake';

// Fredag 2026-09-25 20:00
const fri = new Date(2026, 8, 25, 20, 0);

function wake(overrides: Partial<WakeAlarm> = {}): WakeAlarm {
  return {
    id: 'w1',
    hour: 6,
    minute: 30,
    label: '',
    weekdays: [2, 3, 4, 5, 6],
    enabled: true,
    skipUntil: null,
    seriesId: null,
    seriesIndex: 0,
    osIds: [],
    planKey: null,
    nextFireAt: null,
    createdAt: fri.toISOString(),
    ...overrides,
  };
}

describe('describeDays', () => {
  it('känner igen vanliga mönster', () => {
    expect(describeDays([2, 3, 4, 5, 6])).toBe('Vardagar');
    expect(describeDays([1, 2, 3, 4, 5, 6, 7])).toBe('Varje dag');
    expect(describeDays([7, 1])).toBe('Helger');
    expect(describeDays([])).toBe('En gång');
    expect(describeDays([4, 2])).toBe('Mån, Ons');
  });
});

describe('nextWakeOccurrence', () => {
  it('vardagslarm en fredagskväll ringer måndag', () => {
    const next = nextWakeOccurrence(wake(), fri)!;
    expect([next.getDay(), next.getDate(), next.getHours(), next.getMinutes()]).toEqual([1, 28, 6, 30]);
  });

  it('avstängt larm ringer aldrig', () => {
    expect(nextWakeOccurrence(wake({ enabled: false }), fri)).toBeNull();
  });

  it('överhoppat tillfälle hoppas över', () => {
    const monday = upcomingOccurrence(wake(), fri);
    const skipped = wake({ skipUntil: new Date(monday.getTime() + 60_000).toISOString() });
    expect(nextWakeOccurrence(skipped, fri)!.getDate()).toBe(29); // tisdag
  });

  it('engångslarm som redan ringt är inte längre aktivt', () => {
    const past = new Date(fri.getTime() - 3600_000).toISOString();
    expect(nextWakeOccurrence(wake({ weekdays: [], nextFireAt: past }), fri)).toBeNull();
  });
});

describe('planSchedule', () => {
  it('vanligt återkommande larm = en återkommande plan', () => {
    const plan = planSchedule(wake(), fri);
    expect(plan.repeating?.weekdays).toEqual([2, 3, 4, 5, 6]);
    expect(plan.fixed).toEqual([]);
  });

  it('engångslarm = ett enskilt tillfälle', () => {
    const plan = planSchedule(wake({ weekdays: [] }), fri);
    expect(plan.repeating).toBeNull();
    expect(plan.fixed).toHaveLength(1);
    expect(plan.fixed[0].getDate()).toBe(26);
  });

  it('hoppa över måndag: måndag tas ur serien och täcks med enskilda larm från nästa vecka', () => {
    const monday = upcomingOccurrence(wake(), fri);
    const plan = planSchedule(wake({ skipUntil: new Date(monday.getTime() + 60_000).toISOString() }), fri);
    expect(plan.repeating?.weekdays).toEqual([3, 4, 5, 6]);
    expect(plan.fixed).toHaveLength(SKIP_COVER_WEEKS);
    expect(plan.fixed.every((d) => d.getDay() === 1 && d.getHours() === 6)).toBe(true);
    expect(plan.fixed[0].getDate()).toBe(5); // måndag 5 oktober, inte 28 september
  });

  it('när överhoppningen passerat blir planen återkommande igen (ny planKey)', () => {
    const monday = upcomingOccurrence(wake(), fri);
    const alarm = wake({ skipUntil: new Date(monday.getTime() + 60_000).toISOString() });
    const during = planKeyOf(planSchedule(alarm, fri));
    const after = planKeyOf(planSchedule(alarm, new Date(monday.getTime() + 3600_000)));
    expect(after).not.toBe(during);
    expect(after).toBe(planKeyOf(planSchedule(wake(), fri)));
  });

  it('avstängt larm = ingenting', () => {
    expect(planSchedule(wake({ enabled: false }), fri)).toEqual({ repeating: null, fixed: [] });
  });
});

describe('väckningsserie', () => {
  it('bygger klockslag med intervall, även över midnatt', () => {
    expect(buildSeriesTimes(6, 0, 3, 10)).toEqual([
      { hour: 6, minute: 0 },
      { hour: 6, minute: 10 },
      { hour: 6, minute: 20 },
    ]);
    expect(buildSeriesTimes(23, 50, 2, 15)[1]).toEqual({ hour: 0, minute: 5 });
  });

  it('"Jag är vaken" hoppar bara över larm inom fönstret', () => {
    const sat = new Date(2026, 8, 26, 6, 5); // lördag 06:05
    const series = [
      wake({ id: 'a', hour: 6, minute: 0, weekdays: [1, 2, 3, 4, 5, 6, 7] }),
      wake({ id: 'b', hour: 6, minute: 10, weekdays: [1, 2, 3, 4, 5, 6, 7] }),
      wake({ id: 'c', hour: 6, minute: 20, weekdays: [1, 2, 3, 4, 5, 6, 7] }),
    ];
    const skips = awakeSkips(series, sat);
    expect([...skips.keys()]).toEqual(['b', 'c']); // a har redan ringt – nästa är imorgon
    expect(new Date(skips.get('b')!).getMinutes()).toBe(11);
  });
});
