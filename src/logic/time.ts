/**
 * Ren tidslogik (inga native-beroenden) – testas i __tests__/time.test.ts.
 */
import { RepeatRule } from '../types';

export const LOCALE = 'sv-SE';

/**
 * Användarens tidsval. Sparas som *val* och omvandlas till ett datum först när
 * larmet sparas, så att "+30 min" alltid räknas från sparögonblicket.
 */
export type TimeSelection =
  | { kind: 'relative'; minutes: number }
  | { kind: 'tonight' } // 19:00 idag, annars imorgon
  | { kind: 'tomorrowMorning' } // 09:00 imorgon
  | { kind: 'custom'; date: Date };

export interface TimePreset {
  label: string;
  selection: TimeSelection;
}

export const TIME_PRESETS: TimePreset[] = [
  { label: '+15 min', selection: { kind: 'relative', minutes: 15 } },
  { label: '+30 min', selection: { kind: 'relative', minutes: 30 } },
  { label: '+1 tim', selection: { kind: 'relative', minutes: 60 } },
  { label: 'Ikväll 19:00', selection: { kind: 'tonight' } },
  { label: 'Imorgon 09:00', selection: { kind: 'tomorrowMorning' } },
];

export function resolveSelection(selection: TimeSelection, now: Date = new Date()): Date {
  switch (selection.kind) {
    case 'relative':
      // Nollställ sekunder så att klockslaget som visas stämmer med när larmet ringer
      return roundUpToMinute(new Date(now.getTime() + selection.minutes * 60_000));
    case 'tonight': {
      const d = new Date(now);
      d.setHours(19, 0, 0, 0);
      if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
      return d;
    }
    case 'tomorrowMorning': {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    }
    case 'custom': {
      const d = new Date(selection.date);
      d.setSeconds(0, 0);
      return d;
    }
  }
}

function roundUpToMinute(d: Date): Date {
  const r = new Date(d);
  if (r.getSeconds() > 0 || r.getMilliseconds() > 0) {
    r.setMinutes(r.getMinutes() + 1, 0, 0);
  }
  return r;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isWeekday(d: Date): boolean {
  const day = d.getDay();
  return day >= 1 && day <= 5;
}

/**
 * Nästa tillfälle ett larm ringer, givet dess första tid och upprepning.
 * Returnerar null för ett engångslarm vars tid har passerat.
 */
export function nextOccurrence(
  firstIso: string,
  repeat: RepeatRule = 'NONE',
  now: Date = new Date()
): Date | null {
  const first = new Date(firstIso);
  if (isNaN(first.getTime())) return null;
  if (repeat === 'NONE') return first.getTime() > now.getTime() ? first : null;

  const candidate = new Date(now);
  candidate.setHours(first.getHours(), first.getMinutes(), 0, 0);
  if (candidate.getTime() <= now.getTime()) candidate.setDate(candidate.getDate() + 1);
  if (repeat === 'WEEKDAYS') {
    while (!isWeekday(candidate)) candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
}

const clockFormat = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });
const dayFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });

export function formatClock(date: Date): string {
  return clockFormat.format(date);
}

/** "Idag", "Imorgon", "Igår" eller t.ex. "tors 3 okt". */
export function formatDayLabel(date: Date, now: Date = new Date()): string {
  if (isSameDay(date, now)) return 'Idag';
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (isSameDay(date, tomorrow)) return 'Imorgon';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(date, yesterday)) return 'Igår';
  return dayFormat.format(date);
}

/** "om 25 min", "om 3 tim 5 min", "om 2 dagar". */
export function formatCountdown(date: Date, now: Date = new Date()): string {
  const diffMin = Math.ceil((date.getTime() - now.getTime()) / 60_000);
  if (diffMin <= 0) return 'nu';
  if (diffMin < 60) return `om ${diffMin} min`;
  const hours = Math.floor(diffMin / 60);
  const minutes = diffMin % 60;
  if (hours < 24) return minutes > 0 ? `om ${hours} tim ${minutes} min` : `om ${hours} tim`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'om 1 dag' : `om ${days} dagar`;
}

export const REPEAT_LABELS: Record<RepeatRule, string> = {
  NONE: 'En gång',
  DAILY: 'Varje dag',
  WEEKDAYS: 'Vardagar',
};

/** expo-notifications veckodagar: 1 = söndag … 7 = lördag. Vardagar = 2–6. */
export const WEEKDAY_NUMBERS = [2, 3, 4, 5, 6];
