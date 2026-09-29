/**
 * Sparade platser. Aktiva platslarm har en kopia av platsen; när platsen flyttas eller
 * byter radie uppdateras kopiorna och zonerna registreras om (allt eller inget).
 */
import { newId } from '../logic/ids';
import { PlaceInput, validatePlace } from '../logic/places';
import { SavedPlace } from '../types';
import {
  deletePlace,
  findActiveAlarmsByLocationId,
  getPlace,
  getPlaces,
  restorePlaceAndAlarms,
  savePlace,
  savePlaceAndActiveAlarms,
} from './db';
import { syncGeofencesWithOs } from './geofence';

function clean(input: PlaceInput): PlaceInput {
  return { ...input, name: input.name.trim() };
}

export function createPlace(input: PlaceInput, now: Date = new Date()): SavedPlace {
  const error = validatePlace(input, getPlaces());
  if (error) throw new Error(error);
  const place: SavedPlace = { id: newId('place'), ...clean(input), createdAt: now.toISOString() };
  savePlace(place);
  return place;
}

export async function updatePlace(id: string, input: PlaceInput): Promise<SavedPlace> {
  const previous = getPlace(id);
  if (!previous) throw new Error('Platsen finns inte längre.');
  const error = validatePlace(input, getPlaces(), id);
  if (error) throw new Error(error);

  const updated: SavedPlace = { ...previous, ...clean(input) };
  const affected = savePlaceAndActiveAlarms(updated);
  if (affected.length === 0) return updated;
  try {
    await syncGeofencesWithOs();
  } catch (err) {
    restorePlaceAndAlarms(previous, affected);
    await syncGeofencesWithOs().catch(() => {});
    throw err;
  }
  return updated;
}

/** Antal aktiva platslarm som använder platsen. */
export function activeAlarmCount(placeId: string): number {
  return findActiveAlarmsByLocationId(placeId).length;
}

/** Tar bort platsen. Larm som använder den behåller sin kopia och fortsätter fungera. */
export function removePlace(id: string): void {
  deletePlace(id);
}
