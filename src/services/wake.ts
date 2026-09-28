/**
 * Väckarklocka – det enda stället som ändrar väckningslarm i både databas och OS.
 *
 * Varje ändring räknar om larmets plan (logic/wake.ts), schemalägger den nya planen
 * först och avbryter den gamla sedan – så att ett larm aldrig står oschemalagt om
 * något går fel på vägen.
 */
import * as Crypto from 'expo-crypto';
import { SNOOZE_MINUTES } from '../constants';
import {
  awakeSkips,
  buildSeriesTimes,
  nextMatching,
  planKeyOf,
  planSchedule,
  shiftWeekdays,
  upcomingOccurrence,
  WakeAlarm,
} from '../logic/wake';
import {
  deleteWakeAlarm,
  getWakeAlarm,
  getWakeAlarms,
  saveWakeAlarm,
} from './db';
import { consumeNativeSkips } from '../../modules/native-alarm';
import { logEvent } from './diagnostics';
import {
  CancelNotificationsError,
  cancelNotifications,
  cancelNotificationsBestEffort,
  hasPendingNativeSnooze,
  retryPendingAlarmCancellations,
  scheduleWakePlan,
  scheduleWakeSnooze,
  stillScheduled,
} from './notifications';

let wakeLock: Promise<unknown> = Promise.resolve();

/** Kör fn när tidigare låsta operationer är klara (avstämning och snooze). */
function withWakeLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = wakeLock.then(fn, fn);
  wakeLock = run.catch(() => {});
  return run;
}

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

/** Avbokar och returnerar de ID:n som inte gick att avboka (i stället för att kasta). */
async function cancelReturningFailed(ids: string[]): Promise<string[]> {
  try {
    await cancelNotifications(ids);
    return [];
  } catch (err) {
    return err instanceof CancelNotificationsError ? err.failedIds : ids;
  }
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)];
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
    await cancelNotificationsBestEffort(newIds);
    throw err;
  }
  const failed = await cancelReturningFailed(wake.osIds.filter((id) => !newIds.includes(id)));
  if (failed.length > 0) {
    // Den nya planen gäller. Gamla larm som inte gick att avboka hålls isär från
    // det aktuella schemat, och avstämningen försöker igen vid varje start.
    const withPending: WakeAlarm = {
      ...updated,
      pendingCancellationIds: unique([...updated.pendingCancellationIds, ...failed]),
    };
    saveWakeAlarm(withPending);
    return withPending;
  }
  return updated;
}

