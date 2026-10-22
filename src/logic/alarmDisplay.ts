/**
 * Hur en påminnelse presenteras i listorna (ren logik, testas i __tests__/alarmDisplay.test.ts).
 * Tid visas i orange, plats i blått – se theme (accent/place).
 */
import { LocalAlarm } from '../types';
import { followUpLine, hasTimeReminder, isZoneArmed } from './followUp';
import { nextTimedRing } from './notificationBudget';
import { formatCountdown, formatDayLabel, isSameDay, REPEAT_LABELS } from './time';

export type AlarmKind = 'time' | 'place';

/** Ringer härnäst vid en tid (tidslarm, eller uppföljning före sin tid), annars plats. */
export function alarmKind(alarm: LocalAlarm, now: Date): AlarmKind {
  if (alarm.triggerType === 'TIME') return 'time';
  return hasTimeReminder(alarm) && !isZoneArmed(alarm, now) ? 'time' : 'place';
}

/** Klockslaget som visas för raden: nästa ringning, eller den passerade tiden för ett larm som har ringt. */
export function shownTime(alarm: LocalAlarm, now: Date): Date | null {
  const next = nextTimedRing(alarm, now);
  if (next) return next;
  return alarm.dateTime && alarmKind(alarm, now) === 'time' ? new Date(alarm.dateTime) : null;
}

/** "När du lämnar Jobbet" / "När du kommer till ICA". */
export function placeLine(alarm: LocalAlarm): string | null {
  if (!alarm.location) return null;
  return alarm.triggerType === 'ENTER_LOCATION'
    ? `När du kommer till ${alarm.location.name}`
    : `När du lämnar ${alarm.location.name}`;
}

/** Kortare uppgifter under texten, i den ordning de visas. */
export function rowDetails(alarm: LocalAlarm, now: Date): string[] {
  const details: string[] = [];
  // Nedräkning för det som ringer idag ("om 2 tim"); senare dagar visar dagen under klockslaget
  const next = nextTimedRing(alarm, now);
  if (next && isSameDay(next, now)) details.push(formatCountdown(next, now));
  if (alarm.repeat && alarm.repeat !== 'NONE') details.push(REPEAT_LABELS[alarm.repeat]);
  if (alarmKind(alarm, now) === 'place') {
    const line = placeLine(alarm);
    if (line) details.push(line);
    if (alarm.status === 'ACTIVE_GEOFENCE' && alarm.location) details.push(`${alarm.location.radius} m`);
  }
  const items = alarm.checklistItems ?? [];
  if (items.length > 0) details.push(`${items.filter((i) => i.done).length} av ${items.length}`);
  if (alarm.status === 'MISSED') details.push('Missat – kunde inte schemaläggas');
  // iOS utan systemlarm: ligger inte i telefonens schema än (se services/notificationBudget.ts)
  if (next && !alarm.notificationIds?.length) {
    details.push('läggs in när appen öppnas närmare tiden');
  }
  return details;
}

/** Slutstatus som läses upp och visas för klara och avbrutna påminnelser. */
export function finishedLabel(alarm: LocalAlarm): string | null {
  if (alarm.status === 'DONE') return 'Klar';
  if (alarm.status === 'CANCELLED') return 'Avbrutet';
  return null;
}

/** Uppföljningen som visas i blått under en tidspåminnelse, om den har en. */
export function rowFollowUp(alarm: LocalAlarm, now: Date): string | null {
  return alarmKind(alarm, now) === 'time' ? followUpLine(alarm) : null;
}

/** "imorgon", "fre 31 okt" – under klockslaget för påminnelser som inte är idag. */
export function shortDay(date: Date, now: Date): string | null {
  const label = formatDayLabel(date, now);
  return label === 'Idag' ? null : label.charAt(0).toLowerCase() + label.slice(1);
}

/** Påminnelsen som ringer härnäst – visas stort överst på startsidan. */
export function pickNext(alarms: LocalAlarm[], now: Date): LocalAlarm | null {
  let best: { alarm: LocalAlarm; at: number } | null = null;
  for (const alarm of alarms) {
    const at = nextTimedRing(alarm, now)?.getTime();
    if (at !== undefined && (!best || at < best.at)) best = { alarm, at };
  }
  return best?.alarm ?? null;
}
