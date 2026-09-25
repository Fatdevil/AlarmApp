import * as SQLite from 'expo-sqlite';
import {
  AlarmStatus,
  ChecklistItem,
  DiagnosticEventType,
  DiagnosticLogEntry,
  GeofenceLocation,
  LifecycleState,
  LocalAlarm,
  RepeatRule,
  TriggerType,
} from '../types';
import { sanitizeDiagnosticLogs } from './sanitizer';

const DB_NAME = 'alarm_poc.db';
const MAX_DIAGNOSTIC_ROWS = 2000;

// Öppna eller skapa SQLite-databas synkront i appens sandlåda
const db = SQLite.openDatabaseSync(DB_NAME);

// --- ÄNDRINGSNOTISER (driver useAlarms via useSyncExternalStore) ---

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeToChanges(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyChange(): void {
  listeners.forEach((l) => l());
}

// --- MIGRERINGAR (PRAGMA user_version) ---

function hasColumn(table: string, column: string): boolean {
  const cols = db.getAllSync<{ name: string }>(`PRAGMA table_info(${table})`);
  return cols.some((c) => c.name === column);
}

function addColumnIfMissing(table: string, column: string, type: string): void {
  if (!hasColumn(table, column)) {
    db.execSync(`ALTER TABLE ${table} ADD COLUMN ${column} ${type};`);
  }
}

const MIGRATIONS: (() => void)[] = [
  // v1: grundschema
  () => {
    db.execSync(`
      CREATE TABLE IF NOT EXISTS alarms (
        id TEXT PRIMARY KEY,
        creatorId TEXT NOT NULL,
        recipientId TEXT NOT NULL,
        content TEXT NOT NULL,
        triggerType TEXT NOT NULL,
        dateTime TEXT,
        locationJson TEXT,
        status TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        completedAt TEXT
      );

      CREATE TABLE IF NOT EXISTS diagnostic_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        eventType TEXT NOT NULL,
        targetId TEXT NOT NULL,
        scheduledTime TEXT,
        delayMs INTEGER,
        batteryLevel REAL NOT NULL,
        isCharging INTEGER NOT NULL,
        lowPowerMode INTEGER NOT NULL,
        lifecycleState TEXT NOT NULL,
        locationSnapshotJson TEXT,
        speedKmh REAL,
        note TEXT
      );
    `);
  },
  // v2: checklistor och OS-notis-ID (kan redan finnas från äldre ad hoc-migreringar)
  () => {
    addColumnIfMissing('alarms', 'checklistItemsJson', 'TEXT');
    addColumnIfMissing('alarms', 'notificationId', 'TEXT');
  },
  // v3: upprepning, flera notis-ID:n, index
  () => {
    addColumnIfMissing('alarms', 'repeat', "TEXT NOT NULL DEFAULT 'NONE'");
    addColumnIfMissing('alarms', 'notificationIdsJson', 'TEXT');
    db.execSync(`
      UPDATE alarms SET notificationIdsJson = json_array(notificationId)
        WHERE notificationId IS NOT NULL AND notificationIdsJson IS NULL;
      CREATE INDEX IF NOT EXISTS idx_alarms_status ON alarms(status);
      CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON diagnostic_logs(timestamp);
    `);
  },
  // v4: enkla app-inställningar (nyckel/värde)
  () => {
    db.execSync('CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);');
  },
];

export function initDatabase(): void {
  db.execSync('PRAGMA journal_mode = WAL;');
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.withTransactionSync(() => {
      MIGRATIONS[v]();
      db.execSync(`PRAGMA user_version = ${v + 1}`);
    });
  }
}

initDatabase();

// --- RADMAPPNING ---

interface AlarmRow {
  id: string;
  creatorId: string;
  recipientId: string;
  content: string;
  triggerType: string;
  dateTime: string | null;
  locationJson: string | null;
  checklistItemsJson: string | null;
  status: string;
  createdAt: string;
  completedAt: string | null;
  repeat: string | null;
  notificationIdsJson: string | null;
}

