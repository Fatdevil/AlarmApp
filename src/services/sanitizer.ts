/**
 * GDPR Datasanering & Maskering
 *
 * Maskerar exakta latitud- och longitudkoordinater vid export, samtidigt som
 * icke-känslig diagnostikdata (batterinivå, radie/noggrannhet, latens) bevaras.
 */
import { DiagnosticLogEntry } from '../types';

export type SanitizedLogEntry = Omit<DiagnosticLogEntry, 'locationSnapshot'> & {
  locationSnapshot?:
    | DiagnosticLogEntry['locationSnapshot']
    | { accuracy: number; latitudeMasked: 'REDACTED_GDPR'; longitudeMasked: 'REDACTED_GDPR' };
};

export function sanitizeDiagnosticLogs(
  logs: DiagnosticLogEntry[],
  anonymizeLocation = true
): SanitizedLogEntry[] {
  return logs.map((log) => {
    if (anonymizeLocation && log.locationSnapshot) {
      return {
        ...log,
        locationSnapshot: {
          accuracy: log.locationSnapshot.accuracy,
          latitudeMasked: 'REDACTED_GDPR',
          longitudeMasked: 'REDACTED_GDPR',
        },
      };
    }
    return log;
  });
}
