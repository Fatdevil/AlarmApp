/**
 * Kompakt rad för en påminnelse: klockslag (orange) eller platsikon (blå) i en egen
 * kolumn, texten och detaljer bredvid. Tryck fäller ut en checklista; svep för Klar/Radera.
 */
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  alarmKind,
  finishedLabel,
  rowDetails,
  rowFollowUp,
  shortDay,
  shownTime,
} from '../logic/alarmDisplay';
import { formatClock } from '../logic/time';
import { makeStyles, radii, spacing, typography, useTheme } from '../theme';
import { LocalAlarm } from '../types';
import { ChecklistItems } from './ChecklistItems';
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
  // "Klar"/"Avbrutet" först, så att avbrutna inte ser ut som klara
  const finished = finishedLabel(alarm);
  const details = [...(finished ? [finished] : []), ...rowDetails(alarm, now)];
  const followUp = rowFollowUp(alarm, now);
  const checklist = alarm.checklistItems ?? [];
  const isDone = alarm.status === 'DONE' || alarm.status === 'CANCELLED';
  const enter = alarm.triggerType === 'ENTER_LOCATION';

  const label = [
    time ? `${formatClock(time)}${day ? ` ${day}` : ''}` : null,
    alarm.content,
    ...details,
    followUp,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <SwipeActions canComplete={!isDone} onComplete={() => onComplete(alarm)} onDelete={() => onDelete(alarm)}>
      {/* Ogenomskinlig botten så att svepåtgärderna inte syns igenom markeringen */}
      <View style={styles.container}>
        <View style={highlighted ? styles.highlighted : undefined}>
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
              <ChecklistItems alarmId={alarm.id} items={checklist} onToggle={onToggleChecklist} />
            </View>
          )}
        </View>
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
}));
