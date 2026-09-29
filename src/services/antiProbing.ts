/**
 * Strikt Anti-Probing ACK Validering (Princip 5)
 *
 * Servern/avsändaren får ENDAST veta att geofence är registrerat på mottagarens enhet.
 * Ett utgående ACK får ALDRIG innehålla platsdata, koordinater eller triggerstatus
 * (förhindrar probing/stalking). Vitlista: exakt de tre tillåtna nycklarna.
 */
import { SyncAckPayload } from '../types';

const ALLOWED_KEYS = ['alarmId', 'deviceTimestamp', 'status'];

export function validateAntiProbingAck(ack: unknown): ack is SyncAckPayload {
  const isObject = typeof ack === 'object' && ack !== null && !Array.isArray(ack);
  const keys = isObject ? Object.keys(ack).sort() : [];
  const valid =
    isObject &&
    keys.length === ALLOWED_KEYS.length &&
    keys.every((k, i) => k === ALLOWED_KEYS[i]) &&
    (ack as SyncAckPayload).status === 'REGISTERED_ON_DEVICE' &&
    typeof (ack as SyncAckPayload).alarmId === 'string' &&
    typeof (ack as SyncAckPayload).deviceTimestamp === 'string';

  if (!valid) {
    throw new Error(
      'SÄKERHETSAVVIKELSE MOT PRINCIP 5: ACK får ALDRIG innehålla platsdata eller triggerstatus!'
    );
  }
  return true;
}
