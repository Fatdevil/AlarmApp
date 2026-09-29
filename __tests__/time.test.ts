import {
  formatAgendaDay,
  formatCountdown,
  formatDayLabel,
  nextOccurrence,
  repeatingStart,
  resolveSelection,
} from '../src/logic/time';

// Onsdag 2026-09-23 14:10:30 lokal tid
const wed = new Date(2026, 8, 23, 14, 10, 30);

describe('resolveSelection', () => {
  it('räknar relativa val från det givna ögonblicket (inte när formuläret öppnades)', () => {
    const opened = new Date(2026, 8, 23, 8, 0, 0);
    const saved = new Date(2026, 8, 23, 10, 0, 0);
    const sel = { kind: 'relative', minutes: 30 } as const;
    expect(resolveSelection(sel, opened).getHours()).toBe(8);
    const atSave = resolveSelection(sel, saved);
    expect(atSave.getTime()).toBeGreaterThan(saved.getTime());
    expect(atSave.getHours()).toBe(10);
    expect(atSave.getMinutes()).toBe(30);
  });

  it('avrundar uppåt till hel minut så att visat klockslag stämmer', () => {
    const d = resolveSelection({ kind: 'relative', minutes: 15 }, wed);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMinutes()).toBe(26);
  });

  it('"ikväll" blir imorgon om klockan redan passerat 19', () => {
    const late = new Date(2026, 8, 23, 20, 0);
    const d = resolveSelection({ kind: 'tonight' }, late);
    expect(d.getDate()).toBe(24);
    expect(d.getHours()).toBe(19);
  });

  it('"imorgon" är 09:00 nästa dag', () => {
    const d = resolveSelection({ kind: 'tomorrowMorning' }, wed);
    expect([d.getDate(), d.getHours(), d.getMinutes()]).toEqual([24, 9, 0]);
  });
});

describe('nextOccurrence', () => {
  it('engångslarm i det förflutna ger null', () => {
    expect(nextOccurrence(new Date(2026, 8, 23, 9, 0).toISOString(), 'NONE', wed)).toBeNull();
  });

  it('dagligt larm vars klockslag passerat idag ringer imorgon', () => {
    const next = nextOccurrence(new Date(2026, 8, 1, 9, 0).toISOString(), 'DAILY', wed)!;
    expect([next.getDate(), next.getHours()]).toEqual([24, 9]);
  });

  it('upprepat larm med framtida startdatum ringer först då', () => {
    const start = new Date(2026, 9, 5, 7, 0); // måndag 5 okt
    const daily = nextOccurrence(start.toISOString(), 'DAILY', wed)!;
    expect(daily.getTime()).toBe(start.getTime());
    const saturday = new Date(2026, 9, 3, 7, 0);
    const weekdays = nextOccurrence(saturday.toISOString(), 'WEEKDAYS', wed)!;
    expect([weekdays.getDate(), weekdays.getHours()]).toEqual([5, 7]);
  });

  it('vardagslarm hoppar över helgen', () => {
    const friEvening = new Date(2026, 8, 25, 20, 0);
    const next = nextOccurrence(new Date(2026, 8, 1, 7, 30).toISOString(), 'WEEKDAYS', friEvening)!;
    expect(next.getDay()).toBe(1); // måndag
    expect(next.getDate()).toBe(28);
  });
});

describe('repeatingStart', () => {
  it('börjar vid nästa tillfälle av klockslaget, även om ett senare datum valts', () => {
    const chosen = new Date(2026, 9, 12, 7, 30); // måndag om tre veckor
    const start = repeatingStart(chosen, 'DAILY', wed);
    expect([start.getDate(), start.getHours(), start.getMinutes()]).toEqual([24, 7, 30]);
  });

  it('kan börja idag om klockslaget inte passerat', () => {
    const start = repeatingStart(new Date(2026, 9, 12, 18, 0), 'WEEKDAYS', wed);
    expect([start.getDate(), start.getHours()]).toEqual([23, 18]);
  });

  it('vardagar hoppar till måndag', () => {
    const friEvening = new Date(2026, 8, 25, 20, 0);
    const start = repeatingStart(new Date(2026, 8, 25, 7, 0), 'WEEKDAYS', friEvening);
    expect([start.getDate(), start.getDay()]).toEqual([28, 1]);
  });
});

describe('formatering', () => {
  it('nedräkning', () => {
    expect(formatCountdown(new Date(wed.getTime() + 25 * 60_000), wed)).toBe('om 25 min');
    expect(formatCountdown(new Date(wed.getTime() + 125 * 60_000), wed)).toBe('om 2 tim 5 min');
    expect(formatCountdown(new Date(wed.getTime() - 1000), wed)).toBe('nu');
  });

  it('agendarubriker', () => {
    expect(formatAgendaDay(new Date(2026, 8, 23, 20), wed)).toBe('Idag');
    expect(formatAgendaDay(new Date(2026, 8, 24), wed)).toBe('Imorgon');
    expect(formatAgendaDay(new Date(2026, 9, 2), wed)).toBe('Fredag 2 oktober');
    expect(formatAgendaDay(new Date(2027, 1, 10), wed)).toBe('Onsdag 10 februari 2027');
  });

  it('dagetiketter', () => {
    expect(formatDayLabel(wed, wed)).toBe('Idag');
    expect(formatDayLabel(new Date(2026, 8, 24, 9), wed)).toBe('Imorgon');
    expect(formatDayLabel(new Date(2026, 8, 22, 9), wed)).toBe('Igår');
  });
});
