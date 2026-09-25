/**
 * Strikt Anti-Probing ACK Validering (Princip 5)
 * 
 * Servern/avsändaren får ENDAST veta att geofence är registrerat på mottagarens enhet.
 * Ett utgående ACK får ALDRIG innehålla platsdata, koordinater eller triggerstatus
 * (förhindrar probing/stalking).
 */

export function validateAntiProbingAck(ack: any): boolean {
  if (
    !ack ||
    typeof ack !== 'object' ||
    'latitude' in ack ||
    'longitude' in ack ||
    'coords' in ack ||
    'location' in ack ||
    'entered' in ack ||
    'exited' in ack ||
    ack.status === 'FIRED' ||
    ack.status === 'ENTERED'
  ) {
    throw new Error(
      'SÄKERHETSAVVIKELSE MOT PRINCIP 5: ACK får ALDRIG innehålla platsdata eller triggerstatus!'
    );
  }
  return ack.status === 'REGISTERED_ON_DEVICE';
}
