import { sanitizeDiagnosticLogs } from '../src/services/sanitizer';
import { DiagnosticLogEntry } from '../src/types';

/**
 * docs/PRIVACY.md: appen har ingen server och skickar ingenting från telefonen.
 * Testet fångar nätverksanrop och push-token som smyger sig in. När en backend byggs
 * ändras testet medvetet – tillsammans med PRIVACY.md – så att bara de uttryckliga
 * besluten Godkänt/Avvisat/Klar kan lämna telefonen.
 */
// Testet körs i Node; appens tsconfig saknar Node-typer, så bara det som används typas här.
interface DirEntry {
  name: string;
  isDirectory(): boolean;
}
/* eslint-disable @typescript-eslint/no-require-imports */
const fs: {
  readdirSync(dir: string, opts: { withFileTypes: true }): DirEntry[];
  readFileSync(file: string, encoding: 'utf8'): string;
} = require('fs');
const path: {
  join(...parts: string[]): string;
  relative(from: string, to: string): string;
  resolve(...parts: string[]): string;
} = require('path');
/* eslint-enable @typescript-eslint/no-require-imports */

describe('Inget lämnar telefonen', () => {
  const root = path.resolve('.');
  const FORBIDDEN: [string, RegExp][] = [
    ['fetch', /\bfetch\s*\(/],
    ['XMLHttpRequest', /\bXMLHttpRequest\b/],
    ['WebSocket', /\bWebSocket\b/],
    ['EventSource', /\bEventSource\b/],
    ['sendBeacon', /\bsendBeacon\b/],
    ['push-token', /\bget(Expo|Device)PushTokenAsync\b/],
    ['push-task', /\bregisterTaskAsync\b/],
    ['URLSession', /\bURLSession\b/],
    ['HttpURLConnection', /\b(Http)?URLConnection\b/],
    ['OkHttp', /\bokhttp3?\b/i],
  ];

  function sourceFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return /^(node_modules|build|test)$/.test(entry.name) ? [] : sourceFiles(full);
      return /\.(ts|tsx|kt|swift)$/.test(entry.name) ? [full] : [];
    });
  }

  const files = ['src', 'app', 'modules'].flatMap((d) => sourceFiles(path.join(root, d)));

  it('hittar källfilerna', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it.each(FORBIDDEN)('ingen källfil använder %s', (_, pattern) => {
    const offenders = files.filter((f) => pattern.test(fs.readFileSync(f, 'utf8')));
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
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
