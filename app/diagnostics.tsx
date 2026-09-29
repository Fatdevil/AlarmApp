/**
 * Diagnostik för fälttest (R0). Nås via Inställningar → tryck 7 gånger på versionen.
 * Visas aldrig för vanliga användare.
 */
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, Share, Text, View } from 'react-native';
import { Button, Card, SectionLabel } from '../src/components/ui';
import { DEFAULT_GEOFENCE_RADIUS_METERS } from '../src/constants';
import { newId } from '../src/logic/ids';
import { createAlarm, reconcileScheduledAlarms } from '../src/services/alarms';
import { BatterySnapshot, getBatterySnapshot } from '../src/services/battery';
import {
  exportLogsAsJson,
  getDiagnosticLogs,
  purgeAllDiagnosticData,
  setSetting,
} from '../src/services/db';
import { getPermissionSnapshot, PermissionSnapshot } from '../src/services/permissions';
import { handleIncomingPushPayload, setAckTransport } from '../src/services/pushSync';
import { makeStyles, radii, spacing, typography } from '../src/theme';
import { DiagnosticLogEntry } from '../src/types';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default function DiagnosticsScreen() {
  const styles = useStyles();
  const router = useRouter();
  const [battery, setBattery] = useState<BatterySnapshot | null>(null);
  const [perms, setPerms] = useState<PermissionSnapshot | null>(null);
  const [logs, setLogs] = useState<DiagnosticLogEntry[]>([]);
  const [latestAck, setLatestAck] = useState<string | null>(null);

  const refresh = useCallback(() => {
    Promise.all([getBatterySnapshot(), getPermissionSnapshot()])
      .then(([b, p]) => {
        setBattery(b);
        setPerms(p);
        setLogs(getDiagnosticLogs(50));
      })
      .catch((err) => console.warn('[Diagnostics] refresh:', err));
  }, []);

  useEffect(() => {
    const initial = setTimeout(refresh, 0);
    setAckTransport((ack) => {
      setLatestAck(`${ack.alarmId.slice(0, 18)}… → ${ack.status} (${ack.deviceTimestamp})`);
    });
    const id = setInterval(refresh, 10_000);
    return () => {
      clearTimeout(initial);
      clearInterval(id);
      setAckTransport(null);
    };
  }, [refresh]);

  const run = async (label: string, fn: () => Promise<string | void>) => {
    try {
      const msg = await fn();
      Alert.alert(label, msg || 'Klart');
    } catch (err) {
      Alert.alert(`${label} misslyckades`, errorMessage(err));
    } finally {
      refresh();
    }
  };

  const createTestAlarm = (minutes: number) =>
    run('Testlarm', async () => {
      const at = new Date(Date.now() + minutes * 60_000);
      await createAlarm({
        id: newId('alarm'),
        creatorId: 'ME',
        recipientId: 'ME',
        content: `Testlarm +${minutes} min`,
        triggerType: 'TIME',
        dateTime: at.toISOString(),
        status: 'SCHEDULED',
        createdAt: new Date().toISOString(),
      });
      return `Ringer ${at.toLocaleTimeString('sv-SE')}`;
    });

  const createGeofenceHere = () =>
    run('Geofence', async () => {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      await createAlarm({
        id: newId('alarm'),
        creatorId: 'ME',
        recipientId: 'ME',
        content: 'Testzon: du har lämnat positionen',
        triggerType: 'EXIT_LOCATION',
        location: {
          id: newId('loc'),
          name: 'Testposition',
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          radius: DEFAULT_GEOFENCE_RADIUS_METERS,
        },
        status: 'ACTIVE_GEOFENCE',
        createdAt: new Date().toISOString(),
      });
      return 'EXIT-zon registrerad på nuvarande position.';
    });

  const simulateFriendPush = () =>
    run('Vänlarm', async () => {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const created = await handleIncomingPushPayload({
        type: 'SYNC_GEOFENCE',
        alarm: {
          id: newId('remote'),
          creatorId: 'FRIEND_TEST',
          content: 'Köp kaffe när du kommer fram',
          triggerType: 'ENTER_LOCATION',
          location: {
            id: newId('friend_loc'),
            name: 'Vännens plats',
            latitude: pos.coords.latitude + 0.01,
            longitude: pos.coords.longitude,
            radius: 200,
          },
        },
      });
      return created ? 'Förfrågan skapad – godkänn den på startsidan.' : 'Payload avvisades.';
    });

  const exportLogs = (anonymize: boolean) =>
    Share.share({ title: `AlarmApp-loggar-${Date.now()}`, message: exportLogsAsJson(anonymize) }).catch(
      (err) => Alert.alert('Export misslyckades', errorMessage(err))
    );

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.body}>
      <View style={styles.section}>
        <SectionLabel>Enhet</SectionLabel>
        <Card style={{ gap: spacing.xs }}>
          <Text style={styles.mono}>
            Batteri: {battery ? `${Math.round(battery.batteryLevel * 100)} %` : '–'}
            {battery?.isCharging ? ' (laddar)' : ''}
            {battery?.lowPowerMode ? ' · Energisparläge' : ''}
          </Text>
          <Text style={styles.mono}>Notiser: {perms?.notifications ?? '–'}</Text>
          <Text style={styles.mono}>Plats (förgrund): {perms?.locationForeground ?? '–'}</Text>
          <Text style={styles.mono}>Plats (alltid): {perms?.locationBackground ?? '–'}</Text>
          {latestAck && <Text style={styles.mono}>Senaste ACK: {latestAck}</Text>}
        </Card>
      </View>

      <View style={styles.section}>
        <SectionLabel>Tester</SectionLabel>
        <View style={styles.grid}>
          <Button compact variant="secondary" title="Larm +1 min" onPress={() => createTestAlarm(1)} />
          <Button compact variant="secondary" title="Larm +2 min" onPress={() => createTestAlarm(2)} />
          <Button compact variant="secondary" title="Larm +5 min" onPress={() => createTestAlarm(5)} />
        </View>
        <Button compact variant="secondary" title="Zon (EXIT) på min position" onPress={createGeofenceHere} />
        <Button compact variant="secondary" title="Simulera vänlarm via push" onPress={simulateFriendPush} />
        <Button
          compact
          variant="secondary"
          title="Kör omstartsavstämning"
          onPress={() =>
            run('Avstämning', async () => {
              const r = await reconcileScheduledAlarms();
              return `Omschemalagda: ${r.rescheduled}, har ringt: ${r.fired}, missade: ${r.missed}`;
            })
          }
        />
      </View>

      <View style={styles.section}>
        <SectionLabel>Logg</SectionLabel>
        <View style={styles.grid}>
          <Button compact variant="secondary" title="Exportera (anonym)" onPress={() => exportLogs(true)} />
          <Button compact variant="secondary" title="Exportera (rå)" onPress={() => exportLogs(false)} />
          <Button
            compact
            variant="destructive"
            title="Rensa logg"
            onPress={() => {
              purgeAllDiagnosticData();
              refresh();
            }}
          />
        </View>
        {logs.length === 0 ? (
          <Text style={styles.muted}>Inga händelser loggade ännu.</Text>
        ) : (
          logs.map((log) => (
            <View key={log.id} style={styles.logItem}>
              <Text style={styles.logType}>
                {new Date(log.timestamp).toLocaleTimeString('sv-SE')} · {log.eventType}
              </Text>
              <Text style={styles.mono} numberOfLines={3}>
                {log.targetId} · {log.lifecycleState} · batteri {Math.round(log.batteryLevel * 100)} %
                {log.note ? `\n${log.note}` : ''}
              </Text>
            </View>
          ))
        )}
      </View>

      {!__DEV__ && (
        <Button
          variant="ghost"
          title="Stäng av utvecklarläge"
          onPress={() => {
            setSetting('dev_mode_enabled', '0');
            router.back();
          }}
        />
      )}
    </ScrollView>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  body: { padding: spacing.lg, gap: spacing.xl },
  section: { gap: spacing.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  mono: { ...typography.footnote, color: colors.textSecondary, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }) },
  muted: { ...typography.footnote, color: colors.textMuted },
  logItem: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: 2,
  },
  logType: { ...typography.footnote, fontWeight: '700', color: colors.textPrimary },
}));
