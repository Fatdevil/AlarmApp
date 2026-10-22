/**
 * "Nästa": påminnelsen som ringer härnäst, stort överst på startsidan.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { rowFollowUp, shownTime } from '../logic/alarmDisplay';
import { formatClock, formatCountdown, formatDayLabel } from '../logic/time';
import { makeStyles, radii, spacing, typography, useTheme } from '../theme';
import { LocalAlarm } from '../types';
import { ChecklistItems, checklistProgress } from './ChecklistItems';
import { SwipeActions } from './SwipeActions';
import { Button, Icon } from './ui';

interface Props {
  alarm: LocalAlarm;
  now: Date;
  highlighted?: boolean;
  onToggleChecklist: (alarmId: string, itemId: string) => void;
  onComplete: (alarm: LocalAlarm) => void;
  onDelete: (alarm: LocalAlarm) => void;
}

export function NextCard({ alarm, now, highlighted, onToggleChecklist, onComplete, onDelete }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const time = shownTime(alarm, now);
  if (!time) return null;
  const followUp = rowFollowUp(alarm, now);
  const items = alarm.checklistItems ?? [];
  const countdown = formatCountdown(time, now);
  const day = formatDayLabel(time, now);

  return (
    <View style={styles.wrapper}>
      <SwipeActions
        canComplete
        onComplete={() => onComplete(alarm)}
        onDelete={() => onDelete(alarm)}
        radius={CARD_RADIUS}
      >
        <View style={[styles.card, highlighted && styles.highlighted]}>
          {/* Sammanfattningen läses som en enhet; knappar och checklista nås var för sig */}
          <View
            accessible
            accessibilityRole="summary"
            accessibilityLabel={`Nästa: ${alarm.content}, ${day} ${formatClock(time)}, ${countdown}${followUp ? `, ${followUp}` : ''}`}
            accessibilityActions={[
              { name: 'complete', label: 'Markera som klar' },
              { name: 'delete', label: 'Radera' },
            ]}
            onAccessibilityAction={(e) => {
              if (e.nativeEvent.actionName === 'complete') onComplete(alarm);
              if (e.nativeEvent.actionName === 'delete') onDelete(alarm);
            }}
            style={styles.summary}
          >
            <View style={styles.topRow}>
              <Text style={styles.label}>NÄSTA</Text>
              <Text style={styles.countdown}>{countdown}</Text>
            </View>
            <View style={styles.timeRow}>
              <Text style={styles.clock}>{formatClock(time)}</Text>
              <Text style={styles.day}>{day}</Text>
            </View>
            <Text style={styles.content}>{alarm.content}</Text>
            {followUp && (
              <View style={styles.placeChip}>
                <Icon
                  name={alarm.triggerType === 'ENTER_LOCATION' ? 'enter-outline' : 'exit-outline'}
                  size={14}
                  color={colors.placeText}
                />
                <Text style={styles.placeChipText}>{followUp}</Text>
              </View>
            )}
          </View>
          {items.length > 0 && (
            <View style={styles.checklist}>
              <Text style={styles.checklistProgress}>Checklista {checklistProgress(items)}</Text>
              <ChecklistItems alarmId={alarm.id} items={items} onToggle={onToggleChecklist} />
            </View>
          )}
          <Button variant="secondary" title="Klar" icon="checkmark" onPress={() => onComplete(alarm)} />
        </View>
      </SwipeActions>
    </View>
  );
}

const CARD_RADIUS = 22;

const useStyles = makeStyles(({ colors }) => ({
  wrapper: { marginBottom: spacing.xl },
  card: {
    backgroundColor: colors.surface,
    borderRadius: CARD_RADIUS,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.md,
  },
  summary: { gap: spacing.md },
  highlighted: { borderColor: colors.accent, borderWidth: 2 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { ...typography.label, fontSize: 12, letterSpacing: 1.2, color: colors.accentText },
  countdown: { ...typography.footnote, color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  timeRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.md },
  clock: {
    fontSize: 56,
    lineHeight: 60,
    fontWeight: '700',
    letterSpacing: -2,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  day: { ...typography.callout, color: colors.textSecondary },
  content: { fontSize: 19, lineHeight: 26, fontWeight: '600', color: colors.textPrimary },
  placeChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 30,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.placeBg,
  },
  placeChipText: { ...typography.footnote, fontWeight: '600', color: colors.placeText },
  checklist: {
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.background,
  },
  checklistProgress: { ...typography.footnote, color: colors.textMuted, paddingTop: spacing.sm },
}));
