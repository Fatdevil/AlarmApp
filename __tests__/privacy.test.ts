import { validateAntiProbingAck } from '../src/services/antiProbing';
import { sanitizeDiagnosticLogs } from '../src/services/sanitizer';
import { DiagnosticLogEntry } from '../src/types';

describe('Princip 5: strikt ACK', () => {
  const valid = { alarmId: 'a1', status: 'REGISTERED_ON_DEVICE', deviceTimestamp: 't' };

  it('godkänner ett korrekt ACK', () => {
    expect(validateAntiProbingAck(valid)).toBe(true);
  });

  it.each([
    ['koordinater', { ...valid, latitude: 59.3, longitude: 18.0 }],
    ['triggerstatus', { ...valid, status: 'FIRED' }],
    ['okänt extrafält', { ...valid, lastSeen: 'x' }],
    ['null', null],
    ['array', []],
  ])('avvisar ACK med %s', (_, ack) => {
    expect(() => validateAntiProbingAck(ack)).toThrow(/PRINCIP 5/);
  });
});

describe('GDPR-maskning vid export', () => {
  const log: DiagnosticLogEntry = {
    id: 'l1',
    timestamp: 't',
    eventType: 'GEOFENCE_ENTER',
    targetId: 'g',
    batteryLevel: 0.85,
    isCharging: false,
    lowPowerMode: false,
    lifecycleState: 'BACKGROUND',
    locationSnapshot: { latitude: 59.3293, longitude: 18.0686, accuracy: 15 },
  };

  it('maskerar koordinater men behåller övrig diagnostik', () => {
    const [s] = sanitizeDiagnosticLogs([log], true);
    expect(s.locationSnapshot).toEqual({
      accuracy: 15,
      latitudeMasked: 'REDACTED_GDPR',
      longitudeMasked: 'REDACTED_GDPR',
    });
    expect(s.batteryLevel).toBe(0.85);
  });

  it('rå export lämnar datan orörd', () => {
    expect(sanitizeDiagnosticLogs([log], false)[0]).toEqual(log);
  });
});
