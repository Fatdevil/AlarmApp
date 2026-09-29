/**
 * Regler för sparade platser (ren logik, testas i __tests__/places.test.ts).
 */
import { MAX_GEOFENCE_RADIUS_METERS, MIN_GEOFENCE_RADIUS_METERS } from '../constants';
import { GeofenceLocation, SavedPlace } from '../types';

export const MAX_PLACE_NAME_LENGTH = 40;

export interface PlaceInput {
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
}

/** Returnerar ett felmeddelande att visa, eller null om platsen kan sparas. */
export function validatePlace(input: PlaceInput, existing: SavedPlace[], editingId?: string): string | null {
  const name = input.name.trim();
  if (!name) return 'Ge platsen ett namn, t.ex. Hemma eller Jobbet.';
  if (name.length > MAX_PLACE_NAME_LENGTH) return `Namnet får vara högst ${MAX_PLACE_NAME_LENGTH} tecken.`;
  const taken = existing.some(
    (p) => p.id !== editingId && p.name.trim().toLocaleLowerCase('sv-SE') === name.toLocaleLowerCase('sv-SE')
  );
  if (taken) return `Du har redan en plats som heter ${name}.`;
  const validCoords =
    Number.isFinite(input.latitude) &&
    Number.isFinite(input.longitude) &&
    Math.abs(input.latitude) <= 90 &&
    Math.abs(input.longitude) <= 180;
  if (!validCoords) return 'Välj var platsen ligger.';
  if (input.radius < MIN_GEOFENCE_RADIUS_METERS || input.radius > MAX_GEOFENCE_RADIUS_METERS) {
    return `Radien måste vara ${MIN_GEOFENCE_RADIUS_METERS}–${MAX_GEOFENCE_RADIUS_METERS} m.`;
  }
  return null;
}

/** Platslarmets kopia av en sparad plats. Samma id gör att larm på platsen delar en zon. */
export function locationFromPlace(place: SavedPlace): GeofenceLocation {
  return {
    id: place.id,
    name: place.name,
    latitude: place.latitude,
    longitude: place.longitude,
    radius: place.radius,
  };
}
