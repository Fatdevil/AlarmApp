/**
 * "Tid → följ upp vid plats": ett platslarm med en tid (dateTime). Vid tiden ringer ett
 * vanligt tidslarm; zonen är registrerad från början men larmar först efter tiden, så att
 * uppföljningen inte beror på att appen hinner köra kod när tidslarmet ringer.
 * Ren logik – testas i __tests__/followUp.test.ts.
 */
import { LocalAlarm } from '../types';

/** Platslarm som också ringer vid en tid innan platsen börjar gälla. */
export function hasTimeReminder(alarm: LocalAlarm): boolean {
  return alarm.triggerType !== 'TIME' && !!alarm.dateTime;
}

/** Om zonen får larma nu. Vanliga platslarm gäller direkt; uppföljningar först efter tiden. */
export function isZoneArmed(alarm: LocalAlarm, now: Date = new Date()): boolean {
  if (!hasTimeReminder(alarm)) return true;
  const from = new Date(alarm.dateTime!).getTime();
  return isNaN(from) || now.getTime() >= from;
}

/** "Sedan: när du lämnar Jobbet" – visas i tidslarmet och i listorna. */
export function followUpLine(alarm: LocalAlarm): string | null {
  if (!hasTimeReminder(alarm)) return null;
  const place = alarm.location?.name ?? 'platsen';
  return alarm.triggerType === 'ENTER_LOCATION'
    ? `Sedan: när du kommer till ${place}`
    : `Sedan: när du lämnar ${place}`;
}
