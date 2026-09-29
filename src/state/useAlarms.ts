import { useSyncExternalStore } from 'react';
import { LocalAlarm } from '../types';
import { getAllAlarms, notifyChange, subscribeToChanges } from '../services/db';

let cache: LocalAlarm[] | null = null;

function subscribe(onChange: () => void): () => void {
  return subscribeToChanges(() => {
    cache = null;
    onChange();
  });
}

function getSnapshot(): LocalAlarm[] {
  if (cache === null) {
    try {
      cache = getAllAlarms();
    } catch (err) {
      console.warn('[useAlarms] Kunde inte läsa larm:', err);
      cache = [];
    }
  }
  return cache;
}

/** Alla larm, alltid i synk med databasen (uppdateras vid varje skrivning). */
export function useAlarms(): LocalAlarm[] {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * Tvinga omläsning, t.ex. när appen kommer tillbaka från bakgrunden (bakgrundstasks
 * kan ha skrivit till databasen från en annan JS-runtime).
 */
export function refreshAlarms(): void {
  notifyChange();
}
