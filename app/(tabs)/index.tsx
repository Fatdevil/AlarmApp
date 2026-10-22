import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, SectionList, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlarmCard } from '../../src/components/AlarmCard';
import { AlarmRow } from '../../src/components/AlarmRow';
import { NextCard } from '../../src/components/NextCard';
import { PermissionBanner } from '../../src/components/PermissionBanner';
import { ScreenHeader } from '../../src/components/ScreenHeader';
import { SettingsButton } from '../../src/components/SettingsButton';
import { Button, Icon } from '../../src/components/ui';
import { useSnackbar } from '../../src/components/UndoSnackbar';
import { pickNext } from '../../src/logic/alarmDisplay';
import { AlarmSection, buildSections, countActive, SectionKey } from '../../src/logic/sections';
import { LOCALE } from '../../src/logic/time';
import { completeAlarm, removeAlarm, restoreAlarm } from '../../src/services/alarms';
import { toggleChecklistItem } from '../../src/services/db';
import { usePermissions } from '../../src/services/permissions';
import { acceptFriendAlarm, declineFriendAlarm } from '../../src/services/pushSync';
import { useAlarms } from '../../src/state/useAlarms';
import { useNow } from '../../src/state/useNow';
import { makeStyles, MIN_TOUCH, radii, spacing, typography, useTheme } from '../../src/theme';
import { LocalAlarm } from '../../src/types';

const dateFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });

/** Sektioner som kräver handling visas som kort, övriga som rader. */
const CARD_SECTIONS: SectionKey[] = ['requests', 'attention'];

type Section = AlarmSection & { count: number };

