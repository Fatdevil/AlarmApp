import { LocalAlarm } from '../types';
import { WakeAlarm } from './wake';

/** Vilka sorters larm som är aktiva – avgör vilka behörigheter som behövs. */
export function activeAlarmKinds(
  alarms: LocalAlarm[] = [],
  wakeAlarms: WakeAlarm[] = []
): { hasTime: boolean; hasPlaces: boolean } {
  return {
    // Väckningslarm ringer som systemlarm eller notis precis som tidslarm
    hasTime: alarms.some((a) => a.status === 'SCHEDULED') || wakeAlarms.some((w) => w.enabled),
    hasPlaces: alarms.some((a) => a.status === 'ACTIVE_GEOFENCE'),
  };
}
