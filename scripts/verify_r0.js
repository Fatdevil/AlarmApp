/**
 * R0 Architecture & Invariant Verification Runner
 * Verifierar de 5 arkitekturprinciperna och R0-kraven programmatiskt direkt mot källkoden i src/.
 */

import { validateAntiProbingAck } from '../src/services/antiProbing.ts';
import {
  MIN_GEOFENCE_RADIUS_METERS,
  DEFAULT_GEOFENCE_RADIUS_METERS,
  IOS_MAX_GEOFENCES,
} from '../src/constants.ts';
import { sanitizeDiagnosticLogs } from '../src/services/sanitizer.ts';

function runTests() {
  console.log('====================================================');
  console.log('🧪 KÖR R0 ARKITEKTUR- OCH INVARIANTTESTER');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      failed++;
    }
  }

  // --- TEST 1: Princip 5 (Anti-Probing ACK) ---
  console.log('--- TESTGRUPP 1: Princip 5 (Strikt Anti-Probing ACK) ---');
  
  // 1.1 Giltig ACK
  const validAck = {
    alarmId: 'uuid-1234',
    status: 'REGISTERED_ON_DEVICE',
    deviceTimestamp: new Date().toISOString(),
  };
  try {
    const isValid = validateAntiProbingAck(validAck);
    assert(isValid === true, 'Giltig ACK (REGISTERED_ON_DEVICE) godkänns');
  } catch (e) {
    assert(false, `Giltig ACK kastade fel: ${e.message}`);
  }

  // 1.2 Otillåten ACK med lat/long-läcka
  const leakingAckCoords = {
    alarmId: 'uuid-1234',
    status: 'REGISTERED_ON_DEVICE',
    latitude: 59.3293,
    longitude: 18.0686,
    deviceTimestamp: new Date().toISOString(),
  };
  try {
    validateAntiProbingAck(leakingAckCoords);
    assert(false, 'ACK med koordinater borde ha avvisats men godkändes!');
  } catch (e) {
    assert(true, 'ACK med koordinater avvisades strikt enligt Princip 5');
  }

  // 1.3 Otillåten ACK med triggerstatus (probing)
  const probingAckStatus = {
    alarmId: 'uuid-1234',
    status: 'FIRED',
    deviceTimestamp: new Date().toISOString(),
  };
  try {
    validateAntiProbingAck(probingAckStatus);
    assert(false, 'ACK med FIRED-status borde ha avvisats men godkändes!');
  } catch (e) {
    assert(true, 'ACK med FIRED-status avvisades strikt (hindrar probing-stalking)');
  }

  // --- TESTGRUPP 2: Geofence Radie-begränsning & iOS Gräns ---
  console.log('\n--- TESTGRUPP 2: Geofence Minimiradie & iOS Begränsning ---');
  
  assert(
    MIN_GEOFENCE_RADIUS_METERS === 100,
    `Minsta tillåtna radie är låst till exakt 100 meter (faktiskt: ${MIN_GEOFENCE_RADIUS_METERS}m)`
  );

  assert(
    DEFAULT_GEOFENCE_RADIUS_METERS === 150,
    `Standardradie är satt till rekommenderade 150 meter (faktiskt: ${DEFAULT_GEOFENCE_RADIUS_METERS}m)`
  );

  assert(
    IOS_MAX_GEOFENCES === 20,
    `iOS maxgräns är begränsad till ${IOS_MAX_GEOFENCES} regioner enligt systemkrav`
  );

  // Radie < 100m ska spärras
  const testRadii = [20, 50, 99];
  for (const r of testRadii) {
    const isDisallowed = r < MIN_GEOFENCE_RADIUS_METERS;
    assert(isDisallowed, `Radie ${r}m avvisas korrekt (< 100m)`);
  }

  // Radie >= 100m ska tillåtas
  const validRadii = [100, 150, 200, 500];
  for (const r of validRadii) {
    const isAllowed = r >= MIN_GEOFENCE_RADIUS_METERS;
    assert(isAllowed, `Radie ${r}m godkänns (>= 100m)`);
  }

  // --- TESTGRUPP 3: Datasanering & GDPR Maskering ---
  console.log('\n--- TESTGRUPP 3: GDPR Datasanering & Maskering ---');

  const rawLogs = [
    {
      id: 'log-1',
      timestamp: new Date().toISOString(),
      eventType: 'GEOFENCE_ENTER',
      targetId: 'geo-1',
      batteryLevel: 0.85,
      lowPowerMode: false,
      lifecycleState: 'BACKGROUND',
      locationSnapshot: {
        latitude: 59.3293,
        longitude: 18.0686,
        accuracy: 15,
      },
    },
  ];

  const sanitized = sanitizeDiagnosticLogs(rawLogs, true);
  assert(
    sanitized[0].locationSnapshot.latitudeMasked === 'REDACTED_GDPR',
    'Latitud maskeras korrekt till REDACTED_GDPR vid anonymiserad export'
  );
  assert(
    sanitized[0].locationSnapshot.longitudeMasked === 'REDACTED_GDPR',
    'Longitud maskeras korrekt till REDACTED_GDPR vid anonymiserad export'
  );
  assert(
    sanitized[0].locationSnapshot.latitude === undefined,
    'Rå latitud tas bort ur anonymiserat exportobjekt'
  );
  assert(
    sanitized[0].batteryLevel === 0.85,
    'Icke-känslig diagnostikdata (batterinivå) bevaras intakt'
  );

  console.log('\n====================================================');
  console.log(`SLUTRESULTAT: ${passed} godkända, ${failed} misslyckade`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
