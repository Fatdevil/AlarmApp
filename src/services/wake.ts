/**
 * Väckarklocka – det enda stället som ändrar väckningslarm i både databas och OS.
 *
 * Varje ändring räknar om larmets plan (logic/wake.ts), schemalägger den nya planen
 * först och avbryter den gamla sedan – så att ett larm aldrig står oschemalagt om
 * något går fel på vägen.
 */
import * as Crypto from 'expo-crypto';
import {
  awakeSkips,
  nextMatching,
  planKeyOf,
  planSchedule,
  upcomingOccurrence,
  WakeAlarm,
} from '../logic/wake';
import {
  deleteWakeAlarm,
  getWakeAlarm,
  getWakeAlarms,
  saveWakeAlarm,
} from './db';
import { logEvent } from './diagnostics';
import {
  cancelNotifications,
  scheduleWakePlan,
  scheduleWakeSnooze,
  stillScheduled,
} from './notifications';

export interface WakeInput {
  hour: number;
  minute: number;
  label: string;
  weekdays: number[];
}

export interface SeriesInput {
  count: number;
  intervalMinutes: number;
}

/** Schemalägger larmets aktuella plan och sparar. Kastar utan att röra det gamla schemat vid fel. */
async function applyPlan(wake: WakeAlarm, now: Date = new Date()): Promise<WakeAlarm> {
  const plan = planSchedule(wake, now);
  const newIds = await scheduleWakePlan(wake, plan);
  const updated: WakeAlarm = {
    ...wake,
    osIds: newIds,
    planKey: planKeyOf(plan),
    nextFireAt: wake.weekdays.length === 0 ? (plan.fixed[0]?.toISOString() ?? wake.nextFireAt) : null,
  };
  try {
    saveWakeAlarm(updated);
  } catch (err) {
    await cancelNotifications(newIds);
    throw err;
  }
  await cancelNotifications(wake.osIds.filter((id) => !newIds.includes(id)));
  return updated;
}

function baseAlarm(input: WakeInput, now: Date, series?: { id: string; index: number }): WakeAlarm {
  return {
    id: `wake_${Crypto.randomUUID()}`,
    hour: input.hour,
    minute: input.minute,
    label: input.label.trim(),
    weekdays: [...input.weekdays].sort(),
    enabled: true,
    skipUntil: null,
    seriesId: series?.id ?? null,
    seriesIndex: series?.index ?? 0,
    osIds: [],
    planKey: null,
    nextFireAt:
      input.weekdays.length === 0
        ? nextMatching(input.hour, input.minute, [], now).toISOString()
        : null,
    createdAt: now.toISOString(),
  };
}

/**
 * Skapar ett larm, eller en väckningsserie (flera larm med jämna mellanrum).
 * Allt eller inget: misslyckas ett larm i serien tas hela serien bort.
 */
export async function createWakeAlarms(
  input: WakeInput,
  series?: SeriesInput,
  now: Date = new Date()
): Promise<WakeAlarm[]> {
  const count = series ? Math.max(1, series.count) : 1;
  const seriesId = count > 1 ? `series_${Crypto.randomUUID()}` : null;
  const created: WakeAlarm[] = [];

  try {
    for (let i = 0; i < count; i++) {
      const total = (input.hour * 60 + input.minute + i * (series?.intervalMinutes ?? 0)) % 1440;
      const alarm = baseAlarm(
        { ...input, hour: Math.floor(total / 60), minute: total % 60 },
        now,
        seriesId ? { id: seriesId, index: i } : undefined
      );
      created.push(await applyPlan(alarm, now));
    }
  } catch (err) {
    for (const alarm of created) {
      await cancelNotifications(alarm.osIds);
      deleteWakeAlarm(alarm.id);
    }
    throw err;
  }

  await logEvent('ALARM_SCHEDULED', seriesId ?? created[0].id, {
    note: `Väckning ${input.hour}:${String(input.minute).padStart(2, '0')}, ${count} larm`,
  });
  return created;
}

/** Ändrar tid, dagar eller etikett. Nollställer överhoppning och slår på larmet. */
export async function updateWakeAlarm(id: string, input: WakeInput, now: Date = new Date()): Promise<void> {
  const current = getWakeAlarm(id);
  if (!current) return;
  await applyPlan(
    {
      ...current,
      hour: input.hour,
      minute: input.minute,
      label: input.label.trim(),
      weekdays: [...input.weekdays].sort(),
      enabled: true,
      skipUntil: null,
      nextFireAt:
        input.weekdays.length === 0 ? nextMatching(input.hour, input.minute, [], now).toISOString() : null,
    },
    now
  );
}

