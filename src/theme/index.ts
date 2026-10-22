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

  /** Tid och primära handlingar: signalorange. */
  accent: string; // Fyllning (knappar, valda chips, tidsprickar)
  onAccent: string; // Text på accent
  accentText: string; // Orange text på background/surface (klockslag, länkar)
  accentBg: string; // Svag orange ton bakom valda val
  /** Plats: himmelsblå. Visas alltid tillsammans med en ikon, aldrig bara som färg. */
  place: string;
  onPlace: string;
  placeText: string;
  placeBg: string;

  success: string;
  warning: string;
  warningBg: string;
  danger: string;
  dangerBg: string;

  textPrimary: string;
  textSecondary: string;
  textMuted: string;
}

// Mörkt först: larm används ofta kväll och natt
const dark: Palette = {
  background: '#0B0C10',
  surface: '#15171D',
  surfaceElevated: '#1D2028',
  surfaceHighlight: '#262A33',
  border: 'rgba(255, 255, 255, 0.08)',
  borderStrong: 'rgba(255, 255, 255, 0.16)',

  accent: '#FF8A3D',
  onAccent: '#1A1206',
  accentText: '#FF9A52',
  accentBg: 'rgba(255, 138, 61, 0.12)',
  place: '#3D8BF2',
  onPlace: '#08182B',
  placeText: '#7DBBFF',
  placeBg: 'rgba(90, 169, 255, 0.14)',

  success: '#34D399',
  warning: '#FBBF24',
  warningBg: 'rgba(245, 158, 11, 0.14)',
  danger: '#FB7185',
  dangerBg: 'rgba(244, 63, 94, 0.14)',

  textPrimary: '#F2F3F5',
  textSecondary: '#A7ADBA',
  textMuted: '#8A91A0',
};

const light: Palette = {
  background: '#F5F6F8',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceHighlight: '#E9EBF0',
  border: 'rgba(17, 19, 24, 0.08)',
  borderStrong: 'rgba(17, 19, 24, 0.18)',

  accent: '#F97316',
  onAccent: '#1A1206',
  accentText: '#C2410C',
  accentBg: 'rgba(249, 115, 22, 0.10)',
  place: '#1D6FD1',
  onPlace: '#FFFFFF',
  placeText: '#1D6FD1',
  placeBg: 'rgba(29, 111, 209, 0.10)',

  success: '#047857',
  warning: '#B45309',
  warningBg: 'rgba(245, 158, 11, 0.14)',
  danger: '#BE123C',
  dangerBg: 'rgba(244, 63, 94, 0.10)',

  textPrimary: '#111318',
  textSecondary: '#4A5160',
  textMuted: '#626A79',
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
