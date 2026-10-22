/**
 * Kompakt rad för en påminnelse: klockslag (orange) eller platsikon (blå) i en egen
 * kolumn, texten och detaljer bredvid. Tryck fäller ut en checklista; svep för Klar/Radera.
 */
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  alarmKind,
  rowDetails,
  rowFollowUp,
  shortDay,
  shownTime,
} from '../logic/alarmDisplay';
import { formatClock } from '../logic/time';
import { makeStyles, MIN_TOUCH, radii, spacing, typography, useTheme } from '../theme';
import { LocalAlarm } from '../types';
import { SwipeActions } from './SwipeActions';
import { Icon } from './ui';

interface Props {
  alarm: LocalAlarm;
  now: Date;
  highlighted?: boolean;
  onToggleChecklist: (alarmId: string, itemId: string) => void;
  onComplete: (alarm: LocalAlarm) => void;
  onDelete: (alarm: LocalAlarm) => void;
}

export function AlarmRow({ alarm, now, highlighted, onToggleChecklist, onComplete, onDelete }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const [expanded, setExpanded] = useState(false);

  const kind = alarmKind(alarm, now);
  const time = shownTime(alarm, now);
  const day = time ? shortDay(time, now) : null;
  const details = rowDetails(alarm, now);
  const followUp = rowFollowUp(alarm, now);
  const checklist = alarm.checklistItems ?? [];
  const isDone = alarm.status === 'DONE' || alarm.status === 'CANCELLED';
  const enter = alarm.triggerType === 'ENTER_LOCATION';

  const label = [
    time ? `${formatClock(time)}${day ? ` ${day}` : ''}` : null,
    alarm.content,
    ...details,
    followUp,
    isDone ? 'Klar' : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <SwipeActions canComplete={!isDone} onComplete={() => onComplete(alarm)} onDelete={() => onDelete(alarm)}>
      <View style={[styles.container, highlighted && styles.highlighted]}>
        <Pressable
          accessibilityRole={checklist.length > 0 ? 'button' : undefined}
          accessibilityLabel={label}
          accessibilityState={checklist.length > 0 ? { expanded } : undefined}
          accessibilityHint={checklist.length > 0 ? 'Visar checklistan' : undefined}
          accessibilityActions={[
            ...(!isDone ? [{ name: 'complete', label: 'Markera som klar' }] : []),
            { name: 'delete', label: 'Radera' },
          ]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'complete') onComplete(alarm);
            if (e.nativeEvent.actionName === 'delete') onDelete(alarm);
          }}
          // Inte disabled utan checklista: då läses raden upp som nedtonad och åtgärderna nås inte
          onPress={checklist.length > 0 ? () => setExpanded((v) => !v) : undefined}
          style={[styles.row, isDone && styles.done]}
        >
          <View style={styles.lead}>
            {kind === 'time' && time ? (
              <>
                <Text style={styles.clock}>{formatClock(time)}</Text>
                {day && <Text style={styles.day}>{day}</Text>}
              </>
            ) : (
              <Icon name={enter ? 'enter-outline' : 'exit-outline'} size={22} color={colors.placeText} />
            )}
          </View>
          <View style={styles.body}>
            <Text style={[styles.content, isDone && styles.strike]} numberOfLines={2}>
              {alarm.content}
            </Text>
            {details.length > 0 && <Text style={styles.details}>{details.join(' · ')}</Text>}
            {followUp && (
              <View style={styles.followUp}>
                <Icon name={enter ? 'enter-outline' : 'exit-outline'} size={14} color={colors.placeText} />
                <Text style={styles.followUpText}>{followUp}</Text>
              </View>
            )}
          </View>
          {checklist.length > 0 && (
            <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
          )}
        </Pressable>

        {expanded && (
          <View style={styles.checklist}>
            {checklist.map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: item.done }}
                accessibilityLabel={item.text}
                onPress={() => onToggleChecklist(alarm.id, item.id)}
                style={styles.checkRow}
              >
                <View style={[styles.checkbox, item.done && styles.checkboxOn]}>
                  {item.done && <Icon name="checkmark" size={14} color={colors.onAccent} />}
                </View>
                <Text style={[styles.checkText, item.done && styles.strike]}>{item.text}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </SwipeActions>
  );
}

const LEAD_WIDTH = 60;

const useStyles = makeStyles(({ colors }) => ({
  container: {
    backgroundColor: colors.background,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  highlighted: { backgroundColor: colors.accentBg },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 64,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  done: { opacity: 0.6 },
  lead: { width: LEAD_WIDTH },
  clock: {
    ...typography.headline,
    fontWeight: '700',
    color: colors.accentText,
    fontVariant: ['tabular-nums'],
  },
  day: { ...typography.footnote, fontSize: 12, color: colors.textMuted },
  body: { flex: 1, gap: 2 },
  content: { ...typography.body, fontWeight: '500', color: colors.textPrimary },
  details: { ...typography.footnote, color: colors.textMuted },
  followUp: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  followUpText: { ...typography.footnote, color: colors.placeText },
  strike: { textDecorationLine: 'line-through' },
  checklist: {
    marginLeft: LEAD_WIDTH + spacing.md + spacing.xs,
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: MIN_TOUCH },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkText: { ...typography.body, color: colors.textPrimary, flex: 1 },
}));
