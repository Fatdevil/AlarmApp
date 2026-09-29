/**
 * Behörighetsflöde i sammanhanget: förklara först, fråga sedan – och bara det som
 * larmtypen faktiskt behöver.
 */
import { Alert, Platform } from 'react-native';
import { TriggerType } from '../types';
import {
  getPermissionSnapshot,
  openSystemSettings,
  requestLocationPermissions,
  requestNotificationPermission,
  requestSystemAlarmPermission,
} from './permissions';

export function confirm(title: string, message: string, confirmLabel: string): Promise<boolean> {
  return new Promise((resolve) =>
    Alert.alert(title, message, [
      { text: 'Inte nu', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmLabel, onPress: () => resolve(true) },
    ])
  );
}

export function showSettingsAlert(title: string, message: string) {
  Alert.alert(title, message, [
    { text: 'Avbryt', style: 'cancel' },
    { text: 'Öppna Inställningar', onPress: openSystemSettings },
  ]);
}

/** TIME: tidspåminnelser, som ringer som systemlarm när det är tillåtet. */
export async function ensurePermissions(triggerType: TriggerType): Promise<boolean> {
  const perms = await getPermissionSnapshot();

  // iOS 26+: riktiga systemlarm (AlarmKit). Nekas det faller vi tillbaka till notiser.
  let systemAlarms = perms.systemAlarms;
  if (triggerType === 'TIME' && systemAlarms === 'undetermined') {
    const ok = await confirm(
      'Tillåt larm',
      'Då ringer larmet som en väckarklocka – även i tyst läge och med Fokus på.',
      'Fortsätt'
    );
    if (ok && (await requestSystemAlarmPermission())) systemAlarms = 'granted';
  }

  // AlarmKit behöver inga notiser. Android-larm och platslarm visas som notiser.
  const needsNotifications =
    triggerType !== 'TIME' || !(Platform.OS === 'ios' && systemAlarms === 'granted');

  if (needsNotifications && perms.notifications !== 'granted') {
    if (perms.notifications === 'denied') {
      showSettingsAlert('Notiser är avstängda', 'Slå på notiser för Alarm App för att larmet ska kunna ringa.');
      return false;
    }
    const ok = await confirm(
      'Tillåt notiser',
      'Larmet visas som en notis med ljud. Utan notiser kan det inte ringa.',
      'Fortsätt'
    );
    if (!ok || !(await requestNotificationPermission())) return false;
  }

  if (triggerType !== 'TIME' && perms.locationBackground !== 'granted') {
    if (perms.locationBackground === 'denied') {
      showSettingsAlert(
        'Platsåtkomst krävs',
        'Välj "Tillåt alltid" under Plats i Inställningar. Positionen används bara på telefonen.'
      );
      return false;
    }
    const ok = await confirm(
      'Platsåtkomst "Tillåt alltid"',
      'Telefonen behöver kunna känna av när du passerar platsen, även när appen är stängd. Din position lämnar aldrig telefonen.',
      'Fortsätt'
    );
    if (!ok) return false;
    const res = await requestLocationPermissions();
    if (!res.background) {
      showSettingsAlert(
        'Platslarm kräver "Tillåt alltid"',
        'Du kan ändra detta under Plats i Inställningar.'
      );
      return false;
    }
  }
  return true;
}
