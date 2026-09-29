import { LocalAlarm } from '../types';

/** Vilka sorters larm som är aktiva – avgör vilka behörigheter som behövs. */
export function activeAlarmKinds(alarms: LocalAlarm[] = []): { hasTime: boolean; hasPlaces: boolean } {
  return {
    hasTime: alarms.some((a) => a.status === 'SCHEDULED'),
    hasPlaces: alarms.some((a) => a.status === 'ACTIVE_GEOFENCE'),
  };
}
