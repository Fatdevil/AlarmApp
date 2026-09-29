import { useSyncExternalStore } from 'react';
import { SavedPlace } from '../types';
import { getPlaces, subscribeToChanges } from '../services/db';

let cache: SavedPlace[] | null = null;

function subscribe(onChange: () => void): () => void {
  return subscribeToChanges(() => {
    cache = null;
    onChange();
  });
}

function getSnapshot(): SavedPlace[] {
  if (cache === null) {
    try {
      cache = getPlaces();
    } catch (err) {
      console.warn('[usePlaces] Kunde inte läsa platser:', err);
      cache = [];
    }
  }
  return cache;
}

/** Sparade platser i namnordning, alltid i synk med databasen. */
export function usePlaces(): SavedPlace[] {
  return useSyncExternalStore(subscribe, getSnapshot);
}
