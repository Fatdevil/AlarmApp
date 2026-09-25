import {
  formatCountdown,
  formatDayLabel,
  nextOccurrence,
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

  it('vardagslarm hoppar över helgen', () => {
    const friEvening = new Date(2026, 8, 25, 20, 0);
    const next = nextOccurrence(new Date(2026, 8, 1, 7, 30).toISOString(), 'WEEKDAYS', friEvening)!;
    expect(next.getDay()).toBe(1); // måndag
    expect(next.getDate()).toBe(28);
  });
});

describe('formatering', () => {
  it('nedräkning', () => {
    expect(formatCountdown(new Date(wed.getTime() + 25 * 60_000), wed)).toBe('om 25 min');
    expect(formatCountdown(new Date(wed.getTime() + 125 * 60_000), wed)).toBe('om 2 tim 5 min');
    expect(formatCountdown(new Date(wed.getTime() - 1000), wed)).toBe('nu');
  });

  it('dagetiketter', () => {
    expect(formatDayLabel(wed, wed)).toBe('Idag');
    expect(formatDayLabel(new Date(2026, 8, 24, 9), wed)).toBe('Imorgon');
    expect(formatDayLabel(new Date(2026, 8, 22, 9), wed)).toBe('Igår');
  });
});
