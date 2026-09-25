/**
 * Riktiga systemlarm:
 * - iOS 26+: AlarmKit – bryter igenom tyst läge och Fokus, visas på låsskärmen.
 * - Android: AlarmManager.setAlarmClock + helskärmsvy över låsskärmen och
 *   ljud som upprepas tills användaren stänger av.
 *
 * Modulen är valfri: i Expo Go, på webben, i tester och på iOS < 26 är den
 * otillgänglig och appen faller tillbaka till vanliga notiser.
 */
import { requireOptionalNativeModule } from 'expo-modules-core';

export type AlarmAuthorization = 'authorized' | 'denied' | 'notDetermined' | 'unavailable';

interface NativeAlarmModule {
  isAvailable(): boolean;
  getAuthorizationStatus(): Promise<AlarmAuthorization>;
  requestAuthorization(): Promise<AlarmAuthorization>;
  schedule(
    id: string,
    title: string,
    timestampMs: number,
    hour: number,
    minute: number,
    weekdays: number[]
  ): Promise<void>;
  cancel(id: string): Promise<void>;
  getScheduledIds(): Promise<string[]>;
  canUseFullScreenIntent(): boolean;
  openFullScreenIntentSettings(): void;
}

const NativeModule = requireOptionalNativeModule<NativeAlarmModule>('NativeAlarm');

export function isNativeAlarmAvailable(): boolean {
  try {
    return NativeModule?.isAvailable() ?? false;
  } catch {
    return false;
  }
}

export async function getNativeAlarmAuthorization(): Promise<AlarmAuthorization> {
  if (!isNativeAlarmAvailable()) return 'unavailable';
  return NativeModule!.getAuthorizationStatus();
}

export async function requestNativeAlarmAuthorization(): Promise<AlarmAuthorization> {
  if (!isNativeAlarmAvailable()) return 'unavailable';
  return NativeModule!.requestAuthorization();
}

export interface NativeAlarmSpec {
  /** UUID (krav från AlarmKit). */
  id: string;
  title: string;
  /** Första/enda tillfället. */
  date: Date;
  /** 1 = söndag … 7 = lördag. Tom = engångslarm. */
  weekdays: number[];
}

export async function scheduleNativeAlarm(spec: NativeAlarmSpec): Promise<void> {
  if (!isNativeAlarmAvailable()) throw new Error('Systemlarm är inte tillgängliga på den här enheten.');
  await NativeModule!.schedule(
    spec.id,
    spec.title,
    spec.date.getTime(),
    spec.date.getHours(),
    spec.date.getMinutes(),
    spec.weekdays
  );
}

export async function cancelNativeAlarm(id: string): Promise<void> {
  if (!isNativeAlarmAvailable()) return;
  await NativeModule!.cancel(id);
}

/** ID:n för larm som systemet fortfarande har schemalagda (gemener). */
export async function getScheduledNativeAlarmIds(): Promise<string[]> {
  if (!isNativeAlarmAvailable()) return [];
  const ids = await NativeModule!.getScheduledIds();
  return ids.map((id) => id.toLowerCase());
}

/** Android 14+: false om användaren har stängt av helskärmslarm för appen. */
export function canUseFullScreenAlarms(): boolean {
  if (!isNativeAlarmAvailable()) return true;
  return NativeModule!.canUseFullScreenIntent();
}

export function openFullScreenAlarmSettings(): void {
  NativeModule?.openFullScreenIntentSettings();
}
