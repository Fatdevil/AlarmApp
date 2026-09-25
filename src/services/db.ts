import * as SQLite from 'expo-sqlite';
import { LocalAlarm, DiagnosticLogEntry, DiagnosticEventType, AlarmStatus } from '../types';
import { sanitizeDiagnosticLogs } from './sanitizer';

const DB_NAME = 'alarm_poc.db';

// Öppna eller skapa SQLite-databas synkront i enhetens säkra sandlåda
const db = SQLite.openDatabaseSync(DB_NAME);

// Hjälpfunktion för felsäker JSON-parsninng
function safeJsonParse<T>(jsonStr: string | null | undefined, fallback: T): T {
  if (!jsonStr) return fallback;
  try {
    return JSON.parse(jsonStr);
  } catch {
    return fallback;
  }
}

// Initiera databastabeller
export function initDatabase(): void {
  db.execSync(`
    PRAGMA journal_mode = WAL;
    
    CREATE TABLE IF NOT EXISTS alarms (
      id TEXT PRIMARY KEY,
      creatorId TEXT NOT NULL,
      recipientId TEXT NOT NULL,
      content TEXT NOT NULL,
      triggerType TEXT NOT NULL,
      dateTime TEXT,
      locationJson TEXT,
      checklistItemsJson TEXT,
      status TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      completedAt TEXT,
      notificationId TEXT
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

  // Migrationer om kolumner saknas i befintlig databas
  try {
    db.execSync('ALTER TABLE alarms ADD COLUMN checklistItemsJson TEXT;');
  } catch {
    // Redan tillagd
  }

  try {
    db.execSync('ALTER TABLE alarms ADD COLUMN notificationId TEXT;');
  } catch {
    // Redan tillagd
  }
}

// Kör initiering omedelbart
initDatabase();

// --- ALARM CRUD OPERATIONS ---

export function saveAlarm(alarm: LocalAlarm): void {
  db.runSync(
    `INSERT OR REPLACE INTO alarms (
      id, creatorId, recipientId, content, triggerType, dateTime, locationJson, checklistItemsJson, status, createdAt, completedAt, notificationId
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      alarm.id,
      alarm.creatorId,
      alarm.recipientId,
      alarm.content,
      alarm.triggerType,
      alarm.dateTime || null,
      alarm.location ? JSON.stringify(alarm.location) : null,
      alarm.checklistItems ? JSON.stringify(alarm.checklistItems) : null,
      alarm.status,
      alarm.createdAt,
      alarm.completedAt || null,
      alarm.notificationId || null,
    ]
  );
}

export function getAllAlarms(): LocalAlarm[] {
  const rows = db.getAllSync<any>('SELECT * FROM alarms ORDER BY createdAt DESC');
  return rows.map((r) => ({
    id: r.id,
    creatorId: r.creatorId,
    recipientId: r.recipientId,
    content: r.content,
    triggerType: r.triggerType,
    dateTime: r.dateTime,
    location: safeJsonParse(r.locationJson, null),
    checklistItems: safeJsonParse(r.checklistItemsJson, undefined),
    status: r.status as AlarmStatus,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
    notificationId: r.notificationId || null,
  }));
}

export function getPendingAlarms(): LocalAlarm[] {
  const rows = db.getAllSync<any>(
    "SELECT * FROM alarms WHERE status IN ('SCHEDULED', 'ACTIVE_GEOFENCE')"
  );
  return rows.map((r) => ({
    id: r.id,
    creatorId: r.creatorId,
    recipientId: r.recipientId,
    content: r.content,
    triggerType: r.triggerType,
    dateTime: r.dateTime,
    location: safeJsonParse(r.locationJson, null),
    checklistItems: safeJsonParse(r.checklistItemsJson, undefined),
    status: r.status as AlarmStatus,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
    notificationId: r.notificationId || null,
  }));
}

