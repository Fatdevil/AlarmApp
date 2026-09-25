import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useCallback, useEffect, useState } from 'react';
import { AppState, Linking } from 'react-native';
import { logEvent } from './diagnostics';

export type PermissionState = 'granted' | 'denied' | 'undetermined';

export interface PermissionSnapshot {
  notifications: PermissionState;
  locationForeground: PermissionState;
  locationBackground: PermissionState;
}

function toState(p: { granted: boolean; canAskAgain: boolean; status: string }): PermissionState {
  if (p.granted) return 'granted';
  return p.status === 'undetermined' || p.canAskAgain ? 'undetermined' : 'denied';
}

export async function getPermissionSnapshot(): Promise<PermissionSnapshot> {
  const [n, fg, bg] = await Promise.all([
    Notifications.getPermissionsAsync(),
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
  ]);
  const provisional = n.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
  return {
    notifications: provisional ? 'granted' : toState(n),
    locationForeground: toState(fg),
    locationBackground: toState(bg),
  };
}

export async function requestNotificationPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const res = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });
  await logEvent('PERMISSION_CHANGED', 'NOTIFICATIONS', { note: `granted=${res.granted}` });
  return res.granted;
}

/** Förgrund först, därefter "Tillåt alltid" – krävs för geofencing i bakgrunden. */
export async function requestLocationPermissions(): Promise<{ foreground: boolean; background: boolean }> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return { foreground: false, background: false };
  const bg = await Location.requestBackgroundPermissionsAsync();
  await logEvent('PERMISSION_CHANGED', 'LOCATION', { note: `bg=${bg.granted}` });
  return { foreground: true, background: bg.granted };
}

export function openSystemSettings(): void {
  Linking.openSettings().catch(() => {});
}

/** Behörighetsstatus som uppdateras när användaren kommer tillbaka från Inställningar. */
export function usePermissions(): { permissions: PermissionSnapshot | null; refresh: () => Promise<void> } {
  const [permissions, setPermissions] = useState<PermissionSnapshot | null>(null);

  const refresh = useCallback(
    () =>
      getPermissionSnapshot()
        .then(setPermissions)
        .catch((err) => console.warn('[Permissions] Kunde inte läsa behörigheter:', err)),
    []
  );

  useEffect(() => {
    getPermissionSnapshot()
      .then(setPermissions)
      .catch((err) => console.warn('[Permissions] Kunde inte läsa behörigheter:', err));
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  return { permissions, refresh };
}
