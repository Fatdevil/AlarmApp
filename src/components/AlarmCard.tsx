import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { followUpLine, hasTimeReminder, isZoneArmed } from '../logic/followUp';
import { LocalAlarm } from '../types';
import {
  formatClock,
  formatCountdown,
  formatDayLabel,
  nextOccurrence,
  REPEAT_LABELS,
} from '../logic/time';
import { makeStyles, MIN_TOUCH, radii, spacing, typography, useTheme } from '../theme';
import { SwipeActions } from './SwipeActions';
import { Button, Icon, IconName } from './ui';

interface AlarmCardProps {
  alarm: LocalAlarm;
  now: Date;
  highlighted?: boolean;
  onToggleChecklist: (alarmId: string, itemId: string) => void;
  onComplete: (alarm: LocalAlarm) => void;
  onDelete: (alarm: LocalAlarm) => void;
  onAccept?: (alarm: LocalAlarm) => void;
  onDecline?: (alarm: LocalAlarm) => void;
}

interface Headline {
  icon: IconName;
  title: string;
  subtitle: string | null;
}

function describe(alarm: LocalAlarm, now: Date): Headline {
  if (alarm.triggerType === 'TIME' && alarm.dateTime) {
    const next = nextOccurrence(alarm.dateTime, alarm.repeat, now);
    const shown = next ?? new Date(alarm.dateTime);
    const repeat = alarm.repeat && alarm.repeat !== 'NONE' ? ` · ${REPEAT_LABELS[alarm.repeat]}` : '';
    return {
      icon: 'alarm-outline',
      title: formatClock(shown),
      subtitle: `${formatDayLabel(shown, now)}${repeat}`,
    };
  }
  const place = alarm.location?.name ?? 'Plats';
  // Uppföljning: först en tid, sedan platsen
  if (hasTimeReminder(alarm) && !isZoneArmed(alarm, now)) {
    const at = new Date(alarm.dateTime!);
    return {
      icon: 'alarm-outline',
      title: formatClock(at),
      subtitle: `${formatDayLabel(at, now)} · ${followUpLine(alarm)}`,
    };
  }
  return alarm.triggerType === 'ENTER_LOCATION'
    ? { icon: 'enter-outline', title: place, subtitle: 'När du kommer fram' }
    : { icon: 'exit-outline', title: place, subtitle: 'När du lämnar' };
}

/** iOS utan systemlarm: tidsdelen ligger inte i telefonens schema än (se services/notificationBudget.ts). */
function waitingSuffix(alarm: LocalAlarm): string {
  return alarm.notificationIds?.length ? '' : ' · läggs in när appen öppnas närmare tiden';
}

function statusText(alarm: LocalAlarm, now: Date): string | null {
  switch (alarm.status) {
    case 'PENDING_ACCEPTANCE':
      return 'Väntar på ditt svar';
    case 'MISSED':
      return 'Missat – kunde inte schemaläggas';
    case 'FIRED_LOCALLY':
      return 'Har ringt';
    case 'DONE':
      return 'Klar';
    case 'CANCELLED':
      return 'Avbrutet';
    case 'ACTIVE_GEOFENCE':
      if (!isZoneArmed(alarm, now)) {
        return `Ringer ${formatCountdown(new Date(alarm.dateTime!), now)}${waitingSuffix(alarm)}`;
      }
      return `Aktivt · ${alarm.location?.radius ?? ''} m radie`;
    case 'SCHEDULED': {
      if (!alarm.dateTime) return null;
      const next = nextOccurrence(alarm.dateTime, alarm.repeat, now);
      if (!next) return 'Har ringt';
      return `Ringer ${formatCountdown(next, now)}${waitingSuffix(alarm)}`;
    }
  }
}

export function AlarmCard({
  alarm,
  now,
  highlighted,
  onToggleChecklist,
  onComplete,
  onDelete,
  onAccept,
  onDecline,
}: AlarmCardProps) {
  const styles = useStyles();
  const { colors } = useTheme();

  const head = describe(alarm, now);
  const status = statusText(alarm, now);
  const checklist = alarm.checklistItems ?? [];
  const doneCount = checklist.filter((i) => i.done).length;
  const isDone = alarm.status === 'DONE' || alarm.status === 'CANCELLED';
  const isRequest = alarm.status === 'PENDING_ACCEPTANCE';
  const needsAttention = alarm.status === 'FIRED_LOCALLY' || alarm.status === 'MISSED';

  const a11yLabel = [alarm.content, head.title, head.subtitle, status].filter(Boolean).join(', ');

  return (
    <View style={styles.wrapper}>
      <SwipeActions
        canComplete={!isDone && !isRequest}
        onComplete={() => onComplete(alarm)}
        onDelete={() => onDelete(alarm)}
        radius={radii.card}
      >
        <View
          style={[
            styles.card,
            needsAttention && styles.cardAttention,
            highlighted && styles.cardHighlighted,
            isDone && styles.cardDone,
          ]}
          accessible
          accessibilityLabel={a11yLabel}
          accessibilityActions={[
            ...(!isDone && !isRequest ? [{ name: 'complete', label: 'Markera som klar' }] : []),
            { name: 'delete', label: 'Radera' },
          ]}
          onAccessibilityAction={(e) => {
            if (e.nativeEvent.actionName === 'complete') onComplete(alarm);
            if (e.nativeEvent.actionName === 'delete') onDelete(alarm);
          }}
        >
          <View style={styles.headerRow}>
            <View style={styles.iconBubble}>
              <Icon name={head.icon} size={20} color={colors.accentText} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, isDone && styles.strike]} numberOfLines={1}>
                {head.title}
              </Text>
              {head.subtitle && <Text style={styles.subtitle}>{head.subtitle}</Text>}
            </View>
          </View>

          <Text style={[styles.content, isDone && styles.strike]}>{alarm.content}</Text>

          {checklist.length > 0 && (
            <View style={styles.checklist}>
              <Text style={styles.checklistProgress}>
                {doneCount} av {checklist.length} klara
              </Text>
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

          {status && (
            <Text
              style={[
                styles.status,
                needsAttention && { color: alarm.status === 'MISSED' ? colors.danger : colors.warning },
              ]}
            >
              {status}
            </Text>
          )}

          {isRequest ? (
            <View style={styles.actions}>
              <Button compact variant="secondary" title="Avböj" onPress={() => onDecline?.(alarm)} />
              <Button compact title="Aktivera" icon="checkmark" onPress={() => onAccept?.(alarm)} />
            </View>
          ) : (
            needsAttention && (
              <View style={styles.actions}>
                <Button compact title="Klar" icon="checkmark" onPress={() => onComplete(alarm)} />
              </View>
            )
          )}
        </View>
      </SwipeActions>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  wrapper: { marginBottom: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardAttention: { borderColor: colors.warning },
  cardHighlighted: { borderColor: colors.accentText, borderWidth: 2 },
  cardDone: { opacity: 0.7 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surfaceHighlight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typography.title, color: colors.textPrimary },
  subtitle: { ...typography.footnote, color: colors.textSecondary },
  content: { ...typography.body, color: colors.textPrimary },
  strike: { textDecorationLine: 'line-through' },
  checklist: {
    backgroundColor: colors.background,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  checklistProgress: { ...typography.footnote, color: colors.textMuted, paddingTop: spacing.sm },
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
  status: { ...typography.footnote, color: colors.textMuted },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
}));
