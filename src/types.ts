/**
 * Alarm App PoC (R0) - Typdefinitioner
 * Byggt enligt Kravspecifikation v1.1 och de 5 Arkitekturprinciperna.
 */

export type TriggerType = 'TIME' | 'ENTER_LOCATION' | 'EXIT_LOCATION';

export type AlarmStatus = 
  // Lokal enhetsstatus
  | 'SCHEDULED' 
  | 'ACTIVE_GEOFENCE' 
  | 'FIRED_LOCALLY' 
  | 'DONE' 
  | 'CANCELLED';

export interface GeofenceLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number; // Måste vara >= 100m i R0/R1
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
  dateTime?: string | null; // ISO-sträng för TIME
  location?: GeofenceLocation | null; // För ENTER/EXIT
  status: AlarmStatus;
  createdAt: string;
  completedAt?: string | null;
  notificationId?: string | null; // OS notis-identifierare för schemalagda larm
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
 * Diagnostiklogg för R0 (48h till 7-dagars fälttest).
 * Lagras ENBART lokalt i SQLite. All data kan rensas med en knapptryckning.
 */
export type DiagnosticEventType = 
  | 'ALARM_SCHEDULED'
  | 'ALARM_FIRED'
  | 'GEOFENCE_REGISTERED'
  | 'GEOFENCE_ENTER'
  | 'GEOFENCE_EXIT'
  | 'PUSH_SYNC_RECEIVED'
  | 'PUSH_ACK_DISPATCHED'
  | 'BOOT_RESTORE_TRIGGERED'
  | 'PERMISSION_CHANGED';

export interface DiagnosticLogEntry {
  id: string;
  timestamp: string; // ISO 8601
  eventType: DiagnosticEventType;
  targetId: string; // alarmId eller geofenceId
  scheduledTime?: string | null;
  delayMs?: number | null; // Latens/avvikelse i millisekunder
  batteryLevel: number; // 0.0 - 1.0 (-1 om okänt)
  isCharging: boolean;
  lowPowerMode: boolean; // True om Low Power Mode / Batterisparläge är aktivt
  lifecycleState: 'FOREGROUND' | 'BACKGROUND' | 'TERMINATED_WAKEUP';
  locationSnapshot?: {
    latitude: number;
    longitude: number;
    accuracy: number;
  } | null;
  speedKmh?: number | null; // För att mäta gång (< 10 km/h) vs fordon (30-70 km/h)
  note?: string | null;
}
