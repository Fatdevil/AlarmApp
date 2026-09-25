import { AppState } from 'react-native';
import { DiagnosticEventType, DiagnosticLogEntry, LifecycleState } from '../types';
import { getBatterySnapshot } from './battery';
import { logDiagnosticEvent } from './db';

type Extra = Partial<
  Pick<DiagnosticLogEntry, 'scheduledTime' | 'delayMs' | 'locationSnapshot' | 'speedKmh' | 'note'>
>;

function currentLifecycle(): LifecycleState {
  return AppState.currentState === 'active' ? 'FOREGROUND' : 'BACKGROUND';
}

/**
 * Loggar en diagnostikhändelse lokalt. Får aldrig kasta – diagnostik ska inte
 * kunna stoppa ett larm.
 */
export async function logEvent(
  eventType: DiagnosticEventType,
  targetId: string,
  extra: Extra = {},
  lifecycleState: LifecycleState = currentLifecycle()
): Promise<void> {
  try {
    const battery = await getBatterySnapshot();
    logDiagnosticEvent({
      timestamp: new Date().toISOString(),
      eventType,
      targetId,
      ...battery,
      lifecycleState,
      ...extra,
    });
  } catch (err) {
    console.warn('[Diagnostics] Kunde inte logga händelse:', err);
  }
}
