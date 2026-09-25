import * as Haptics from 'expo-haptics';
import { Link, Stack, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, SectionList, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlarmCard } from '../src/components/AlarmCard';
import { PermissionBanner } from '../src/components/PermissionBanner';
import { Button, Icon } from '../src/components/ui';
import { useSnackbar } from '../src/components/UndoSnackbar';
import { buildSections, SectionKey } from '../src/logic/sections';
import { completeAlarm, removeAlarm, restoreAlarm } from '../src/services/alarms';
import { toggleChecklistItem } from '../src/services/db';
import { usePermissions } from '../src/services/permissions';
import { acceptFriendAlarm, declineFriendAlarm } from '../src/services/pushSync';
import { useAlarms } from '../src/state/useAlarms';
import { makeStyles, MIN_TOUCH, radii, spacing, typography, useTheme } from '../src/theme';
import { LocalAlarm } from '../src/types';

/** "Nu" som uppdateras varje halvminut, så att nedräkningar och sektioner hålls aktuella. */
function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export default function AlarmListScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const snackbar = useSnackbar();
  const alarms = useAlarms();
  const now = useNow();
  const { permissions, refresh: refreshPermissions } = usePermissions();
  const { focus } = useLocalSearchParams<{ focus?: string }>();
  const [showDone, setShowDone] = useState(false);
  // Larm som öppnats via en notis lyfts fram i några sekunder
  const [dismissedFocus, setDismissedFocus] = useState<string | null>(null);
  const highlighted = focus && focus !== dismissedFocus ? focus : null;

  useEffect(() => {
    if (!focus) return;
    const id = setTimeout(() => setDismissedFocus(focus), 4000);
    return () => clearTimeout(id);
  }, [focus]);

  const sections = useMemo(
    () =>
      buildSections(alarms, now).map((s) =>
        s.key === 'done' && !showDone ? { ...s, data: [] as LocalAlarm[], count: s.data.length } : { ...s, count: s.data.length }
      ),
    [alarms, now, showDone]
  );

  const runWithUndo = async (
    action: (id: string) => Promise<LocalAlarm | null>,
    alarm: LocalAlarm,
    message: string
  ) => {
    try {
      const snapshot = await action(alarm.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (snapshot) {
        snackbar.show(message, () => {
          restoreAlarm(snapshot).catch((err) =>
            Alert.alert('Kunde inte ångra', err instanceof Error ? err.message : String(err))
          );
        });
      }
    } catch (err) {
      Alert.alert('Något gick fel', err instanceof Error ? err.message : String(err));
    }
  };

  const handleAccept = async (alarm: LocalAlarm) => {
    try {
      await acceptFriendAlarm(alarm.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      snackbar.show('Platslarmet är aktiverat');
    } catch (err) {
      Alert.alert('Kunde inte aktivera', err instanceof Error ? err.message : String(err));
      refreshPermissions();
    }
  };

  const isEmpty = alarms.length === 0;

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Link href="/settings" asChild>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Inställningar"
                hitSlop={8}
                style={styles.headerButton}
              >
                <Icon name="settings-outline" size={24} color={colors.accentText} />
              </Pressable>
            </Link>
          ),
        }}
      />

      <SectionList
        contentInsetAdjustmentBehavior="automatic"
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 110 }]}
        ListHeaderComponent={
          <PermissionBanner permissions={permissions} alarms={alarms} onChanged={refreshPermissions} />
        }
        renderSectionHeader={({ section }) =>
          section.key === ('done' as SectionKey) ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showDone }}
              accessibilityLabel={`${section.title}, ${section.count} st`}
              onPress={() => setShowDone((v) => !v)}
              style={styles.sectionHeaderRow}
            >
              <Text style={styles.sectionHeader}>
                {section.title} ({section.count})
              </Text>
              <Icon name={showDone ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
            </Pressable>
          ) : (
            <Text accessibilityRole="header" style={[styles.sectionHeader, styles.sectionHeaderRow]}>
              {section.title}
            </Text>
          )
        }
        renderItem={({ item }) => (
          <AlarmCard
            alarm={item}
            now={now}
            highlighted={item.id === highlighted}
            onToggleChecklist={(alarmId, itemId) => {
              Haptics.selectionAsync().catch(() => {});
              toggleChecklistItem(alarmId, itemId);
            }}
            onComplete={(a) => runWithUndo(completeAlarm, a, 'Markerat som klart')}
            onDelete={(a) => runWithUndo(removeAlarm, a, 'Larmet raderades')}
            onAccept={handleAccept}
            onDecline={(a) => {
              declineFriendAlarm(a.id);
              snackbar.show('Förfrågan avböjdes');
            }}
          />
        )}
        ListEmptyComponent={
          isEmpty ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Icon name="alarm-outline" size={36} color={colors.accentText} />
              </View>
              <Text style={styles.emptyTitle}>Inga larm ännu</Text>
              <Text style={styles.emptyText}>
                Skapa en påminnelse som ringer vid en viss tid eller när du kommer till eller lämnar
                en plats.
              </Text>
              <Button title="Skapa larm" icon="add" onPress={() => router.push('/new')} />
            </View>
          ) : null
        }
      />

      {!isEmpty && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Nytt larm"
          onPress={() => router.push('/new')}
          style={({ pressed }) => [
            styles.fab,
            { bottom: insets.bottom + spacing.xl },
            pressed && { opacity: 0.85 },
          ]}
        >
          <Icon name="add" size={30} color={colors.onAccent} />
        </Pressable>
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, flexGrow: 1 },
  headerButton: { minWidth: MIN_TOUCH, minHeight: MIN_TOUCH, alignItems: 'center', justifyContent: 'center' },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: MIN_TOUCH,
    marginTop: spacing.sm,
  },
  sectionHeader: { ...typography.headline, color: colors.textSecondary },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, paddingHorizontal: spacing.xl },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { ...typography.title, color: colors.textPrimary },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    width: 64,
    height: 64,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
}));
