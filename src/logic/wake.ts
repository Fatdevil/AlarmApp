/**
 * Väckarklockslogik (ren, testad i __tests__/wake.test.ts).
 *
 * Veckodagar numreras som i expo-notifications: 1 = söndag … 7 = lördag.
 */
import { LOCALE } from './time';

export interface WakeAlarm {
  id: string;
  hour: number;
  minute: number;
  label: string;
  /** Tom = engångslarm (nästa gång klockslaget inträffar). */
  weekdays: number[];
  enabled: boolean;
  /** Tillfällen före denna tidpunkt hoppas över ("Hoppa över nästa", "Jag är vaken"). */
  skipUntil: string | null;
  /** Larm som skapats som en väckningsserie delar seriesId. */
  seriesId: string | null;
  seriesIndex: number;
  /** ID:n för larmets aktuella schema i OS ("native:<uuid>" eller notis-ID). */
  osIds: string[];
  /**
   * Gamla OS-ID:n som inte gick att avboka (t.ex. vid ändrad tid). Hör inte till
   * det aktuella schemat; avstämningen försöker avboka dem vid varje start.
   */
  pendingCancellationIds: string[];
  /** Signatur för den plan som senast schemalades – ändras den behöver OS uppdateras. */
  planKey: string | null;
  /** Engångslarm: när det är schemalagt att ringa. */
  nextFireAt: string | null;
  createdAt: string;
}

export const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];
export const WORK_DAYS = [2, 3, 4, 5, 6];
export const WEEKEND = [1, 7];

/** Visningsordning: måndag först. */
export const WEEK_ORDER = [2, 3, 4, 5, 6, 7, 1];
const SHORT = ['', 'Sön', 'Mån', 'Tis', 'Ons', 'Tors', 'Fre', 'Lör'];
const LETTER = ['', 'S', 'M', 'T', 'O', 'T', 'F', 'L'];

export function dayShort(day: number): string {
  return SHORT[day];
}

export function dayLetter(day: number): string {
  return LETTER[day];
}

function jsDayToWeekday(d: Date): number {
  return d.getDay() + 1;
}

function sameSet(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

export function describeDays(weekdays: number[]): string {
  if (weekdays.length === 0) return 'En gång';
  if (sameSet(weekdays, ALL_DAYS)) return 'Varje dag';
  if (sameSet(weekdays, WORK_DAYS)) return 'Vardagar';
  if (sameSet(weekdays, WEEKEND)) return 'Helger';
  return WEEK_ORDER.filter((d) => weekdays.includes(d)).map(dayShort).join(', ');
}

/** Nästa tillfälle strikt efter `after` för klockslag + veckodagar (tom = vilken dag som helst). */
export function nextMatching(hour: number, minute: number, weekdays: number[], after: Date): Date {
  const d = new Date(after);
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() <= after.getTime()) d.setDate(d.getDate() + 1);
  if (weekdays.length > 0) {
    for (let i = 0; i < 7 && !weekdays.includes(jsDayToWeekday(d)); i++) {
      d.setDate(d.getDate() + 1);
    }
  }
  return d;
}

/**
 * Nästa gång larmet faktiskt ringer, med hänsyn till av/på och överhoppning.
 * Null om larmet är avstängt eller ett engångslarm som redan har ringt.
 */
export function nextWakeOccurrence(alarm: WakeAlarm, now: Date = new Date()): Date | null {
  if (!alarm.enabled) return null;
  if (alarm.weekdays.length === 0 && alarm.nextFireAt) {
    const at = new Date(alarm.nextFireAt);
    return at.getTime() > now.getTime() ? at : null;
  }
  const skip = alarm.skipUntil ? new Date(alarm.skipUntil) : null;
  const from = skip && skip.getTime() > now.getTime() ? skip : now;
  return nextMatching(alarm.hour, alarm.minute, alarm.weekdays, from);
}

/** Det tillfälle som "Hoppa över nästa" skulle hoppa över (ignorerar pågående överhoppning). */
export function upcomingOccurrence(alarm: WakeAlarm, now: Date = new Date()): Date {
  return nextMatching(alarm.hour, alarm.minute, alarm.weekdays, now);
}

export function isSkipping(alarm: WakeAlarm, now: Date = new Date()): boolean {
  return !!alarm.skipUntil && new Date(alarm.skipUntil).getTime() > now.getTime();
}

/** Vad som ska schemaläggas i OS för ett larm. */
export interface SchedulePlan {
  /** Återkommande larm på dessa veckodagar (null = inget återkommande). */
  repeating: { weekdays: number[]; hour: number; minute: number } | null;
  /** Enskilda tillfällen. */
  fixed: Date[];
}

/** Antal veckor framåt som den överhoppade veckodagen täcks med enskilda larm. */
export const SKIP_COVER_WEEKS = 8;

