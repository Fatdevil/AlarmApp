import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
} from 'react-native';
import { LocalAlarm, ChecklistItem } from '../types';
import { colors, spacing, radii, typography } from '../theme';

interface AlarmCardProps {
  alarm: LocalAlarm;
  onToggleChecklist?: (alarmId: string, itemId: string) => void;
  onMarkDone?: (alarm: LocalAlarm) => void;
  onDelete?: (alarm: LocalAlarm) => void;
}

export const AlarmCard: React.FC<AlarmCardProps> = ({
  alarm,
  onToggleChecklist,
  onMarkDone,
  onDelete,
}) => {
  const isTime = alarm.triggerType === 'TIME';
  const isEnter = alarm.triggerType === 'ENTER_LOCATION';
  const isExit = alarm.triggerType === 'EXIT_LOCATION';

  // Formatera tid för tidsalarm
  const formatTimeDisplay = (isoStr?: string | null) => {
    if (!isoStr) return '';
    try {
      const date = new Date(isoStr);
      if (isNaN(date.getTime())) return '';
      const now = new Date();
      const isToday =
        date.getDate() === now.getDate() &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear();

      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      const timeStr = `${hours}:${minutes}`;

      if (isToday) return `Idag ${timeStr}`;
      const months = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
      return `${date.getDate()} ${months[date.getMonth()]} kl. ${timeStr}`;
    } catch {
      return '';
    }
  };

  const checklist = alarm.checklistItems || [];
  const completedCount = checklist.filter((i) => i.done).length;

  return (
    <View style={styles.cardContainer}>
      {/* Header med typ & badge */}
      <View style={styles.headerRow}>
        <View style={styles.triggerBadge}>
          {isTime ? (
            <>
              <Text style={styles.badgeIcon}>⏰</Text>
              <Text style={styles.badgeTextTime}>TID</Text>
            </>
          ) : isEnter ? (
            <>
              <Text style={styles.badgeIcon}>📍</Text>
              <Text style={styles.badgeTextLocation}>NÄR DU ANLÄNDER</Text>
            </>
          ) : (
            <>
              <Text style={styles.badgeIcon}>🚗</Text>
              <Text style={styles.badgeTextExit}>NÄR DU LÄMNAR</Text>
            </>
          )}
        </View>

        <View style={styles.privacyShield}>
          <Text style={styles.privacyDot}>●</Text>
          <Text style={styles.privacyText}>On-Device</Text>
        </View>
      </View>

      {/* Huvudinnehåll / Platsdetaljer */}
      <View style={styles.contentSection}>
        {isTime && alarm.dateTime && (
          <Text style={styles.timeBigText}>{formatTimeDisplay(alarm.dateTime)}</Text>
        )}

        {!isTime && alarm.location && (
          <View style={styles.locationHeaderRow}>
            <Text style={styles.locationTitle}>{alarm.location.name}</Text>
            <View style={styles.radiusPill}>
              <Text style={styles.radiusText}>{alarm.location.radius} m radie</Text>
            </View>
          </View>
        )}

        <Text style={styles.alarmContentText}>{alarm.content}</Text>
      </View>

      {/* Checklista om den finns */}
      {checklist.length > 0 && (
        <View style={styles.checklistContainer}>
          <View style={styles.checklistHeader}>
            <Text style={styles.checklistTitle}>Checklista</Text>
            <Text style={styles.checklistProgress}>
              {completedCount}/{checklist.length} klara
            </Text>
          </View>

          {checklist.map((item: ChecklistItem) => (
            <TouchableOpacity
              key={item.id}
              style={styles.checklistItemRow}
              activeOpacity={0.7}
              onPress={() => onToggleChecklist && onToggleChecklist(alarm.id, item.id)}
            >
              <View style={[styles.checkbox, item.done && styles.checkboxChecked]}>
                {item.done && <Text style={styles.checkmarkText}>✓</Text>}
              </View>
              <Text style={[styles.itemText, item.done && styles.itemTextDone]}>
                {item.text}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Footer med actions */}
      <View style={styles.footerRow}>
        <View style={styles.statusIndicator}>
          <Text style={styles.statusLabel}>
            Status: <Text style={styles.statusValue}>{alarm.status}</Text>
          </Text>
        </View>

        <View style={styles.actionButtons}>
          {onMarkDone && alarm.status !== 'DONE' && (
            <TouchableOpacity
              style={styles.doneButton}
              onPress={() => onMarkDone(alarm)}
              activeOpacity={0.8}
            >
              <Text style={styles.doneButtonText}>✓ Klar</Text>
            </TouchableOpacity>
          )}
          {onDelete && (
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => onDelete(alarm)}
              activeOpacity={0.8}
            >
              <Text style={styles.deleteButtonText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 3,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  triggerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  badgeIcon: {
    fontSize: 11,
    marginRight: 4,
  },
  badgeTextTime: {
    color: colors.accentCyan,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  badgeTextLocation: {
    color: colors.accentCobalt,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  badgeTextExit: {
    color: colors.warningAmber,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  privacyShield: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  privacyDot: {
    color: colors.privacyEmerald,
    fontSize: 8,
    marginRight: 4,
  },
  privacyText: {
    color: colors.privacyEmerald,
    fontSize: 10,
    fontWeight: '600',
  },
  contentSection: {
    marginVertical: spacing.xs,
  },
  timeBigText: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  locationHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  locationTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  radiusPill: {
    backgroundColor: colors.surfaceHighlight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
  },
  radiusText: {
    color: colors.accentCyan,
    fontSize: 11,
    fontWeight: '600',
  },
  alarmContentText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  checklistContainer: {
    marginTop: spacing.md,
    backgroundColor: 'rgba(0,0,0,0.2)',
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  checklistHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  checklistTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  checklistProgress: {
    fontSize: 11,
    color: colors.accentCyan,
    fontWeight: '600',
  },
  checklistItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.accentCyan,
    borderColor: colors.accentCyan,
  },
  checkmarkText: {
    color: colors.textDark,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 14,
  },
  itemText: {
    fontSize: 13,
    color: colors.textPrimary,
    flex: 1,
  },
  itemTextDone: {
    color: colors.textMuted,
    textDecorationLine: 'line-through',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  statusIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 11,
    color: colors.textMuted,
  },
  statusValue: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  doneButton: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: colors.privacyEmerald,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: radii.sm,
  },
  doneButtonText: {
    color: colors.privacyEmerald,
    fontSize: 12,
    fontWeight: '700',
  },
  deleteButton: {
    backgroundColor: 'rgba(244, 63, 94, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(244, 63, 94, 0.3)',
    width: 28,
    height: 28,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: {
    color: colors.dangerCoral,
    fontSize: 12,
    fontWeight: '700',
  },
});
