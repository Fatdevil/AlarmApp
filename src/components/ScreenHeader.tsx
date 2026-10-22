/**
 * Stor rubrik överst på flikarna, med en rad under och en valfri knapp till höger.
 */
import React from 'react';
import { Text, View } from 'react-native';
import { makeStyles, spacing, typography } from '../theme';

interface Props {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}

export function ScreenHeader({ title, subtitle, right }: Props) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <View style={styles.texts}>
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {right}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  texts: { flex: 1, gap: spacing.xs },
  title: { ...typography.largeTitle, lineHeight: 38, color: colors.textPrimary },
  subtitle: { ...typography.callout, fontWeight: '400', color: colors.textSecondary },
}));
