import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import { PermissionBanner } from '../../src/components/PermissionBanner';
import { Button, Icon } from '../../src/components/ui';
import { useSnackbar } from '../../src/components/UndoSnackbar';
import { formatCountdown, formatDayLabel } from '../../src/logic/time';
import {
  describeDays,
  formatHM,
  isSkipping,
  nextWakeOccurrence,
  seriesIsImminent,
  upcomingOccurrence,
  WakeAlarm,
} from '../../src/logic/wake';
import {
  imAwake,
  removeWakeAlarms,
  restoreWakeAlarms,
  setWakeEnabled,
  skipNextWake,
  unskipWake,
} from '../../src/services/wake';
import { usePermissions } from '../../src/services/permissions';
import { useWakeAlarms } from '../../src/state/useAlarms';
import { makeStyles, MIN_TOUCH, radii, spacing, typography, useTheme } from '../../src/theme';

function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

type Group = { key: string; seriesId: string | null; alarms: WakeAlarm[] };

/** Serier hålls ihop, sorterade på första larmets klockslag. */
function groupAlarms(alarms: WakeAlarm[]): Group[] {
  const groups = new Map<string, Group>();
  for (const a of alarms) {
    const key = a.seriesId ?? a.id;
    const g = groups.get(key) ?? { key, seriesId: a.seriesId, alarms: [] };
    g.alarms.push(a);
    groups.set(key, g);
  }
  const minutes = (a: WakeAlarm) => a.hour * 60 + a.minute;
  return [...groups.values()]
    .map((g) => ({ ...g, alarms: g.alarms.sort((x, y) => x.seriesIndex - y.seriesIndex) }))
    .sort((a, b) => minutes(a.alarms[0]) - minutes(b.alarms[0]));
}

