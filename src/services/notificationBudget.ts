/**
 * Påfyllning av telefonens notisschema på iOS utan AlarmKit (högst 64 notiser).
 * De närmast kommande påminnelserna ligger i schemat; resten väntar i databasen utan
 * OS-ID:n och läggs in när det blir plats – vid appstart, i förgrunden och när larm
 * blir klara eller raderas. Planen jämförs alltid mot telefonens faktiska schema,
 * eftersom iOS tyst kastar notiser över gränsen.
 */
import {
  budgetCandidates,
  IOS_NOTIFICATION_LIMIT,
  planBudget,
  RESERVED_NOTIFICATION_SLOTS,
  slotCost,
} from '../logic/notificationBudget';
import { LocalAlarm } from '../types';
import { getAlarmsByStatus, setNotificationIds } from './db';
import {
  cancelReturningFailed,
  getNotificationScheduleSummary,
  getScheduledByAlarm,
  isNotificationBudgetLimited,
  scheduleTimeAlarm,
} from './notifications';

interface BudgetPlan {
  candidates: LocalAlarm[];
  /** Larmets egna notiser i schemat, utan snoozar. */
  planned: Map<string, string[]>;
  /** Larmets snoozar i schemat – de rörs aldrig. */
  snoozes: Map<string, string[]>;
  keep: Set<string>;
}

/** Planen för schemat, eller null när ingen gräns gäller. [extra]: ett larm som inte är sparat än. */
async function computePlan(now: Date, extra?: LocalAlarm): Promise<BudgetPlan | null> {
  if (!(await isNotificationBudgetLimited())) return null;
  const stored = getAlarmsByStatus(['SCHEDULED', 'ACTIVE_GEOFENCE']).filter((a) => a.id !== extra?.id);
  const scored = budgetCandidates(extra ? [...stored, extra] : stored, now);
  const candidates = scored.map((c) => c.alarm);
  const inOs = await getScheduledByAlarm(candidates);
  const { total, snoozeIds } = await getNotificationScheduleSummary();

  const planned = new Map<string, string[]>();
  const snoozes = new Map<string, string[]>();
  for (const alarm of candidates) {
    const ids = inOs.get(alarm.id) ?? [];
    planned.set(alarm.id, ids.filter((id) => !snoozeIds.has(id)));
    snoozes.set(alarm.id, ids.filter((id) => snoozeIds.has(id)));
  }
  const inPlan = [...planned.values()].reduce((sum, ids) => sum + ids.length, 0);
  // Allt annat i schemat (snoozar, vänförfrågningar) tar också plats
  const others = Math.max(0, total - inPlan);
  const available = IOS_NOTIFICATION_LIMIT - RESERVED_NOTIFICATION_SLOTS - others;
  return { candidates, planned, snoozes, keep: planBudget(scored, available) };
}

/** Sant om ett larm inte får plats i schemat nu och ska vänta (bara iOS utan AlarmKit). */
export async function shouldDeferScheduling(alarm: LocalAlarm, now: Date = new Date()): Promise<boolean> {
  const plan = await computePlan(now, alarm);
  return plan !== null && !plan.keep.has(alarm.id);
}

async function rebalance(now: Date): Promise<{ added: number; removed: number }> {
  const result = { added: 0, removed: 0 };
  const plan = await computePlan(now);
  if (!plan) return result;
  const { candidates, planned, snoozes, keep } = plan;

  // Ta ut först, så att platserna är lediga innan något läggs in. Snoozar ligger kvar.
  for (const alarm of candidates) {
    const osIds = planned.get(alarm.id)!;
    if (keep.has(alarm.id) || osIds.length === 0) continue;
    const failed = await cancelReturningFailed(osIds);
    setNotificationIds(alarm.id, [...failed, ...snoozes.get(alarm.id)!]);
    if (failed.length === 0) result.removed++;
  }

  for (const alarm of candidates) {
    if (!keep.has(alarm.id)) continue;
    const osIds = planned.get(alarm.id)!;
    const snoozeIds = snoozes.get(alarm.id)!;
    if (osIds.length >= slotCost(alarm)) {
      const actual = [...osIds, ...snoozeIds];
      if (actual.join() !== (alarm.notificationIds ?? []).join()) setNotificationIds(alarm.id, actual);
      continue;
    }
    // Ofullständig uppsättning (iOS kan ha kastat några av vardagarna): bygg om hela
    if (osIds.length > 0) {
      const failed = await cancelReturningFailed(osIds);
      if (failed.length > 0) {
        setNotificationIds(alarm.id, [...failed, ...snoozeIds]);
        continue;
      }
    }
    try {
      setNotificationIds(alarm.id, [...(await scheduleTimeAlarm(alarm, now)), ...snoozeIds]);
      result.added++;
    } catch (err) {
      console.warn(`[Budget] Kunde inte lägga in ${alarm.id}:`, err);
    }
  }
  return result;
}

// Påfyllningar körs en i taget: två samtidiga (t.ex. "Klar" i en notis som också tar
// appen till förgrunden) skulle annars båda lägga in samma väntande larm.
let queue: Promise<unknown> = Promise.resolve();

/** Tar ut larm som inte ryms och lägger in väntande som nu får plats. */
export function rebalanceNotificationBudget(now?: Date): Promise<{ added: number; removed: number }> {
  const run = queue.then(() => rebalance(now ?? new Date()));
  queue = run.catch(() => {});
  return run;
}
