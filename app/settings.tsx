import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { Button, Card, Icon, IconName, SectionLabel } from '../src/components/ui';
import { useSnackbar } from '../src/components/UndoSnackbar';
import { getSetting, purgeAllLocalData, setSetting } from '../src/services/db';
import { clearAllGeofences } from '../src/services/geofence';
import { cancelAllScheduledNotifications } from '../src/services/notifications';
import {
  openSystemSettings,
  PermissionState,
  requestLocationPermissions,
  requestNotificationPermission,
  usePermissions,
} from '../src/services/permissions';
import { makeStyles, MIN_TOUCH, spacing, typography, useTheme } from '../src/theme';

const DEV_MODE_KEY = 'dev_mode_enabled';
const TAPS_TO_UNLOCK = 7;

function PermissionRow({
  label,
  description,
  state,
  onRequest,
}: {
  label: string;
  description: string;
  state: PermissionState | undefined;
  onRequest: () => void;
}) {
  const styles = useStyles();
  const { colors } = useTheme();
  const granted = state === 'granted';
  const icon: IconName = granted ? 'checkmark-circle' : 'alert-circle';
  return (
    <View style={styles.permRow}>
      <Icon name={icon} size={24} color={granted ? colors.success : colors.warning} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{label}</Text>
        <Text style={styles.rowText}>{granted ? 'Påslaget' : description}</Text>
      </View>
      {!granted && state && (
        <Button
          compact
          variant="secondary"
          title={state === 'denied' ? 'Inställningar' : 'Slå på'}
          onPress={state === 'denied' ? openSystemSettings : onRequest}
        />
      )}
    </View>
  );
}

export default function SettingsScreen() {
  const styles = useStyles();
  const router = useRouter();
  const snackbar = useSnackbar();
  const { permissions, refresh } = usePermissions();
  const [devMode, setDevMode] = useState(() => __DEV__ || getSetting(DEV_MODE_KEY) === '1');
  const [taps, setTaps] = useState(0);

  const version = Constants.expoConfig?.version ?? '–';

  const handleVersionTap = () => {
    if (devMode) return;
    const next = taps + 1;
    setTaps(next);
    if (next >= TAPS_TO_UNLOCK) {
      setSetting(DEV_MODE_KEY, '1');
      setDevMode(true);
      snackbar.show('Utvecklarläge aktiverat');
    }
  };

  const handlePurge = () => {
    Alert.alert(
      'Radera all data?',
      'Alla larm, platser och all historik raderas permanent från telefonen. Aktiva larm slutar ringa.',
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Radera allt',
          style: 'destructive',
          onPress: async () => {
            try {
              await clearAllGeofences();
              await cancelAllScheduledNotifications();
              purgeAllLocalData();
              snackbar.show('All data är raderad');
            } catch (err) {
              Alert.alert('Kunde inte radera', err instanceof Error ? err.message : String(err));
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.body}>
      <View style={styles.section}>
        <SectionLabel>Behörigheter</SectionLabel>
        <Card style={{ gap: spacing.md }}>
          <PermissionRow
            label="Notiser"
            description="Krävs för att larm ska ringa."
            state={permissions?.notifications}
            onRequest={() => requestNotificationPermission().finally(refresh)}
          />
          <PermissionRow
            label="Plats – Tillåt alltid"
            description="Krävs för platslarm."
            state={permissions?.locationBackground}
            onRequest={() => requestLocationPermissions().finally(refresh)}
          />
        </Card>
      </View>

      <View style={styles.section}>
        <SectionLabel>Integritet</SectionLabel>
        <Card style={{ gap: spacing.md }}>
          <Text style={styles.rowTitle}>Din position stannar i telefonen</Text>
          <Text style={styles.rowText}>
            Platslarm bevakas av telefonens operativsystem (iOS Core Location / Android
            Geofencing). Appen skickar aldrig din position eller när du passerar en plats till
            någon server.
          </Text>
          <Text style={styles.rowText}>
            Om en vän skickar ett platslarm till dig måste du själv godkänna det. Vännen får bara
            veta att larmet är aktiverat – aldrig var du är eller om du har passerat platsen.
          </Text>
          <Text style={styles.rowText}>
            Larm och historik sparas i appens lokala databas på telefonen och skyddas av
            telefonens egen kryptering och skärmlås.
          </Text>
        </Card>
      </View>

      <View style={styles.section}>
        <SectionLabel>Data</SectionLabel>
        <Button variant="destructive" icon="trash-outline" title="Radera all data" onPress={handlePurge} />
      </View>

      <View style={styles.section}>
        <SectionLabel>Om appen</SectionLabel>
        <Card style={{ gap: spacing.sm }}>
          <Pressable
            onPress={handleVersionTap}
            accessibilityRole="text"
            accessibilityLabel={`Version ${version}`}
            style={styles.versionRow}
          >
            <Text style={styles.rowTitle}>Version</Text>
            <Text style={styles.rowText}>{version}</Text>
          </Pressable>
          {devMode && (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push('/diagnostics')}
              style={styles.versionRow}
            >
              <Text style={styles.rowTitle}>Diagnostik</Text>
              <Icon name="chevron-forward" size={18} />
            </Pressable>
          )}
        </Card>
      </View>
    </ScrollView>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  body: { padding: spacing.lg, gap: spacing.xl },
  section: { gap: spacing.xs },
  permRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowTitle: { ...typography.headline, color: colors.textPrimary },
  rowText: { ...typography.footnote, color: colors.textSecondary },
  versionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: MIN_TOUCH,
  },
}));
