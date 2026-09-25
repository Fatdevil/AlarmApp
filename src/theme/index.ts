/**
 * Alarm App - Design System & Theme Tokens
 * "Obsidian Dark Mode" – Precision, integritet och nordisk minimalism.
 */

export const colors = {
  // Bakgrunder
  background: '#090D16',         // Djup rymdsvärta
  backgroundSecondary: '#0E1422', // Sekundär bakgrund
  surface: '#131B2B',            // Kort och paneler
  surfaceElevated: '#1C263D',    // Modaler, aktiva val och svävande element
  surfaceHighlight: '#263450',   // Hover/press state

  // Ramar och linjer (subtil glasartad känsla)
  border: 'rgba(255, 255, 255, 0.08)',
  borderLight: 'rgba(255, 255, 255, 0.15)',
  borderFocus: '#00F2FE',

  // Accentfärger
  accentCyan: '#00F2FE',         // Neon Cyan för fokus, aktiva lägen och radar
  accentCobalt: '#3B82F6',       // Elektrisk koboltblå för primära knappar
  privacyEmerald: '#10B981',     // Smaragdgrön för integritet & "on-device shield"
  warningAmber: '#F59E0B',       // Amber för varningar / Low Power Mode
  dangerCoral: '#F43F5E',        // Korallröd för radering / kritiska larm
  purpleNeon: '#A855F7',         // Neonlila för speciella triggers

  // Textfärger
  textPrimary: '#F8FAFC',        // Huvudtext (vit/ljusgrå)
  textSecondary: '#94A3B8',      // Sekundär text / etiketter
  textMuted: '#64748B',          // Muted text / tidsstämplar
  textDark: '#090D16',           // Mörk text på ljusa knappar

  // Statusfärger
  online: '#10B981',
  offline: '#64748B',
};

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
  sm: 6,
  md: 10,
  lg: 14,
  card: 18,
  pill: 9999,
  modal: 26,
};

export const typography = {
  hero: {
    fontSize: 28,
    fontWeight: '800' as const,
    letterSpacing: -0.5,
    color: colors.textPrimary,
  },
  h1: {
    fontSize: 22,
    fontWeight: '700' as const,
    letterSpacing: -0.3,
    color: colors.textPrimary,
  },
  h2: {
    fontSize: 18,
    fontWeight: '600' as const,
    letterSpacing: -0.2,
    color: colors.textPrimary,
  },
  body: {
    fontSize: 14,
    fontWeight: '400' as const,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  caption: {
    fontSize: 12,
    fontWeight: '500' as const,
    color: colors.textSecondary,
  },
  monoBadge: {
    fontSize: 11,
    fontWeight: '600' as const,
    letterSpacing: 0.5,
  },
};