export default function WakeScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const snackbar = useSnackbar();
  const alarms = useWakeAlarms();
  const { permissions, refresh: refreshPermissions } = usePermissions();
  const now = useNow();

  const groups = useMemo(() => groupAlarms(alarms), [alarms]);

  const next = useMemo(() => {
    let best: { alarm: WakeAlarm; at: Date } | null = null;
    for (const a of alarms) {
      const at = nextWakeOccurrence(a, now);
      if (at && (!best || at < best.at)) best = { alarm: a, at };
    }
    return best;
  }, [alarms, now]);

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (err) {
      Alert.alert('Något gick fel', errorText(err));
    }
  };

  const toggle = (alarm: WakeAlarm, enabled: boolean) => {
    Haptics.selectionAsync().catch(() => {});
    run(() => setWakeEnabled(alarm.id, enabled));
  };

  const remove = (ids: string[], message: string) =>
    run(async () => {
      const removed = await removeWakeAlarms(ids);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      snackbar.show(message, () => {
        restoreWakeAlarms(removed).catch((err) => Alert.alert('Kunde inte ångra', errorText(err)));
      });
    });

  const openMenu = (alarm: WakeAlarm) => {
    const skipping = isSkipping(alarm, now);
    const buttons: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];
    if (alarm.enabled && alarm.weekdays.length > 0) {
      if (skipping) {
        buttons.push({ text: 'Ångra överhoppning', onPress: () => run(() => unskipWake(alarm.id)) });
      } else {
        const day = formatDayLabel(upcomingOccurrence(alarm, now), now).toLowerCase();
        buttons.push({
          text: `Hoppa över ${day}`,
          onPress: () =>
            run(async () => {
              await skipNextWake(alarm.id);
              snackbar.show(`Ringer inte ${day}`, () => {
                unskipWake(alarm.id).catch(() => {});
              });
            }),
        });
      }
    }
    buttons.push({ text: 'Ändra', onPress: () => router.push({ pathname: '/wake-edit', params: { id: alarm.id } }) });
    buttons.push({
      text: 'Radera',
      style: 'destructive',
      onPress: () => remove([alarm.id], `Väckning ${formatHM(alarm.hour, alarm.minute)} raderades`),
    });
    buttons.push({ text: 'Avbryt', style: 'cancel' });
    Alert.alert(formatHM(alarm.hour, alarm.minute), describeDays(alarm.weekdays), buttons);
  };

  const renderRow = (alarm: WakeAlarm, inSeries: boolean) => {
    const occurrence = nextWakeOccurrence(alarm, now);
    const active = occurrence !== null;
    const skipping = alarm.enabled && isSkipping(alarm, now);
    const time = formatHM(alarm.hour, alarm.minute);
    const subtitle = [alarm.label || null, describeDays(alarm.weekdays)].filter(Boolean).join(' · ');

    return (
      <ReanimatedSwipeable
        key={alarm.id}
        friction={2}
        rightThreshold={80}
        renderRightActions={() => (
          <View style={styles.swipeDelete}>
            <Icon name="trash" size={22} color={colors.onAccent} />
          </View>
        )}
        onSwipeableOpen={() => remove([alarm.id], `Väckning ${time} raderades`)}
      >
        <Pressable
          onPress={() => router.push({ pathname: '/wake-edit', params: { id: alarm.id } })}
          onLongPress={() => openMenu(alarm)}
          accessibilityRole="button"
          accessibilityLabel={`${time}, ${subtitle}${active ? '' : ', av'}`}
          accessibilityHint="Tryck för att ändra, håll inne för fler val"
          accessibilityActions={[
            { name: 'menu', label: 'Fler val' },
            { name: 'delete', label: 'Radera' },
          ]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'menu') openMenu(alarm);
            if (e.nativeEvent.actionName === 'delete') remove([alarm.id], `Väckning ${time} raderades`);
          }}
          style={({ pressed }) => [styles.row, inSeries && styles.rowInSeries, pressed && { opacity: 0.8 }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.time, !active && styles.dim]}>{time}</Text>
            <Text style={[styles.subtitle, !active && styles.dim]} numberOfLines={1}>
              {subtitle}
            </Text>
            {skipping && (
              <Text style={styles.skip}>
                Hoppar över {formatDayLabel(upcomingOccurrence(alarm, now), now).toLowerCase()} · nästa{' '}
                {occurrence ? formatDayLabel(occurrence, now).toLowerCase() : ''}
              </Text>
            )}
          </View>
          <Switch
            value={alarm.enabled && active}
            onValueChange={(v) => toggle(alarm, v)}
            trackColor={{ true: colors.accent, false: colors.surfaceHighlight }}
            thumbColor="#FFFFFF"
            accessibilityLabel={`Väckning ${time}`}
          />
        </Pressable>
      </ReanimatedSwipeable>
    );
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.body}
      contentInsetAdjustmentBehavior="automatic"
    >
      <PermissionBanner permissions={permissions} wakeAlarms={alarms} onChanged={refreshPermissions} />
      <View style={styles.hero} accessible accessibilityLiveRegion="polite">
        {next ? (
          <>
            <Text style={styles.heroLabel}>Nästa väckning</Text>
            <Text style={styles.heroTime}>{formatHM(next.at.getHours(), next.at.getMinutes())}</Text>
            <Text style={styles.heroSub}>
              {formatDayLabel(next.at, now)} · {formatCountdown(next.at, now)}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.heroLabel}>Ingen väckning på</Text>
            <Text style={styles.heroSub}>Skapa ett larm eller slå på ett befintligt.</Text>
          </>
        )}
      </View>

      {groups.map((group) =>
        group.seriesId ? (
          <View key={group.key} style={styles.series}>
            <View style={styles.seriesHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.seriesTitle}>Väckningsserie</Text>
                <Text style={styles.subtitle}>
                  {group.alarms.length} larm · {formatHM(group.alarms[0].hour, group.alarms[0].minute)}–
                  {formatHM(group.alarms[group.alarms.length - 1].hour, group.alarms[group.alarms.length - 1].minute)}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Radera hela serien"
                onPress={() =>
                  Alert.alert('Radera hela serien?', `${group.alarms.length} larm tas bort.`, [
                    { text: 'Avbryt', style: 'cancel' },
                    {
                      text: 'Radera',
                      style: 'destructive',
                      onPress: () => remove(group.alarms.map((a) => a.id), 'Väckningsserien raderades'),
                    },
                  ])
                }
                style={styles.iconButton}
              >
                <Icon name="trash-outline" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            {seriesIsImminent(group.alarms, now) && (
              <Button
                compact
                icon="sunny"
                title="Jag är vaken – stäng av resten"
                onPress={() =>
                  run(async () => {
                    const n = await imAwake(group.seriesId!);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                    snackbar.show(n === 1 ? '1 larm hoppas över' : `${n} larm hoppas över`);
                  })
                }
                style={{ marginHorizontal: spacing.md, marginBottom: spacing.sm }}
              />
            )}
            {group.alarms.map((a) => renderRow(a, true))}
          </View>
        ) : (
          <View key={group.key} style={styles.single}>
            {renderRow(group.alarms[0], false)}
          </View>
        )
      )}

      {alarms.length === 0 && (
        <Text style={styles.emptyText}>
          Tips: skapa en väckningsserie – flera larm i rad som alla stängs av när du trycker
          &quot;Jag är vaken&quot;.
        </Text>
      )}

      <Button
        icon="add"
        title="Ny väckning"
        onPress={() => router.push('/wake-edit')}
        style={{ marginTop: spacing.sm }}
      />
    </ScrollView>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxl },
  hero: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 2,
  },
  heroLabel: { ...typography.footnote, color: colors.textSecondary },
  heroTime: { fontSize: 56, fontWeight: '800', color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  heroSub: { ...typography.callout, color: colors.textSecondary },
  single: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  series: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    paddingTop: spacing.md,
  },
  seriesHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  seriesTitle: { ...typography.headline, color: colors.textPrimary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    minHeight: 76,
    backgroundColor: colors.surface,
  },
  rowInSeries: { borderTopWidth: 1, borderTopColor: colors.border },
  time: { fontSize: 40, fontWeight: '300', color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  subtitle: { ...typography.footnote, color: colors.textSecondary },
  skip: { ...typography.footnote, color: colors.warning, marginTop: 2 },
  dim: { color: colors.textMuted },
  iconButton: { minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  swipeDelete: {
    backgroundColor: '#BE123C',
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.xl,
    flex: 1,
  },
  emptyText: { ...typography.footnote, color: colors.textMuted, textAlign: 'center', paddingHorizontal: spacing.lg },
}));
