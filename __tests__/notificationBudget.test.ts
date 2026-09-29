import { budgetCandidates, nextTimedRing, planBudget, slotCost } from '../src/logic/notificationBudget';
import { LocalAlarm } from '../src/types';

const now = new Date(2026, 8, 29, 12, 0);

function alarm(id: string, at: Date, overrides: Partial<LocalAlarm> = {}): LocalAlarm {
  return {
    id,
    creatorId: 'ME',
    recipientId: 'ME',
    content: id,
    triggerType: 'TIME',
    dateTime: at.toISOString(),
    repeat: 'NONE',
    status: 'SCHEDULED',
    createdAt: now.toISOString(),
    ...overrides,
  };
}

const day = (d: number, h = 9) => new Date(2026, 8, 29 + d, h, 0);

describe('slotCost', () => {
  it('vardagar tar fem platser, övriga en', () => {
    expect(slotCost(alarm('a', day(1), { repeat: 'WEEKDAYS' }))).toBe(5);
    expect(slotCost(alarm('b', day(1), { repeat: 'DAILY' }))).toBe(1);
    expect(slotCost(alarm('c', day(1)))).toBe(1);
  });
});

describe('nextTimedRing', () => {
  it('tar med schemalagda tidslarm och uppföljningar före sin tid', () => {
    expect(nextTimedRing(alarm('a', day(1)), now)).toEqual(day(1));
    const followUp = alarm('f', day(2), {
      triggerType: 'EXIT_LOCATION',
      status: 'ACTIVE_GEOFENCE',
      location: { id: 'p', name: 'Jobbet', latitude: 59, longitude: 18, radius: 150 },
    });
    expect(nextTimedRing(followUp, now)).toEqual(day(2));
    expect(nextTimedRing({ ...followUp, dateTime: day(-1).toISOString() }, now)).toBeNull();
  });

  it('utelämnar passerade, klara och vanliga platslarm', () => {
    expect(nextTimedRing(alarm('a', day(-1)), now)).toBeNull();
    expect(nextTimedRing(alarm('b', day(1), { status: 'DONE' }), now)).toBeNull();
    expect(
      nextTimedRing(alarm('c', day(1), { triggerType: 'ENTER_LOCATION', status: 'ACTIVE_GEOFENCE', dateTime: null }), now)
    ).toBeNull();
  });
});

describe('planBudget', () => {
  it('behåller de närmast kommande tills platserna tar slut', () => {
    const alarms = [alarm('långt', day(30)), alarm('snart', day(1)), alarm('mitten', day(10))];
    expect([...planBudget(budgetCandidates(alarms, now), 2)]).toEqual(['snart', 'mitten']);
  });

  it('hoppar inte över ett tidigare larm som inte får plats', () => {
    const alarms = [alarm('vardag', day(1), { repeat: 'WEEKDAYS' }), alarm('senare', day(5))];
    expect([...planBudget(budgetCandidates(alarms, now), 4)]).toEqual([]);
  });

  it('allt får plats när det finns utrymme', () => {
    const alarms = Array.from({ length: 10 }, (_, i) => alarm(`a${i}`, day(i + 1)));
    expect(planBudget(budgetCandidates(alarms, now), 60).size).toBe(10);
  });

  it('inga platser ger ingenting', () => {
    expect(planBudget(budgetCandidates([alarm('a', day(1))], now), 0).size).toBe(0);
  });
});
