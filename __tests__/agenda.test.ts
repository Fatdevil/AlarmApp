import {
  buildAgenda,
  dayKey,
  occurrencesBefore,
  parseDayKey,
  suggestedTimeForDay,
} from '../src/logic/agenda';
import { LocalAlarm } from '../src/types';

// Onsdag 2026-09-23 14:10 lokal tid
const wed = new Date(2026, 8, 23, 14, 10);

function timeAlarm(id: string, at: Date, repeat: LocalAlarm['repeat'] = 'NONE'): LocalAlarm {
  return {
    id,
    creatorId: 'ME',
    recipientId: 'ME',
    content: id,
    triggerType: 'TIME',
    dateTime: at.toISOString(),
    repeat,
    status: 'SCHEDULED',
    createdAt: wed.toISOString(),
  };
}

const place: LocalAlarm = {
  id: 'plats',
  creatorId: 'ME',
  recipientId: 'ME',
  content: 'Köp mjölk',
  triggerType: 'EXIT_LOCATION',
  location: { id: 'l', name: 'Jobbet', latitude: 59, longitude: 18, radius: 150 },
  status: 'ACTIVE_GEOFENCE',
  createdAt: wed.toISOString(),
};

describe('dayKey/parseDayKey', () => {
  it('använder lokal tid och går fram och tillbaka', () => {
    expect(dayKey(new Date(2026, 9, 3, 23, 59))).toBe('2026-10-03');
    expect(parseDayKey('2026-10-03')).toEqual(new Date(2026, 9, 3));
  });

  it.each(['', '2026-13-01', '2026-02-30', '3 okt', undefined])('avvisar ogiltigt %p', (key) => {
    expect(parseDayKey(key)).toBeNull();
  });
});

describe('buildAgenda', () => {
  it('grupperar per dag i tidsordning, även långt fram i tiden', () => {
    const passport = timeAlarm('pass', new Date(2027, 1, 10, 8, 0));
    const lunch = timeAlarm('lunch', new Date(2026, 8, 23, 12, 0)); // redan passerat idag
    const evening = timeAlarm('kväll', new Date(2026, 8, 23, 19, 0));
    const early = timeAlarm('tidig', new Date(2026, 8, 23, 15, 0));
    const { days } = buildAgenda([passport, lunch, evening, early], wed);

    expect(days.map((d) => d.key)).toEqual(['2026-09-23', '2027-02-10']);
    expect(days[0].items.map((i) => i.alarm.id)).toEqual(['tidig', 'kväll']);
    expect(days[1].items[0].alarm.id).toBe('pass');
  });

  it('visar upprepade larm bara inom horisonten', () => {
    const daily = timeAlarm('daglig', new Date(2026, 8, 1, 9, 0), 'DAILY');
    const { days } = buildAgenda([daily], wed, 7);
    // Idag har klockan passerat 09:00 – första tillfället är imorgon, sista inom 7 dagar
    expect(days.map((d) => d.key)).toEqual([
      '2026-09-24',
      '2026-09-25',
      '2026-09-26',
      '2026-09-27',
      '2026-09-28',
      '2026-09-29',
    ]);
  });

  it('vardagslarm hoppar över helgen', () => {
    const weekdays = timeAlarm('vardag', new Date(2026, 8, 1, 7, 30), 'WEEKDAYS');
    const keys = buildAgenda([weekdays], wed, 7).days.map((d) => d.key);
    expect(keys).toEqual(['2026-09-24', '2026-09-25', '2026-09-28', '2026-09-29']);
  });

  it('ett upprepat larm med startdatum börjar först den dagen', () => {
    const fromFriday = timeAlarm('fredag', new Date(2026, 8, 25, 7, 0), 'DAILY');
    const keys = buildAgenda([fromFriday], wed, 5).days.map((d) => d.key);
    expect(keys).toEqual(['2026-09-25', '2026-09-26', '2026-09-27']);
  });

  it('platslarm visas för sig och övriga statusar utelämnas', () => {
    const done = { ...timeAlarm('klar', new Date(2026, 8, 30, 9, 0)), status: 'DONE' as const };
    const fired = { ...timeAlarm('ringt', new Date(2026, 8, 30, 9, 0)), status: 'FIRED_LOCALLY' as const };
    const agenda = buildAgenda([place, done, fired], wed);
    expect(agenda.places.map((a) => a.id)).toEqual(['plats']);
    expect(agenda.days).toEqual([]);
  });
});

describe('occurrencesBefore', () => {
  it('ger ett engångslarm en gång och inget efter gränsen', () => {
    const once = timeAlarm('en', new Date(2026, 8, 24, 9, 0));
    expect(occurrencesBefore(once, wed, new Date(2026, 8, 30))).toHaveLength(1);
    expect(occurrencesBefore(once, wed, new Date(2026, 8, 24))).toHaveLength(0);
  });
});

describe('suggestedTimeForDay', () => {
  it('föreslår 09:00 en kommande dag', () => {
    expect(suggestedTimeForDay('2026-10-23', wed)).toEqual(new Date(2026, 9, 23, 9, 0));
  });

  it.each(['2026-09-23', '2026-09-20', 'nonsens', undefined])('ger null för %p', (key) => {
    expect(suggestedTimeForDay(key, wed)).toBeNull();
  });
});