/**
 * Översätter larmet till något OS kan schemalägga. Varken AlarmKit eller
 * AlarmManager kan hoppa över *ett* tillfälle i en återkommande serie, så vid
 * överhoppning tas den veckodagen bort ur serien och täcks i stället med enskilda
 * larm för kommande veckor. När överhoppningen passerat återställs serien vid nästa
 * appstart (planKey ändras).
 */
export function planSchedule(alarm: WakeAlarm, now: Date = new Date()): SchedulePlan {
  if (!alarm.enabled) return { repeating: null, fixed: [] };

  if (alarm.weekdays.length === 0) {
    const at = alarm.nextFireAt
      ? new Date(alarm.nextFireAt)
      : nextMatching(alarm.hour, alarm.minute, [], now);
    return { repeating: null, fixed: at.getTime() > now.getTime() ? [at] : [] };
  }

  if (!isSkipping(alarm, now)) {
    return {
      repeating: { weekdays: [...alarm.weekdays].sort(), hour: alarm.hour, minute: alarm.minute },
      fixed: [],
    };
  }

  const skipUntil = new Date(alarm.skipUntil!);
  // Den överhoppade veckodagen = veckodagen för tillfället strax före skipUntil
  const skipped = new Date(skipUntil.getTime() - 60_000);
  const skippedDay = jsDayToWeekday(skipped);
  const others = alarm.weekdays.filter((d) => d !== skippedDay).sort();

  const fixed: Date[] = [];
  let cursor = skipUntil;
  for (let i = 0; i < SKIP_COVER_WEEKS; i++) {
    const next = nextMatching(alarm.hour, alarm.minute, [skippedDay], cursor);
    fixed.push(next);
    cursor = next;
  }

  return {
    repeating: others.length > 0 ? { weekdays: others, hour: alarm.hour, minute: alarm.minute } : null,
    fixed,
  };
}

export function planKeyOf(plan: SchedulePlan): string {
  const r = plan.repeating
    ? `${plan.repeating.hour}:${plan.repeating.minute}@${plan.repeating.weekdays.join(',')}`
    : '-';
  return `${r}|${plan.fixed.map((d) => d.toISOString()).join(',')}`;
}

export interface SeriesSlot {
  hour: number;
  minute: number;
  /** Antal dygn efter seriens första larm (1 när serien passerar midnatt). */
  dayOffset: number;
  /** Minuter efter seriens första larm. */
  offsetMinutes: number;
}

/** Klockslag för en väckningsserie, t.ex. 06:00 + 5 × 10 min. Hanterar passage av midnatt. */
export function buildSeriesTimes(
  hour: number,
  minute: number,
  count: number,
  intervalMinutes: number
): SeriesSlot[] {
  return Array.from({ length: count }, (_, i) => {
    const offsetMinutes = i * intervalMinutes;
    const total = hour * 60 + minute + offsetMinutes;
    const inDay = total % (24 * 60);
    return {
      hour: Math.floor(inDay / 60),
      minute: inDay % 60,
      dayOffset: Math.floor(total / (24 * 60)),
      offsetMinutes,
    };
  });
}

/** Flyttar veckodagar framåt, t.ex. mån–fre + 1 dygn = tis–lör (1 = söndag … 7 = lördag). */
export function shiftWeekdays(weekdays: number[], dayOffset: number): number[] {
  const shift = ((dayOffset % 7) + 7) % 7;
  return weekdays.map((d) => ((d - 1 + shift) % 7) + 1).sort();
}

/** Fönster för "Jag är vaken": larm i serien som ringer inom så här lång tid hoppas över. */
export const AWAKE_WINDOW_MS = 3 * 60 * 60 * 1000;

/**
 * "Jag är vaken": hoppa över resten av seriens larm som ringer inom fönstret.
 * Returnerar nya skipUntil-värden per larm-ID.
 */
export function awakeSkips(
  series: WakeAlarm[],
  now: Date = new Date(),
  windowMs = AWAKE_WINDOW_MS
): Map<string, string> {
  const result = new Map<string, string>();
  for (const alarm of series) {
    const next = nextWakeOccurrence(alarm, now);
    if (next && next.getTime() - now.getTime() <= windowMs) {
      result.set(alarm.id, new Date(next.getTime() + 60_000).toISOString());
    }
  }
  return result;
}

/** Visa "Jag är vaken" om något larm i serien ringer inom fönstret. */
export function seriesIsImminent(series: WakeAlarm[], now: Date = new Date()): boolean {
  return awakeSkips(series, now).size > 0;
}

const clock = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });

export function formatHM(hour: number, minute: number): string {
  const d = new Date(2000, 0, 1, hour, minute);
  return clock.format(d);
}
