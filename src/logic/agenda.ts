/**
 * Agenda: kommande tidslarm grupperade per dag (ren logik, testas i __tests__/agenda.test.ts).
 *
 * Engångslarm visas oavsett hur långt fram de ligger. Upprepade larm visas bara för de
 * närmaste dagarna – annars skulle ett dagligt larm fylla hela listan.
 */
import { LocalAlarm } from '../types';
import { hasTimeReminder, isZoneArmed } from './followUp';
import { nextOccurrence } from './time';

/** Så många dagar framåt som upprepade larm visas i listan. */
export const REPEAT_HORIZON_DAYS = 14;

export interface AgendaItem {
  alarm: LocalAlarm;
  at: Date;
}

export interface AgendaDay {
  key: string; // YYYY-MM-DD, lokal tid
  date: Date; // midnatt lokal tid
  items: AgendaItem[];
}

export interface Agenda {
  /** Platslarm har ingen tid och visas för sig. */
  places: LocalAlarm[];
  days: AgendaDay[];
}

/** YYYY-MM-DD i lokal tid. */
export function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Tolkar YYYY-MM-DD som midnatt lokal tid. Null om strängen inte är ett giltigt datum. */
export function parseDayKey(key: string | undefined | null): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key ?? '');
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return dayKey(d) === key ? d : null;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

/** Klockslag som föreslås när en påminnelse skapas från en dag i agendan. */
export const DEFAULT_DAY_HOUR = 9;

/**
 * Förvald tid för "ny påminnelse" på en viss dag: kl. 09:00 den dagen. Null för idag,
 * passerade dagar och ogiltiga datum – då används formulärets vanliga förval.
 */
export function suggestedTimeForDay(key: string | undefined | null, now: Date = new Date()): Date | null {
  const day = parseDayKey(key);
  if (!day || day.getTime() <= startOfDay(now).getTime()) return null;
  day.setHours(DEFAULT_DAY_HOUR, 0, 0, 0);
  return day;
}

/** Ringer vid en tid framåt: schemalagda tidslarm och uppföljningar vars tid inte har kommit. */
function isUpcomingTimeAlarm(alarm: LocalAlarm, now: Date): boolean {
  if (alarm.status === 'SCHEDULED') return alarm.triggerType === 'TIME' && !!alarm.dateTime;
  return alarm.status === 'ACTIVE_GEOFENCE' && hasTimeReminder(alarm) && !isZoneArmed(alarm, now);
}

/** Alla tillfällen ett schemalagt tidslarm ringer från och med [now] och före [until]. */
export function occurrencesBefore(alarm: LocalAlarm, now: Date, until: Date): Date[] {
  if (!isUpcomingTimeAlarm(alarm, now)) return [];
  const result: Date[] = [];
  let next = nextOccurrence(alarm.dateTime!, alarm.repeat, now);
  while (next && next.getTime() < until.getTime()) {
    result.push(next);
    if ((alarm.repeat ?? 'NONE') === 'NONE') break;
    next = nextOccurrence(alarm.dateTime!, alarm.repeat, next);
  }
  return result;
}

export function buildAgenda(
  alarms: LocalAlarm[],
  now: Date = new Date(),
  repeatHorizonDays: number = REPEAT_HORIZON_DAYS
): Agenda {
  const repeatUntil = addDays(startOfDay(now), repeatHorizonDays);
  const byDay = new Map<string, AgendaItem[]>();

  for (const alarm of alarms) {
    if (!isUpcomingTimeAlarm(alarm, now)) continue;
    const repeating = (alarm.repeat ?? 'NONE') !== 'NONE';
    const times = repeating
      ? occurrencesBefore(alarm, now, repeatUntil)
      : [nextOccurrence(alarm.dateTime!, 'NONE', now)].filter((d): d is Date => d !== null);
    for (const at of times) {
      const key = dayKey(at);
      byDay.set(key, [...(byDay.get(key) ?? []), { alarm, at }]);
    }
  }

  const days = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, items]) => ({
      key,
      date: parseDayKey(key)!,
      items: items.sort((a, b) => a.at.getTime() - b.at.getTime()),
    }));

  const places = alarms
    .filter((a) => a.status === 'ACTIVE_GEOFENCE' && isZoneArmed(a, now))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  return { places, days };
}
