/**
 * iOS håller högst 64 schemalagda notiser per app och kastar tyst de som ligger längst
 * fram. När påminnelser ringer som notiser (iOS utan AlarmKit) får därför bara de närmast
 * kommande ligga i telefonens schema; resten fylls på när det blir plats.
 * Ren logik – testas i __tests__/notificationBudget.test.ts.
 */
import { LocalAlarm } from '../types';
import { hasTimeReminder, isZoneArmed } from './followUp';
import { nextOccurrence } from './time';

export const IOS_NOTIFICATION_LIMIT = 64;
/** Platser som hålls lediga för snoozar och annat som schemaläggs utanför planen. */
export const RESERVED_NOTIFICATION_SLOTS = 4;

export interface BudgetCandidate {
  alarm: LocalAlarm;
  nextAt: Date;
  cost: number;
}

/** Antal notiser ett tidslarm tar i anspråk (vardagar = en veckotrigger per dag). */
export function slotCost(alarm: LocalAlarm): number {
  return alarm.repeat === 'WEEKDAYS' ? 5 : 1;
}

/** Nästa gång larmet ska ringa vid en tid, eller null om det inte ska ligga i schemat. */
export function nextTimedRing(alarm: LocalAlarm, now: Date): Date | null {
  if (alarm.status === 'SCHEDULED' && alarm.triggerType === 'TIME' && alarm.dateTime) {
    return nextOccurrence(alarm.dateTime, alarm.repeat, now);
  }
  if (alarm.status === 'ACTIVE_GEOFENCE' && hasTimeReminder(alarm) && !isZoneArmed(alarm, now)) {
    return new Date(alarm.dateTime!);
  }
  return null;
}

export function budgetCandidates(alarms: LocalAlarm[], now: Date): BudgetCandidate[] {
  return alarms.flatMap((alarm) => {
    const nextAt = nextTimedRing(alarm, now);
    return nextAt ? [{ alarm, nextAt, cost: slotCost(alarm) }] : [];
  });
}

/**
 * Väljer vilka larm som ska ligga i schemat: de som ringer först, tills [available]
 * platser är använda. Stannar vid första larm som inte får plats, så att ett senare
 * larm aldrig ligger i schemat när ett tidigare saknas.
 */
export function planBudget(candidates: BudgetCandidate[], available: number): Set<string> {
  const keep = new Set<string>();
  let left = available;
  const ordered = [...candidates].sort(
    (a, b) => a.nextAt.getTime() - b.nextAt.getTime() || a.alarm.id.localeCompare(b.alarm.id)
  );
  for (const c of ordered) {
    if (c.cost > left) break;
    keep.add(c.alarm.id);
    left -= c.cost;
  }
  return keep;
}
