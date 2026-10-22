/**
 * "Nästa": påminnelsen som ringer härnäst, stort överst på startsidan.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { rowFollowUp, shownTime } from '../logic/alarmDisplay';
import { formatClock, formatCountdown, formatDayLabel } from '../logic/time';
import { makeStyles, radii, spacing, typography, useTheme } from '../theme';
import { LocalAlarm } from '../types';
import { Button, Icon } from './ui';

interface Props {
  alarm: LocalAlarm;
  now: Date;
  highlighted?: boolean;
  onComplete: (alarm: LocalAlarm) => void;
}

export function NextCard({ alarm, now, highlighted, onComplete }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const time = shownTime(alarm, now);
  if (!time) return null;
  const followUp = rowFollowUp(alarm, now);
  const items = alarm.checklistItems ?? [];
  const countdown = formatCountdown(time, now);
  const day = formatDayLabel(time, now);

  return (
    <View
      accessible
      accessibilityRole="summary"
      accessibilityLabel={`Nästa: ${alarm.content}, ${day} ${formatClock(time)}, ${countdown}${followUp ? `, ${followUp}` : ''}`}
      style={[styles.card, highlighted && styles.highlighted]}
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
      {(followUp || items.length > 0) && (
        <View style={styles.chips}>
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
          {items.length > 0 && (
            <View style={styles.chip}>
              <Text style={styles.chipText}>
                Checklista {items.filter((i) => i.done).length} av {items.length}
              </Text>
            </View>
          )}
        </View>
      )}
      <Button variant="secondary" title="Klar" icon="checkmark" onPress={() => onComplete(alarm)} />
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  placeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 30,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.placeBg,
  },
  placeChipText: { ...typography.footnote, fontWeight: '600', color: colors.placeText },
  chip: {
    justifyContent: 'center',
    minHeight: 30,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.surfaceHighlight,
  },
  chipText: { ...typography.footnote, fontWeight: '600', color: colors.textSecondary },
}));