export async function setWakeEnabled(id: string, enabled: boolean, now: Date = new Date()): Promise<void> {
  const current = getWakeAlarm(id);
  if (!current) return;
  // Ett engångslarm som redan ringt är "på" i databasen men ska kunna slås på igen
  const expiredOneTime =
    current.weekdays.length === 0 &&
    !!current.nextFireAt &&
    new Date(current.nextFireAt).getTime() <= now.getTime();
  if (current.enabled === enabled && !(enabled && expiredOneTime)) return;
  await applyPlan(
    {
      ...current,
      enabled,
      skipUntil: null,
      nextFireAt:
        enabled && current.weekdays.length === 0
          ? nextMatching(current.hour, current.minute, [], now).toISOString()
          : current.nextFireAt,
    },
    now
  );
}

/** "Hoppa över nästa": nästa tillfälle ringer inte, sedan fortsätter larmet som vanligt. */
export async function skipNextWake(id: string, now: Date = new Date()): Promise<void> {
  const current = getWakeAlarm(id);
  if (!current?.enabled) return;
  if (current.weekdays.length === 0) {
    await setWakeEnabled(id, false, now);
    return;
  }
  const next = upcomingOccurrence(current, now);
  await applyPlan({ ...current, skipUntil: new Date(next.getTime() + 60_000).toISOString() }, now);
}

export async function unskipWake(id: string, now: Date = new Date()): Promise<void> {
  const current = getWakeAlarm(id);
  if (!current?.skipUntil) return;
  await applyPlan({ ...current, skipUntil: null }, now);
}

/**
 * "Jag är vaken": resten av seriens larm som skulle ringa inom tre timmar hoppas över.
 * Returnerar antalet larm som hoppades över.
 */
export async function imAwake(seriesId: string, now: Date = new Date()): Promise<number> {
  const series = getWakeAlarms().filter((a) => a.seriesId === seriesId);
  const skips = awakeSkips(series, now);
  for (const alarm of series) {
    const skipUntil = skips.get(alarm.id);
    if (!skipUntil) continue;
    if (alarm.weekdays.length === 0) {
      await applyPlan({ ...alarm, enabled: false }, now);
    } else {
      await applyPlan({ ...alarm, skipUntil }, now);
    }
  }
  return skips.size;
}

/** "Klar" på en väckningsnotis: engångslarm stängs av, i en serie hoppas resten över. */
export async function wakeDismissed(id: string, now: Date = new Date()): Promise<void> {
  const alarm = getWakeAlarm(id);
  if (!alarm) return;
  if (alarm.seriesId) await imAwake(alarm.seriesId, now);
  const fresh = getWakeAlarm(id);
  if (fresh?.enabled && fresh.weekdays.length === 0) await setWakeEnabled(id, false, now);
}

export async function snoozeWake(id: string, now: Date = new Date()): Promise<void> {
  const alarm = getWakeAlarm(id);
  if (!alarm) return;
  const snoozeId = await scheduleWakeSnooze(alarm, now);
  // Sparas med larmet så att det avbryts om larmet raderas eller stängs av
  saveWakeAlarm({ ...alarm, osIds: [...alarm.osIds, snoozeId] });
}

/** Raderar larm och returnerar ögonblicksbilder för "Ångra". */
export async function removeWakeAlarms(ids: string[]): Promise<WakeAlarm[]> {
  const removed: WakeAlarm[] = [];
  for (const id of ids) {
    const alarm = getWakeAlarm(id);
    if (!alarm) continue;
    await cancelNotifications(alarm.osIds);
    deleteWakeAlarm(id);
    removed.push(alarm);
  }
  return removed;
}

export async function restoreWakeAlarms(snapshots: WakeAlarm[], now: Date = new Date()): Promise<void> {
  for (const snapshot of snapshots) {
    await applyPlan({ ...snapshot, osIds: [], planKey: null }, now);
  }
}

/**
 * Vid appstart: stäm av databasen mot OS.
 * - engångslarm som har ringt stängs av (som i Klocka-appen)
 * - planer som ändrats (t.ex. en överhoppning som passerat) schemaläggs om
 * - larm som saknas i OS (t.ex. efter återställd säkerhetskopia) schemaläggs om
 */
export async function reconcileWakeAlarms(now: Date = new Date()): Promise<number> {
  let changed = 0;
  for (const alarm of getWakeAlarms()) {
    try {
      if (!alarm.enabled) {
        if (alarm.osIds.length > 0) {
          await cancelNotifications(alarm.osIds);
          saveWakeAlarm({ ...alarm, osIds: [], planKey: null });
          changed++;
        }
        continue;
      }

      if (
        alarm.weekdays.length === 0 &&
        alarm.nextFireAt &&
        new Date(alarm.nextFireAt).getTime() <= now.getTime()
      ) {
        await cancelNotifications(alarm.osIds);
        saveWakeAlarm({ ...alarm, enabled: false, osIds: [], planKey: null });
        changed++;
        continue;
      }

      const key = planKeyOf(planSchedule(alarm, now));
      const missing = alarm.osIds.length === 0 || (await stillScheduled(alarm.osIds)).length === 0;
      if (key !== alarm.planKey || missing) {
        await applyPlan(alarm, now);
        changed++;
      }
    } catch (err) {
      console.warn(`[Wake] Kunde inte stämma av ${alarm.id}:`, err);
    }
  }
  return changed;
}
