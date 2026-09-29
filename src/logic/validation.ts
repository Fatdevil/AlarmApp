/**
 * Strikt validering av inkommande vänlarm (push-payload).
 * Payloaden är opålitlig data: vi bygger ett nytt objekt fält för fält och sprider
 * aldrig in okända nycklar.
 */
import {
  MAX_CHECKLIST_ITEMS,
  MAX_CONTENT_LENGTH,
  MAX_GEOFENCE_RADIUS_METERS,
  MIN_GEOFENCE_RADIUS_METERS,
} from '../constants';
import { ChecklistItem, LocalAlarm } from '../types';

export type ValidationResult =
  | { ok: true; alarm: LocalAlarm }
  | { ok: false; reason: string };

const ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function cleanString(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const trimmed = v.trim();
  if (trimmed.length === 0 || trimmed.length > max) return null;
  return trimmed;
}

function isFiniteInRange(v: unknown, min: number, max: number): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
}

export function validateIncomingAlarm(raw: unknown, nowIso: string): ValidationResult {
  if (!isRecord(raw)) return { ok: false, reason: 'alarm saknas eller är inte ett objekt' };

  const id = typeof raw.id === 'string' && ID_PATTERN.test(raw.id) ? raw.id : null;
  if (!id) return { ok: false, reason: 'ogiltigt id' };

  const creatorId =
    typeof raw.creatorId === 'string' && ID_PATTERN.test(raw.creatorId) ? raw.creatorId : null;
  if (!creatorId) return { ok: false, reason: 'ogiltig avsändare' };

  const content = cleanString(raw.content, MAX_CONTENT_LENGTH);
  if (!content) return { ok: false, reason: 'ogiltig text' };

  // Vänlarm är alltid platslarm – tidslarm kan inte skickas mellan enheter i R0
  if (raw.triggerType !== 'ENTER_LOCATION' && raw.triggerType !== 'EXIT_LOCATION') {
    return { ok: false, reason: 'ogiltig triggertyp' };
  }

  const loc = raw.location;
  if (!isRecord(loc)) return { ok: false, reason: 'plats saknas' };
  const locId = typeof loc.id === 'string' && ID_PATTERN.test(loc.id) ? loc.id : null;
  const locName = cleanString(loc.name, 100);
  if (!locId || !locName) return { ok: false, reason: 'ogiltig plats' };
  if (!isFiniteInRange(loc.latitude, -90, 90) || !isFiniteInRange(loc.longitude, -180, 180)) {
    return { ok: false, reason: 'ogiltiga koordinater' };
  }
  if (!isFiniteInRange(loc.radius, MIN_GEOFENCE_RADIUS_METERS, MAX_GEOFENCE_RADIUS_METERS)) {
    return {
      ok: false,
      reason: `radie måste vara ${MIN_GEOFENCE_RADIUS_METERS}–${MAX_GEOFENCE_RADIUS_METERS} m`,
    };
  }

  let checklistItems: ChecklistItem[] | undefined;
  if (raw.checklistItems !== undefined) {
    if (!Array.isArray(raw.checklistItems) || raw.checklistItems.length > MAX_CHECKLIST_ITEMS) {
      return { ok: false, reason: 'ogiltig checklista' };
    }
    checklistItems = [];
    for (const item of raw.checklistItems) {
      if (!isRecord(item)) return { ok: false, reason: 'ogiltig checklistepunkt' };
      const itemId = typeof item.id === 'string' && ID_PATTERN.test(item.id) ? item.id : null;
      const text = cleanString(item.text, MAX_CONTENT_LENGTH);
      if (!itemId || !text) return { ok: false, reason: 'ogiltig checklistepunkt' };
      checklistItems.push({ id: itemId, text, done: false });
    }
  }

  return {
    ok: true,
    alarm: {
      id,
      creatorId,
      recipientId: 'ME',
      content,
      checklistItems,
      triggerType: raw.triggerType,
      dateTime: null,
      location: {
        id: locId,
        name: locName,
        latitude: loc.latitude,
        longitude: loc.longitude,
        radius: loc.radius,
      },
      // Mottagaren måste själv godkänna innan någon geofence registreras
      status: 'PENDING_ACCEPTANCE',
      createdAt: nowIso,
    },
  };
}
