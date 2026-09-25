/**
 * GDPR Datasanering & Maskering (Fas 6 & GDPR)
 * 
 * Maskerar exakta latitud- och longitudkoordinater till 'REDACTED_GDPR' vid export,
 * samtidigt som icke-känslig diagnostikdata (batterinivå, radiestorlek/noggrannhet, latens) bevaras.
 */

export function sanitizeDiagnosticLogs(logs: any[], anonymizeLocation = true): any[] {
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