export default function RemindersScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const snackbar = useSnackbar();
  const alarms = useAlarms();
  const now = useNow();
  const { permissions, refresh: refreshPermissions } = usePermissions();
  const { focus, at } = useLocalSearchParams<{ focus?: string; at?: string }>();
  const [showDone, setShowDone] = useState(false);
  const listRef = useRef<SectionList<LocalAlarm, Section>>(null);
  // Larm som öppnats via en notis eller agendan lyfts fram i några sekunder. [at] skiljer
  // två tryck på samma larm åt, så att det lyfts fram igen.
  const focusToken = focus ? `${focus}@${at ?? ''}` : null;
  const [dismissedToken, setDismissedToken] = useState<string | null>(null);
  const highlighted = focusToken && focusToken !== dismissedToken ? focus : null;

  useEffect(() => {
    if (!focusToken) return;
    const id = setTimeout(() => setDismissedToken(focusToken), 4000);
    return () => clearTimeout(id);
  }, [focusToken]);

  // "Nästa" visas stort överst och tas därför bort ur sin sektion
  const next = useMemo(() => pickNext(alarms, now), [alarms, now]);

  const sections = useMemo<Section[]>(
    () =>
      buildSections(alarms, now).flatMap((s) => {
        const data = s.data.filter((a) => a.id !== next?.id);
        if (data.length === 0) return [];
        return [{ ...s, data: s.key === 'done' && !showDone ? [] : data, count: data.length }];
      }),
    [alarms, now, next, showDone]
  );

  // Scrolla fram det framlyfta larmet (en gång per tryck)
  const scrolledToken = useRef<string | null>(null);
  useEffect(() => {
    if (!highlighted || scrolledToken.current === focusToken) return;
    // "Nästa" ligger överst i listhuvudet, inte i någon sektion
    if (highlighted === next?.id) {
      scrolledToken.current = focusToken;
      listRef.current?.getScrollResponder()?.scrollTo({ y: 0, animated: true });
      return;
    }
    const sectionIndex = sections.findIndex((s) => s.data.some((a) => a.id === highlighted));
    if (sectionIndex < 0) return;
    scrolledToken.current = focusToken;
    const itemIndex = sections[sectionIndex].data.findIndex((a) => a.id === highlighted);
    listRef.current?.scrollToLocation({ sectionIndex, itemIndex, viewOffset: 80, animated: true });
  }, [highlighted, focusToken, sections, next]);

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

  const complete = (a: LocalAlarm) => runWithUndo(completeAlarm, a, 'Markerat som klart');
  const remove = (a: LocalAlarm) => runWithUndo(removeAlarm, a, 'Påminnelsen raderades');
  const toggleItem = (alarmId: string, itemId: string) => {
    Haptics.selectionAsync().catch(() => {});
    toggleChecklistItem(alarmId, itemId);
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
  const active = countActive(alarms);
  const today = dateFormat.format(now);
  const subtitle = `${today.charAt(0).toUpperCase()}${today.slice(1)}${active > 0 ? ` · ${active} aktiva` : ''}`;

  return (
    <View style={styles.screen}>
      <SectionList
        ref={listRef}
        onScrollToIndexFailed={(info) =>
          listRef.current
            ?.getScrollResponder()
            ?.scrollTo({ y: info.index * info.averageItemLength, animated: true })
        }
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={[styles.list, { paddingTop: insets.top + spacing.lg, paddingBottom: 120 }]}
        ListHeaderComponent={
          <>
            <ScreenHeader title="Påminnelser" subtitle={subtitle} right={<SettingsButton />} />
            <PermissionBanner permissions={permissions} alarms={alarms} onChanged={refreshPermissions} />
            {next && (
              <NextCard
                alarm={next}
                now={now}
                highlighted={next.id === highlighted}
                onToggleChecklist={toggleItem}
                onComplete={complete}
                onDelete={remove}
              />
            )}
          </>
        }
        renderSectionHeader={({ section }) =>
          section.key === 'done' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showDone }}
              accessibilityLabel={`${section.title}, ${section.count} st`}
              onPress={() => setShowDone((v) => !v)}
              style={styles.sectionHeaderRow}
            >
              <Text style={styles.sectionHeader}>
                {section.title.toUpperCase()} ({section.count})
              </Text>
              <Icon name={showDone ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
            </Pressable>
          ) : (
            <Text accessibilityRole="header" style={[styles.sectionHeader, styles.sectionHeaderRow]}>
              {section.key === 'places' ? 'BEVAKAS · PLATSER' : section.title.toUpperCase()}
            </Text>
          )
        }
        renderItem={({ item, section }) =>
          CARD_SECTIONS.includes(section.key) ? (
            <AlarmCard
              alarm={item}
              now={now}
              highlighted={item.id === highlighted}
              onToggleChecklist={toggleItem}
              onComplete={complete}
              onDelete={remove}
              onAccept={handleAccept}
              onDecline={(a) => {
                declineFriendAlarm(a.id);
                snackbar.show('Förfrågan avböjdes');
              }}
            />
          ) : (
            <AlarmRow
              alarm={item}
              now={now}
              highlighted={item.id === highlighted}
              onToggleChecklist={toggleItem}
              onComplete={complete}
              onDelete={remove}
            />
          )
        }
        ListEmptyComponent={
          isEmpty ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Icon name="notifications-outline" size={36} color={colors.accentText} />
              </View>
              <Text style={styles.emptyTitle}>Inga påminnelser ännu</Text>
              <Text style={styles.emptyText}>
                Bli påmind vid en viss tid – eller när du kommer till eller lämnar en plats.
              </Text>
              <Button title="Ny påminnelse" icon="add" onPress={() => router.push('/new')} />
            </View>
          ) : null
        }
      />

      {!isEmpty && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ny påminnelse"
          onPress={() => router.push('/new')}
          style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
        >
          <Icon name="add" size={24} color={colors.onAccent} />
          <Text style={styles.fabText}>Ny påminnelse</Text>
        </Pressable>
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors, dark }) => ({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { paddingHorizontal: spacing.xl, flexGrow: 1 },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: MIN_TOUCH,
    marginTop: spacing.sm,
  },
  sectionHeader: { ...typography.label, letterSpacing: 1, color: colors.textMuted },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, paddingHorizontal: spacing.xl },
  emptyIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.accentBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { ...typography.title, color: colors.textPrimary },
  emptyText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    bottom: spacing.xl,
    height: 56,
    paddingLeft: spacing.lg,
    paddingRight: spacing.xxl,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    shadowColor: '#000',
    shadowOpacity: dark ? 0.45 : 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  fabText: { ...typography.headline, fontWeight: '700', color: colors.onAccent },
}));
