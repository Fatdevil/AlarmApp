/**
 * Alarm App - Design System & Theme Tokens
 * Ljust och mörkt tema. All text uppfyller WCAG AA (≥ 4.5:1) mot sin bakgrund –
 * se __tests__/theme.test.ts.
 */
import { useMemo } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';

export interface Palette {
  background: string;
  surface: string;
  surfaceElevated: string;
  surfaceHighlight: string;
  border: string;
  borderStrong: string;

  accent: string; // Primär interaktionsfärg (knappar, valda chips)
  onAccent: string; // Text på accent
  accentText: string; // Accentfärgad text på background/surface
  success: string;
  warning: string;
  warningBg: string;
  danger: string;
  dangerBg: string;

  textPrimary: string;
  textSecondary: string;
  textMuted: string;
}

const dark: Palette = {
  background: '#090D16',
  surface: '#131B2B',
  surfaceElevated: '#1C263D',
  surfaceHighlight: '#263450',
  border: 'rgba(255, 255, 255, 0.10)',
  borderStrong: 'rgba(255, 255, 255, 0.22)',

  accent: '#2563EB',
  onAccent: '#FFFFFF',
  accentText: '#00E1EE',
  success: '#34D399',
  warning: '#FBBF24',
  warningBg: 'rgba(245, 158, 11, 0.14)',
  danger: '#FB7185',
  dangerBg: 'rgba(244, 63, 94, 0.14)',

  textPrimary: '#F8FAFC',
  textSecondary: '#B4C0D3',
  textMuted: '#8B9AB1',
};

const light: Palette = {
  background: '#F4F6FB',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceHighlight: '#E8EDF7',
  border: 'rgba(15, 23, 42, 0.10)',
  borderStrong: 'rgba(15, 23, 42, 0.22)',

  accent: '#2563EB',
  onAccent: '#FFFFFF',
  accentText: '#1D4ED8',
  success: '#047857',
  warning: '#B45309',
  warningBg: 'rgba(245, 158, 11, 0.14)',
  danger: '#BE123C',
  dangerBg: 'rgba(244, 63, 94, 0.10)',

  textPrimary: '#0F172A',
  textSecondary: '#334155',
  textMuted: '#5B6778',
};

export const palettes = { dark, light };

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
};

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  card: 18,
  pill: 9999,
};

/** Minsta tryckyta enligt Apple HIG / Material (44 pt / 48 dp). */
export const MIN_TOUCH = 44;

export const typography = {
  largeTitle: { fontSize: 32, fontWeight: '800' as const, letterSpacing: -0.5 },
  title: { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.3 },
  headline: { fontSize: 17, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 22 },
  callout: { fontSize: 15, fontWeight: '500' as const },
  footnote: { fontSize: 13, fontWeight: '500' as const, lineHeight: 18 },
  label: { fontSize: 13, fontWeight: '700' as const, letterSpacing: 0.4 },
};

export interface Theme {
  dark: boolean;
  colors: Palette;
}

export function useTheme(): Theme {
  const scheme = useColorScheme();
  const isDark = scheme !== 'light';
  return useMemo(() => ({ dark: isDark, colors: isDark ? dark : light }), [isDark]);
}

/** Skapar en hook som bygger temaberoende StyleSheets. */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (theme: Theme) => T) {
  return function useStyles(): T {
    const theme = useTheme();
    return useMemo(() => StyleSheet.create(factory(theme)), [theme]);
  };
}
