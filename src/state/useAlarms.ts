import { useSyncExternalStore } from 'react';
import { WakeAlarm } from '../logic/wake';
import { LocalAlarm } from '../types';
import { getAllAlarms, getWakeAlarms, notifyChange, subscribeToChanges } from '../services/db';

let cache: LocalAlarm[] | null = null;

let wakeCache: WakeAlarm[] | null = null;

function subscribe(onChange: () => void): () => void {
  return subscribeToChanges(() => {
    cache = null;
    wakeCache = null;
    onChange();
  });
}

function getWakeSnapshot(): WakeAlarm[] {
  if (wakeCache === null) {
    try {
      wakeCache = getWakeAlarms();
    } catch (err) {
      console.warn('[useWakeAlarms] Kunde inte läsa väckningslarm:', err);
      wakeCache = [];
    }
  }
  return wakeCache;
}

/** Alla väckningslarm, i synk med databasen. */
export function useWakeAlarms(): WakeAlarm[] {
  return useSyncExternalStore(subscribe, getWakeSnapshot);
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
