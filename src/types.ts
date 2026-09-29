/**
 * Alarm App - Typdefinitioner
 * Byggt enligt Kravspecifikation v1.1 och de 5 Arkitekturprinciperna.
 */

export type TriggerType = 'TIME' | 'ENTER_LOCATION' | 'EXIT_LOCATION';

export type AlarmStatus =
  | 'PENDING_ACCEPTANCE' // Vänlarm som mottagaren ännu inte har godkänt
  | 'SCHEDULED'
  | 'ACTIVE_GEOFENCE'
  | 'FIRED_LOCALLY'
  | 'MISSED' // Förföll medan enheten var avstängd – ringde aldrig
  | 'DONE'
  | 'CANCELLED';

/** Upprepning för tidslarm. */
export type RepeatRule = 'NONE' | 'DAILY' | 'WEEKDAYS';

export interface GeofenceLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number; // Måste vara >= MIN_GEOFENCE_RADIUS_METERS
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface LocalAlarm {
  id: string;
  creatorId: string;
  recipientId: string;
  content: string;
  checklistItems?: ChecklistItem[];
  triggerType: TriggerType;
  dateTime?: string | null; // ISO-sträng för TIME (för upprepade larm: första tillfället)
  repeat?: RepeatRule;
  location?: GeofenceLocation | null; // För ENTER/EXIT
  status: AlarmStatus;
  createdAt: string;
  completedAt?: string | null;
  /** OS-notis-ID:n för schemalagda notiser (flera för upprepning på vardagar). */
  notificationIds?: string[];
}

/**
 * Strikt Anti-Probing ACK (Princip 5):
 * Servern/avsändaren får ENDAST veta att geofence är registrerat på enheten,
 * ALDRIG koordinater, gränspassager eller tidpunkter för när mottagaren passerar zonen.
 */
export interface SyncAckPayload {
  alarmId: string;
  status: 'REGISTERED_ON_DEVICE';
  deviceTimestamp: string;
}

/**
 * Diagnostiklogg för fälttest. Lagras ENBART lokalt i SQLite.
 */
export type DiagnosticEventType =
  | 'ALARM_SCHEDULED'
  | 'ALARM_FIRED'
  | 'ALARM_MISSED'
  | 'GEOFENCE_REGISTERED'
  | 'GEOFENCE_ENTER'
  | 'GEOFENCE_EXIT'
  | 'PUSH_SYNC_RECEIVED'
  | 'PUSH_SYNC_REJECTED'
  | 'PUSH_ACK_DISPATCHED'
  | 'BOOT_RESTORE_TRIGGERED'
  | 'PERMISSION_CHANGED';

export type LifecycleState = 'FOREGROUND' | 'BACKGROUND' | 'TERMINATED_WAKEUP';

export interface DiagnosticLogEntry {
  id: string;
  timestamp: string; // ISO 8601
  eventType: DiagnosticEventType;
  targetId: string; // alarmId eller geofenceId
  scheduledTime?: string | null;
  delayMs?: number | null;
  batteryLevel: number; // 0.0 - 1.0 (-1 om okänt)
  isCharging: boolean;
  lowPowerMode: boolean;
  lifecycleState: LifecycleState;
  locationSnapshot?: {
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null;
  speedKmh?: number | null;
  note?: string | null;
}