function baseAlarm(
  input: WakeInput,
  now: Date,
  series?: { id: string; index: number },
  fireAt?: Date
): WakeAlarm {
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
    pendingCancellationIds: [],
    planKey: null,
    nextFireAt:
      input.weekdays.length === 0
        ? (fireAt ?? nextMatching(input.hour, input.minute, [], now)).toISOString()
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

  const slots = buildSeriesTimes(input.hour, input.minute, count, series?.intervalMinutes ?? 0);
  // Engångsserie: alla larm räknas från seriens första tillfälle, så att ordningen
  // behålls även om första klockslaget redan har passerat idag
  const firstFire = nextMatching(input.hour, input.minute, [], now);

  try {
    for (let i = 0; i < count; i++) {
      const slot = slots[i];
      const alarm = baseAlarm(
        {
          ...input,
          hour: slot.hour,
          minute: slot.minute,
          // Larm efter midnatt ringer dagen efter seriens startdag
          weekdays: shiftWeekdays(input.weekdays, slot.dayOffset),
        },
        now,
        seriesId ? { id: seriesId, index: i } : undefined,
        new Date(firstFire.getTime() + slot.offsetMinutes * 60_000)
      );
      created.push(await applyPlan(alarm, now));
    }
  } catch (err) {
    for (const alarm of created) {
      await cancelNotificationsBestEffort(alarm.osIds);
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

export function snoozeWake(id: string, now: Date = new Date()): Promise<void> {
  // Knappen öppnar appen, så en avstämning kan starta samtidigt – kör aldrig parallellt
  return withWakeLock(async () => {
    const alarm = getWakeAlarm(id);
    if (!alarm) return;
    const snoozeId = await scheduleWakeSnooze(alarm, now);
    // Sparas med larmet så att det avbryts om larmet raderas eller stängs av
    const snoozed: WakeAlarm = { ...alarm, osIds: [...alarm.osIds, snoozeId] };
    if (alarm.weekdays.length === 0) {
      // Engångslarm: snoozen är nu nästa tillfälle. Annars ser avstämningen det
      // passerade ursprungstillfället, stänger av larmet och avbryter snoozen.
      // Har en avstämning hunnit stänga av det redan, slås det på igen.
      snoozed.enabled = true;
      snoozed.nextFireAt = new Date(now.getTime() + SNOOZE_MINUTES * 60_000).toISOString();
      snoozed.planKey = planKeyOf(planSchedule(snoozed, now));
    }
    saveWakeAlarm(snoozed);
  });
}

/**
 * Raderar larm (t.ex. en hel serie) och returnerar ögonblicksbilder för "Ångra".
 * Atomiskt: ingen rad raderas förrän alla larmens OS-avbokningar har lyckats.
 * Misslyckas någon avbokning återställs de larm som hann avbokas i OS, ID:n som
 * inte gick att avboka sparas för ett nytt försök, och felet kastas.
 */
export function removeWakeAlarms(ids: string[], now: Date = new Date()): Promise<WakeAlarm[]> {
  // Under samma lås som avstämningen, så att den inte sparar tillbaka en rad som just raderats
  return withWakeLock(() => removeWakeAlarmsLocked(ids, now));
}

async function removeWakeAlarmsLocked(ids: string[], now: Date): Promise<WakeAlarm[]> {
  const alarms = ids.map((id) => getWakeAlarm(id)).filter((a): a is WakeAlarm => a !== null);

  const failures = new Map<string, string[]>();
  for (const alarm of alarms) {
    const failed = await cancelReturningFailed([...alarm.osIds, ...alarm.pendingCancellationIds]);
    if (failed.length > 0) failures.set(alarm.id, failed);
  }

  if (failures.size > 0) {
    for (const alarm of alarms) {
      const failed = failures.get(alarm.id) ?? [];
      const pendingLeft = alarm.pendingCancellationIds.filter((id) => failed.includes(id));
      try {
        if (alarm.osIds.every((id) => failed.includes(id))) {
          // Inget av det aktuella schemat avbokades – larmet är oförändrat i OS
          saveWakeAlarm({ ...alarm, pendingCancellationIds: pendingLeft });
        } else {
          // Schemalägg om det som hann avbokas; kvarvarande gamla ID:n väntar på avbokning
          const stale = alarm.osIds.filter((id) => failed.includes(id));
          await applyPlan(
            { ...alarm, osIds: [], planKey: null, pendingCancellationIds: unique([...pendingLeft, ...stale]) },
            now
          );
        }
      } catch (err) {
        console.warn(`[Wake] Kunde inte återställa ${alarm.id}:`, err);
      }
    }
    throw new CancelNotificationsError([...failures.values()].flat());
  }

  for (const alarm of alarms) deleteWakeAlarm(alarm.id);
  // Allt är avbokat – ögonblicksbilderna för "Ångra" har inget kvar att avboka
  return alarms.map((a) => ({ ...a, pendingCancellationIds: [] }));
}

export async function restoreWakeAlarms(snapshots: WakeAlarm[], now: Date = new Date()): Promise<void> {
  for (const snapshot of snapshots) {
    await applyPlan({ ...snapshot, osIds: [], planKey: null }, now);
  }
}

/**
 * För över överhoppningar som Android gjort på egen hand ("Jag är vaken" på
 * larmskärmen) till databasen. Utan detta skulle appen tro att larmen saknas i OS
 * och schemalägga dem igen – och larmen skulle ringa ändå.
 */
function withNativeSkips(alarm: WakeAlarm, skips: Map<string, Date>, now: Date): WakeAlarm {
  if (skips.size === 0 || !alarm.enabled) return alarm;
  let until: Date | null = null;
  for (const id of alarm.osIds) {
    if (!id.startsWith('native:')) continue;
    const skip = skips.get(id.slice('native:'.length).toLowerCase());
    if (skip && (!until || skip > until)) until = skip;
  }
  if (!until || until.getTime() <= now.getTime()) return alarm;
  if (alarm.weekdays.length === 0) return { ...alarm, enabled: false };
  const current = alarm.skipUntil ? new Date(alarm.skipUntil) : null;
  if (current && current >= until) return alarm;
  return { ...alarm, skipUntil: until.toISOString() };
}

/**
 * Vid appstart och när appen kommer tillbaka till förgrunden: stäm av databasen mot OS.
 * - överhoppningar som Android gjort själv förs över till databasen
 * - engångslarm som har ringt stängs av (som i Klocka-appen)
 * - planer som ändrats (t.ex. en överhoppning som passerat) schemaläggs om
 * - larm som saknas i OS (t.ex. efter återställd säkerhetskopia) schemaläggs om
 */
let reconciling: Promise<number> | null = null;

export function reconcileWakeAlarms(now: Date = new Date()): Promise<number> {
  // Appstart och återkomst till förgrunden kan överlappa – kör aldrig två avstämningar samtidigt
  reconciling ??= withWakeLock(() => runReconcile(now)).finally(() => {
    reconciling = null;
  });
  return reconciling;
}

async function runReconcile(now: Date): Promise<number> {
  let changed = 0;
  await retryPendingAlarmCancellations();
  const nativeSkips = await consumeNativeSkips().catch(() => new Map<string, Date>());

  for (const stored of getWakeAlarms()) {
    try {
      let alarm = withNativeSkips(stored, nativeSkips, now);

      // Gamla OS-ID:n som inte gick att avboka tidigare – försök igen
      if (alarm.pendingCancellationIds.length > 0) {
        const stillPending = await cancelReturningFailed(alarm.pendingCancellationIds);
        if (stillPending.length !== alarm.pendingCancellationIds.length) {
          alarm = { ...alarm, pendingCancellationIds: stillPending };
          changed++;
        }
      }
      if (alarm !== stored) saveWakeAlarm(alarm);

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
        // Att avbryta det inbyggda larmet avbryter också dess snooze – vänta tills den ringt
        if (await hasPendingNativeSnooze(alarm.osIds)) continue;
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
      console.warn(`[Wake] Kunde inte stämma av ${stored.id}:`, err);
    }
  }
  return changed;
}
