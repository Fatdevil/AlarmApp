import React from 'react';
import { Platform, Text, View } from 'react-native';
import { openFullScreenAlarmSettings } from '../../modules/native-alarm';
import { LocalAlarm } from '../types';
import {
  openSystemSettings,
  PermissionSnapshot,
  requestLocationPermissions,
  requestNotificationPermission,
} from '../services/permissions';
import { makeStyles, radii, spacing, typography, useTheme } from '../theme';
import { Button, Icon } from './ui';

interface Props {
  permissions: PermissionSnapshot | null;
  alarms: LocalAlarm[];
  onChanged: () => void;
}

/**
 * Visas överst på startsidan när en behörighet som aktiva larm är beroende av saknas.
 * Utan detta kan larm tyst låta bli att ringa.
 */
export function PermissionBanner({ permissions, alarms, onChanged }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  if (!permissions) return null;

  const hasTime = alarms.some((a) => a.status === 'SCHEDULED');
  const hasPlaces = alarms.some((a) => a.status === 'ACTIVE_GEOFENCE');
  const alarmKitCoversTime = Platform.OS === 'ios' && permissions.systemAlarms === 'granted';
  const needsNotifications = hasPlaces || (hasTime && !alarmKitCoversTime);

  let message: string | null = null;
  let action: (() => Promise<unknown>) | null = null;
  let denied = false;

  if (permissions.notifications !== 'granted' && needsNotifications) {
    message = 'Notiser är avstängda – dina larm kommer inte att ringa.';
    denied = permissions.notifications === 'denied';
    action = requestNotificationPermission;
  } else if (permissions.locationBackground !== 'granted' && hasPlaces) {
    message = 'Platslarm kräver platsåtkomst "Tillåt alltid".';
    denied = permissions.locationBackground === 'denied';
    action = requestLocationPermissions;
  } else if (Platform.OS === 'android' && !permissions.fullScreenAlarms && hasTime) {
    message = 'Helskärmslarm är avstängda – larm visas bara som notis på låsskärmen.';
    action = async () => openFullScreenAlarmSettings();
  }

  if (!message) return null;

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Icon name="warning" size={22} color={colors.warning} />
      <View style={{ flex: 1, gap: spacing.sm }}>
        <Text style={styles.text}>{message}</Text>
        <Button
          compact
          variant="secondary"
          title={denied ? 'Öppna Inställningar' : 'Slå på'}
          style={{ alignSelf: 'flex-start' }}
          onPress={async () => {
            if (denied || !action) openSystemSettings();
            else await action();
            onChanged();
          }}
        />
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  banner: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.card,
    backgroundColor: colors.warningBg,
    borderWidth: 1,
    borderColor: colors.warning,
    marginBottom: spacing.lg,
  },
  text: { ...typography.callout, color: colors.textPrimary },
}));
