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
} from '../logic/notificationBudget';
import { LocalAlarm } from '../types';
import { getAlarmsByStatus, setNotificationIds } from './db';
import {
  cancelReturningFailed,
  countScheduledNotifications,
  getScheduledByAlarm,
  isNotificationBudgetLimited,
  scheduleTimeAlarm,
} from './notifications';

interface BudgetPlan {
  candidates: LocalAlarm[];
  inOs: Map<string, string[]>;
  keep: Set<string>;
}

/** Planen för schemat, eller null när ingen gräns gäller. [extra]: ett larm som inte är sparat än. */
async function computePlan(now: Date, extra?: LocalAlarm): Promise<BudgetPlan | null> {
  if (!(await isNotificationBudgetLimited())) return null;
  const stored = getAlarmsByStatus(['SCHEDULED', 'ACTIVE_GEOFENCE']);
  const scored = budgetCandidates(extra ? [...stored, extra] : stored, now);
  const candidates = scored.map((c) => c.alarm);
  const inOs = await getScheduledByAlarm(candidates);
  const ownInOs = candidates.reduce((sum, a) => sum + (inOs.get(a.id)?.length ?? 0), 0);
  // Notiser som inte hör till planen (snoozar, vänförfrågningar) tar också plats
  const others = (await countScheduledNotifications()) - ownInOs;
  const available = IOS_NOTIFICATION_LIMIT - RESERVED_NOTIFICATION_SLOTS - Math.max(0, others);
  return { candidates, inOs, keep: planBudget(scored, available) };
}

/** Sant om ett nytt larm inte får plats i schemat nu och ska vänta (bara iOS utan AlarmKit). */
export async function shouldDeferScheduling(alarm: LocalAlarm, now: Date = new Date()): Promise<boolean> {
  const plan = await computePlan(now, alarm);
  return plan !== null && !plan.keep.has(alarm.id);
}

/** Tar ut larm som inte ryms och lägger in väntande som nu får plats. */
export async function rebalanceNotificationBudget(
  now: Date = new Date()
): Promise<{ added: number; removed: number }> {
  const result = { added: 0, removed: 0 };
  const plan = await computePlan(now);
  if (!plan) return result;
  const { candidates, inOs, keep } = plan;

  // Ta ut först, så att platserna är lediga innan något läggs in
  for (const alarm of candidates) {
    const osIds = inOs.get(alarm.id) ?? [];
    if (keep.has(alarm.id) || osIds.length === 0) continue;
    const failed = await cancelReturningFailed(osIds);
    setNotificationIds(alarm.id, failed);
    if (failed.length === 0) result.removed++;
  }

  for (const alarm of candidates) {
    const osIds = inOs.get(alarm.id) ?? [];
    if (!keep.has(alarm.id)) continue;
    if (osIds.length > 0) {
      if (osIds.join() !== (alarm.notificationIds ?? []).join()) setNotificationIds(alarm.id, osIds);
      continue;
    }
    try {
      setNotificationIds(alarm.id, await scheduleTimeAlarm(alarm, now));
      result.added++;
    } catch (err) {
      console.warn(`[Budget] Kunde inte lägga in ${alarm.id}:`, err);
    }
  }
  return result;
}
