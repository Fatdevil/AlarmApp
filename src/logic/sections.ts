/**
 * Grupperar larm i sektioner för startsidan (ren logik, testas i __tests__/sections.test.ts).
 */
import { LocalAlarm } from '../types';
import { isSameDay, nextOccurrence } from './time';

export type SectionKey = 'requests' | 'attention' | 'today' | 'upcoming' | 'places' | 'done';

export interface AlarmSection {
  key: SectionKey;
  title: string;
  data: LocalAlarm[];
}

const TITLES: Record<SectionKey, string> = {
  requests: 'Förfrågningar',
  attention: 'Har ringt',
  today: 'Idag',
  upcoming: 'Kommande',
  places: 'Platser',
  done: 'Klara',
};

export function classifyAlarm(alarm: LocalAlarm, now: Date = new Date()): SectionKey {
  switch (alarm.status) {
    case 'PENDING_ACCEPTANCE':
      return 'requests';
    case 'FIRED_LOCALLY':
    case 'MISSED':
      return 'attention';
    case 'DONE':
    case 'CANCELLED':
      return 'done';
    case 'ACTIVE_GEOFENCE':
      return 'places';
    case 'SCHEDULED': {
      if (alarm.triggerType !== 'TIME' || !alarm.dateTime) return 'places';
      const next = nextOccurrence(alarm.dateTime, alarm.repeat, now);
      // Engångslarm vars tid passerat har ringt – visa det under "Har ringt", inte "Kommande"
      if (!next) return 'attention';
      return isSameDay(next, now) ? 'today' : 'upcoming';
    }
  }
}

function sortKey(alarm: LocalAlarm, now: Date): number {
  if (alarm.triggerType === 'TIME' && alarm.dateTime) {
    const next = nextOccurrence(alarm.dateTime, alarm.repeat, now);
    return (next ?? new Date(alarm.dateTime)).getTime();
  }
  return new Date(alarm.createdAt).getTime();
}

export function buildSections(alarms: LocalAlarm[], now: Date = new Date()): AlarmSection[] {
  const order: SectionKey[] = ['requests', 'attention', 'today', 'upcoming', 'places', 'done'];
  const buckets = new Map<SectionKey, LocalAlarm[]>(order.map((k) => [k, []]));

  for (const alarm of alarms) {
    buckets.get(classifyAlarm(alarm, now))!.push(alarm);
  }

  return order
    .map((key) => {
      const data = [...buckets.get(key)!];
      if (key === 'done') {
        data.sort((a, b) => (b.completedAt ?? b.createdAt).localeCompare(a.completedAt ?? a.createdAt));
      } else {
        data.sort((a, b) => sortKey(a, now) - sortKey(b, now));
      }
      return { key, title: TITLES[key], data };
    })
    .filter((s) => s.data.length > 0);
}

export function countActive(alarms: LocalAlarm[]): number {
  return alarms.filter((a) => a.status === 'SCHEDULED' || a.status === 'ACTIVE_GEOFENCE').length;
}
