/**
 * Avbockningsbara checklistepunkter – samma utseende i kort, rader och "Nästa".
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { makeStyles, MIN_TOUCH, spacing, typography, useTheme } from '../theme';
import { ChecklistItem } from '../types';
import { Icon } from './ui';

interface Props {
  alarmId: string;
  items: ChecklistItem[];
  onToggle: (alarmId: string, itemId: string) => void;
}

export function checklistProgress(items: ChecklistItem[]): string {
  return `${items.filter((i) => i.done).length} av ${items.length}`;
}

export function ChecklistItems({ alarmId, items, onToggle }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <>
      {items.map((item) => (
        <Pressable
          key={item.id}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: item.done }}
          accessibilityLabel={item.text}
          onPress={() => onToggle(alarmId, item.id)}
          style={styles.row}
        >
          <View style={[styles.box, item.done && styles.boxOn]}>
            {item.done && <Icon name="checkmark" size={14} color={colors.onAccent} />}
          </View>
          <Text style={[styles.text, item.done && styles.done]}>{item.text}</Text>
        </Pressable>
      ))}
    </>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: MIN_TOUCH },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  text: { ...typography.body, color: colors.textPrimary, flex: 1 },
  done: { textDecorationLine: 'line-through', color: colors.textMuted },
}));