export function updateAlarmStatus(id: string, status: AlarmStatus, completedAt?: string): void {
  db.runSync(
    'UPDATE alarms SET status = ?, completedAt = ? WHERE id = ?',
    [status, completedAt || null, id]
  );
}

export function toggleChecklistItem(alarmId: string, itemId: string): LocalAlarm | null {
  const rows = db.getAllSync<any>('SELECT * FROM alarms WHERE id = ?', [alarmId]);
  if (rows.length === 0) return null;

  const r = rows[0];
  const items = safeJsonParse<any[]>(r.checklistItemsJson, []);
  const updatedItems = items.map((item: any) =>
    item.id === itemId ? { ...item, done: !item.done } : item
  );

  db.runSync('UPDATE alarms SET checklistItemsJson = ? WHERE id = ?', [
    JSON.stringify(updatedItems),
    alarmId,
  ]);

  return {
    id: r.id,
    creatorId: r.creatorId,
    recipientId: r.recipientId,
    content: r.content,
    triggerType: r.triggerType,
    dateTime: r.dateTime,
    location: safeJsonParse(r.locationJson, null),
    checklistItems: updatedItems,
    status: r.status as AlarmStatus,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
    notificationId: r.notificationId || null,
  };
}

export function deleteAlarm(id: string): void {
  db.runSync('DELETE FROM alarms WHERE id = ?', [id]);
}

// --- DIAGNOSTIC LOGGER (Fas 2 & Fas 6) ---

export function logDiagnosticEvent(
  entry: Omit<DiagnosticLogEntry, 'id'>
): DiagnosticLogEntry {
  const id = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
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
      fullEntry.scheduledTime || null,
      fullEntry.delayMs ?? null,
      fullEntry.batteryLevel,
      fullEntry.isCharging ? 1 : 0,
      fullEntry.lowPowerMode ? 1 : 0,
      fullEntry.lifecycleState,
      fullEntry.locationSnapshot ? JSON.stringify(fullEntry.locationSnapshot) : null,
      fullEntry.speedKmh ?? null,
      fullEntry.note || null,
    ]
  );

  return fullEntry;
}

export function getDiagnosticLogs(limit = 100): DiagnosticLogEntry[] {
  const rows = db.getAllSync<any>(
    'SELECT * FROM diagnostic_logs ORDER BY timestamp DESC LIMIT ?',
    [limit]
  );

  return rows.map((r) => ({
    id: r.id,
    timestamp: r.timestamp,
    eventType: r.eventType as DiagnosticEventType,
    targetId: r.targetId,
    scheduledTime: r.scheduledTime,
    delayMs: r.delayMs,
    batteryLevel: r.batteryLevel,
    isCharging: r.isCharging === 1,
    lowPowerMode: r.lowPowerMode === 1,
    lifecycleState: r.lifecycleState,
    locationSnapshot: safeJsonParse(r.locationSnapshotJson, null),
    speedKmh: r.speedKmh,
    note: r.note,
  }));
}

/**
 * GDPR / Datasanering:
 * Raderar endast diagnostiska loggar.
 */
export function purgeAllDiagnosticData(): void {
  db.runSync('DELETE FROM diagnostic_logs');
  db.runSync('VACUUM');
}

/**
 * GDPR / Komplett datarensning (Art. 17 GDPR):
 * Raderar all lokal historik och alla larm permanent från SQLite.
 */
export function purgeAllLocalData(): void {
  db.runSync('DELETE FROM diagnostic_logs');
  db.runSync('DELETE FROM alarms');
  db.runSync('VACUUM');
}

/**
 * Exporterar loggarna som JSON.
 * Om anonymizeLocation är true, maskeras exakta koordinater med sanitizeDiagnosticLogs.
 */
export function exportLogsAsJson(anonymizeLocation = true): string {
  const logs = getDiagnosticLogs(1000);
  const sanitized = sanitizeDiagnosticLogs(logs, anonymizeLocation);
  return JSON.stringify(sanitized, null, 2);
}
