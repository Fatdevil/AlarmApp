import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from '../components/SafeAreaView';
import { LocalAlarm } from '../types';
import { AlarmCard } from '../components/AlarmCard';
import { colors, spacing, radii, typography } from '../theme';

interface AlarmHomeScreenProps {
  alarms: LocalAlarm[];
  onToggleChecklist: (alarmId: string, itemId: string) => void;
  onMarkDone: (alarm: LocalAlarm) => void;
  onDelete: (alarm: LocalAlarm) => void;
  onRefresh: () => void;
  onPressAdd: () => void;
}

export const AlarmHomeScreen: React.FC<AlarmHomeScreenProps> = ({
  alarms,
  onToggleChecklist,
  onMarkDone,
  onDelete,
  onRefresh,
  onPressAdd,
}) => {
  const [activeFilter, setActiveFilter] = useState<'today' | 'upcoming' | 'all'>('today');
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  };

  // Filtrera larm baserat på "Idag" vs "Kommande"
  const filteredAlarms = useMemo(() => {
    const todayStr = new Date().toDateString();

    if (activeFilter === 'today') {
      return alarms.filter((a) => {
        if (a.status === 'DONE' || a.status === 'CANCELLED') return false;
        if (a.triggerType !== 'TIME') return true; // Platsalarm är aktiva idag
        if (!a.dateTime) return false;
        return new Date(a.dateTime).toDateString() === todayStr;
      });
    }

    if (activeFilter === 'upcoming') {
      return alarms.filter((a) => {
        if (a.status === 'DONE' || a.status === 'CANCELLED') return false;
        if (a.triggerType === 'TIME' && a.dateTime) {
          return new Date(a.dateTime).toDateString() !== todayStr;
        }
        return false;
      });
    }

    return alarms;
  }, [alarms, activeFilter]);

  const activeCount = alarms.filter((a) => a.status !== 'DONE' && a.status !== 'CANCELLED').length;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accentCyan}
          />
        }
      >
        {/* Header & Integritetssköld */}
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <Text style={styles.screenTitle}>Alarm</Text>
            <View style={styles.shieldBadge}>
              <Text style={styles.shieldDot}>●</Text>
              <Text style={styles.shieldText}>On-Device Skydd</Text>
            </View>
          </View>
          <Text style={styles.tagline}>
            Rätt påminnelse. Rätt plats. Rätt tid.
          </Text>
        </View>

        {/* Filterväljare: Idag / Kommande / Alla */}
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, activeFilter === 'today' && styles.filterChipActive]}
            onPress={() => setActiveFilter('today')}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterText, activeFilter === 'today' && styles.filterTextActive]}>
              Idag
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, activeFilter === 'upcoming' && styles.filterChipActive]}
            onPress={() => setActiveFilter('upcoming')}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterText, activeFilter === 'upcoming' && styles.filterTextActive]}>
              Kommande
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, activeFilter === 'all' && styles.filterChipActive]}
            onPress={() => setActiveFilter('all')}
            activeOpacity={0.7}
          >
            <Text style={[styles.filterText, activeFilter === 'all' && styles.filterTextActive]}>
              Alla ({alarms.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Innehållslista */}
        {filteredAlarms.length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <View style={styles.emptyRadarCircle}>
              <Text style={styles.emptyIcon}>📍</Text>
            </View>
            <Text style={styles.emptyTitle}>Inga aktiva larm</Text>
            <Text style={styles.emptyDesc}>
              {activeFilter === 'today'
                ? 'Du har inga schemalagda larm eller aktiva platser för idag.'
                : 'Inga kommande larm matchar detta filter.'}
            </Text>
            <TouchableOpacity style={styles.emptyCreateBtn} onPress={onPressAdd} activeOpacity={0.8}>
              <Text style={styles.emptyCreateBtnText}>+ Skapa ditt första larm</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.cardList}>
            {filteredAlarms.map((alarm) => (
              <AlarmCard
                key={alarm.id}
                alarm={alarm}
                onToggleChecklist={onToggleChecklist}
                onMarkDone={onMarkDone}
                onDelete={onDelete}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    padding: spacing.lg,
    paddingBottom: 100, // Luft för flytande TabBar
  },
  header: {
    marginBottom: spacing.lg,
    marginTop: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  screenTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  shieldBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  shieldDot: {
    color: colors.privacyEmerald,
    fontSize: 9,
    marginRight: 5,
  },
  shieldText: {
    color: colors.privacyEmerald,
    fontSize: 11,
    fontWeight: '700',
  },
  tagline: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.surfaceHighlight,
    borderColor: colors.accentCyan,
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterTextActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  cardList: {
    gap: 4,
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyRadarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0, 242, 254, 0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(0, 242, 254, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  emptyIcon: {
    fontSize: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptyDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    maxWidth: 260,
    lineHeight: 18,
    marginBottom: spacing.xl,
  },
  emptyCreateBtn: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.accentCyan,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radii.pill,
  },
  emptyCreateBtnText: {
    color: colors.accentCyan,
    fontSize: 13,
    fontWeight: '700',
  },
});
