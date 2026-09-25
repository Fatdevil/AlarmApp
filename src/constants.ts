/**
 * Alarm App PoC (R0) - Centrala Konstanter och Arkitekturinvarianter
 * Byggt enligt Kravspecifikation v1.1 och de 5 Arkitekturprinciperna.
 */

// Minsta tillåtna radie enligt R0 acceptanskriterier (garanterar cell/Wi-Fi-tillförlitlighet utan batteridränering)
export const MIN_GEOFENCE_RADIUS_METERS = 100;

// Standardradie för konsumentflödet
export const DEFAULT_GEOFENCE_RADIUS_METERS = 150;

// iOS hård gräns för samtidigt övervakade regioner i CoreLocation
export const IOS_MAX_GEOFENCES = 20;
