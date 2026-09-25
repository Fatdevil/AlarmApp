/**
 * Alarm App - Centrala Konstanter och Arkitekturinvarianter
 */

// Minsta tillåtna radie (garanterar cell/Wi-Fi-tillförlitlighet utan batteridränering)
export const MIN_GEOFENCE_RADIUS_METERS = 100;

// Största tillåtna radie för inkommande vänlarm (skydd mot orimliga payloads)
export const MAX_GEOFENCE_RADIUS_METERS = 5000;

// Standardradie för konsumentflödet
export const DEFAULT_GEOFENCE_RADIUS_METERS = 150;

export const GEOFENCE_RADIUS_OPTIONS = [100, 150, 200, 500] as const;

// iOS hård gräns för samtidigt övervakade regioner i CoreLocation
export const IOS_MAX_GEOFENCES = 20;

// Snooze-längd för notisåtgärden "Snooza"
export const SNOOZE_MINUTES = 10;

// Hur länge "Ångra" visas efter radering/klarmarkering
export const UNDO_TIMEOUT_MS = 5000;

// Max längd på larmtext / checklistepunkt (skydd mot orimliga payloads)
export const MAX_CONTENT_LENGTH = 500;
export const MAX_CHECKLIST_ITEMS = 50;
