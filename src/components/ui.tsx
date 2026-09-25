/**
 * Små återanvändbara UI-byggstenar med tillgänglighet och 44 pt tryckytor inbyggt.
 */
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleProp,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { makeStyles, MIN_TOUCH, radii, spacing, typography, useTheme } from '../theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function Icon({ name, size = 20, color }: { name: IconName; size?: number; color?: string }) {
  const { colors } = useTheme();
  return (
    <Ionicons
      name={name}
      size={size}
      color={color ?? colors.textPrimary}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost';

interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  title: string;
  icon?: IconName;
  variant?: ButtonVariant;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}

export function Button({
  title,
  icon,
  variant = 'primary',
  loading = false,
  disabled,
  style,
  compact = false,
  ...rest
}: ButtonProps) {
  const styles = useButtonStyles();
  const { colors } = useTheme();
  const fg =
    variant === 'primary'
      ? colors.onAccent
      : variant === 'destructive'
        ? colors.danger
        : colors.accentText;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        styles[variant],
        pressed && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Icon name={icon} size={18} color={fg} />}
          <Text style={[styles.text, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

const useButtonStyles = makeStyles(({ colors }) => ({
  base: {
    minHeight: 50,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  compact: { minHeight: MIN_TOUCH, borderRadius: radii.md, paddingHorizontal: spacing.md },
  primary: { backgroundColor: colors.accent },
  secondary: { backgroundColor: colors.surfaceHighlight },
  destructive: { backgroundColor: colors.dangerBg },
  ghost: { backgroundColor: 'transparent' },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.5 },
  text: { ...typography.callout, fontWeight: '700' },
}));

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: IconName;
  accessibilityHint?: string;
}

export function Chip({ label, selected, onPress, icon, accessibilityHint }: ChipProps) {
  const styles = useChipStyles();
  const { colors } = useTheme();
  const fg = selected ? colors.onAccent : colors.textPrimary;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [styles.chip, selected && styles.selected, pressed && { opacity: 0.8 }]}
    >
      {icon && <Icon name={icon} size={16} color={fg} />}
      <Text style={[styles.text, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const useChipStyles = makeStyles(({ colors }) => ({
  chip: {
    minHeight: MIN_TOUCH,
    paddingHorizontal: spacing.md + 2,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  selected: { backgroundColor: colors.accent, borderColor: colors.accent },
  text: { ...typography.footnote, fontWeight: '600' },
}));

export function SectionLabel({ children }: { children: string }) {
  const { colors } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={[typography.label, { color: colors.textMuted, marginBottom: spacing.sm }]}
    >
      {children.toUpperCase()}
    </Text>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radii.card,
          borderWidth: 1,
          borderColor: colors.border,
          padding: spacing.lg,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