function safeJsonParse<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

function rowToAlarm(r: AlarmRow): LocalAlarm {
  return {
    id: r.id,
    creatorId: r.creatorId,
    recipientId: r.recipientId,
    content: r.content,
    triggerType: r.triggerType as TriggerType,
    dateTime: r.dateTime,
    repeat: (r.repeat as RepeatRule | null) ?? 'NONE',
    location: safeJsonParse<GeofenceLocation | null>(r.locationJson, null),
    checklistItems: safeJsonParse<ChecklistItem[] | undefined>(r.checklistItemsJson, undefined),
    status: r.status as AlarmStatus,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
    notificationIds: safeJsonParse<string[]>(r.notificationIdsJson, []),
  };
}

// --- ALARM CRUD ---

export function saveAlarm(alarm: LocalAlarm): void {
  db.runSync(
    `INSERT OR REPLACE INTO alarms (
      id, creatorId, recipientId, content, triggerType, dateTime, locationJson,
      checklistItemsJson, status, createdAt, completedAt, repeat, notificationIdsJson
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      alarm.id,
      alarm.creatorId,
      alarm.recipientId,
      alarm.content,
      alarm.triggerType,
      alarm.dateTime ?? null,
      alarm.location ? JSON.stringify(alarm.location) : null,
      alarm.checklistItems ? JSON.stringify(alarm.checklistItems) : null,
      alarm.status,
      alarm.createdAt,
      alarm.completedAt ?? null,
      alarm.repeat ?? 'NONE',
      alarm.notificationIds?.length ? JSON.stringify(alarm.notificationIds) : null,
    ]
  );
  notifyChange();
}

export function getAlarm(id: string): LocalAlarm | null {
  const row = db.getFirstSync<AlarmRow>('SELECT * FROM alarms WHERE id = ?', [id]);
  return row ? rowToAlarm(row) : null;
}

export function getAllAlarms(): LocalAlarm[] {
  return db.getAllSync<AlarmRow>('SELECT * FROM alarms ORDER BY createdAt DESC').map(rowToAlarm);
}

export function getAlarmsByStatus(statuses: AlarmStatus[]): LocalAlarm[] {
  const placeholders = statuses.map(() => '?').join(', ');
  return db
    .getAllSync<AlarmRow>(
      `SELECT * FROM alarms WHERE status IN (${placeholders}) ORDER BY createdAt DESC`,
      statuses
    )
    .map(rowToAlarm);
}

export function findAlarmByLocationId(locationId: string): LocalAlarm | null {
  const row = db.getFirstSync<AlarmRow>(
    "SELECT * FROM alarms WHERE json_extract(locationJson, '$.id') = ?",
    [locationId]
  );
  return row ? rowToAlarm(row) : null;
}

export function updateAlarmStatus(id: string, status: AlarmStatus, completedAt?: string | null): void {
  db.runSync('UPDATE alarms SET status = ?, completedAt = ? WHERE id = ?', [
    status,
    completedAt ?? null,
    id,
  ]);
  notifyChange();
}

export function setNotificationIds(id: string, notificationIds: string[]): void {
  db.runSync('UPDATE alarms SET notificationIdsJson = ? WHERE id = ?', [
    notificationIds.length ? JSON.stringify(notificationIds) : null,
    id,
  ]);
  notifyChange();
}

export function toggleChecklistItem(alarmId: string, itemId: string): void {
  const alarm = getAlarm(alarmId);
  if (!alarm?.checklistItems) return;
  const updated = alarm.checklistItems.map((item) =>
    item.id === itemId ? { ...item, done: !item.done } : item
  );
  db.runSync('UPDATE alarms SET checklistItemsJson = ? WHERE id = ?', [
    JSON.stringify(updated),
    alarmId,
  ]);
  notifyChange();
}

export function deleteAlarm(id: string): void {
  db.runSync('DELETE FROM alarms WHERE id = ?', [id]);
  notifyChange();
}

// --- INSTÄLLNINGAR ---

export function getSetting(key: string): string | null {
  return db.getFirstSync<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', [key])?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  db.runSync('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)', [key, value]);
}

// --- DIAGNOSTIKLOGG ---

interface LogRow {
  id: string;
  timestamp: string;
  eventType: string;
  targetId: string;
  scheduledTime: string | null;
  delayMs: number | null;
  batteryLevel: number;
  isCharging: number;
  lowPowerMode: number;
  lifecycleState: string;
  locationSnapshotJson: string | null;
  speedKmh: number | null;
  note: string | null;
}

let logSeq = 0;

export function logDiagnosticEvent(entry: Omit<DiagnosticLogEntry, 'id'>): DiagnosticLogEntry {
  const id = `${Date.now()}_${(logSeq++).toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const fullEntry: DiagnosticLogEntry = { id, ...entry };

  db.runSync(
    `INSERT INTO diagnostic_logs (
      id, timestamp, eventType, targetId, scheduledTime, delayMs,
      batteryLevel, isCharging, lowPowerMode, lifecycleState,
      locationSnapshotJson, speedKmh, note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      fullEntry.id,
      fullEntry.timestamp,
      fullEntry.eventType,
      fullEntry.targetId,
      fullEntry.scheduledTime ?? null,
      fullEntry.delayMs ?? null,
      fullEntry.batteryLevel,
      fullEntry.isCharging ? 1 : 0,
      fullEntry.lowPowerMode ? 1 : 0,
      fullEntry.lifecycleState,
      fullEntry.locationSnapshot ? JSON.stringify(fullEntry.locationSnapshot) : null,
      fullEntry.speedKmh ?? null,
      fullEntry.note ?? null,
    ]
  );

  // Begränsa loggens storlek så att den inte växer obegränsat på enheten
  db.runSync(
    `DELETE FROM diagnostic_logs WHERE id NOT IN (
      SELECT id FROM diagnostic_logs ORDER BY timestamp DESC LIMIT ?
    )`,
    [MAX_DIAGNOSTIC_ROWS]
  );

  return fullEntry;
}

export function getDiagnosticLogs(limit = 100): DiagnosticLogEntry[] {
  return db
    .getAllSync<LogRow>('SELECT * FROM diagnostic_logs ORDER BY timestamp DESC LIMIT ?', [limit])
    .map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      eventType: r.eventType as DiagnosticEventType,
      targetId: r.targetId,
      scheduledTime: r.scheduledTime,
      delayMs: r.delayMs,
      batteryLevel: r.batteryLevel,
      isCharging: r.isCharging === 1,
      lowPowerMode: r.lowPowerMode === 1,
      lifecycleState: r.lifecycleState as LifecycleState,
      locationSnapshot: safeJsonParse(r.locationSnapshotJson, null),
      speedKmh: r.speedKmh,
      note: r.note,
    }));
}

/** Raderar endast diagnostiska loggar. */
export function purgeAllDiagnosticData(): void {
  db.runSync('DELETE FROM diagnostic_logs');
  db.execSync('VACUUM');
}

/** Raderar all lokal historik och alla larm permanent (GDPR art. 17). */
export function purgeAllLocalData(): void {
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM diagnostic_logs');
    db.runSync('DELETE FROM alarms');
  });
  db.execSync('VACUUM');
  notifyChange();
}

/**
 * Exporterar loggarna som JSON.
 * Om anonymizeLocation är true maskeras exakta koordinater.
 */
export function exportLogsAsJson(anonymizeLocation = true): string {
  const logs = getDiagnosticLogs(1000);
  return JSON.stringify(sanitizeDiagnosticLogs(logs, anonymizeLocation), null, 2);
}
