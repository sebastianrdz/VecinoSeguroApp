/**
 * Design tokens shared by every screen. Keep hardcoded colors/spacing out of
 * screen files — reference these tokens instead so the app reads as one
 * system and theme changes happen in one place.
 */
export const colors = {
  background: '#F5F7F6',
  surface: '#FFFFFF',
  border: '#DCE3DF',
  textPrimary: '#12241C',
  textSecondary: '#5B6B63',
  textInverse: '#FFFFFF',

  primary: '#0F5132',
  primaryDark: '#0A3A24',
  primaryLight: '#DFF0E7',

  accent: '#1E7A46',

  danger: '#B3261E',
  dangerLight: '#FBEAE9',
  warning: '#8A6D1D',
  warningLight: '#FBF3D9',
  success: '#0F5132',
  successLight: '#E3F3EA',

  overlay: 'rgba(10, 20, 15, 0.6)',
  disabled: '#B7C2BC',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 20,
  pill: 999,
} as const;

export const typography = {
  h1: { fontSize: 28, fontWeight: '700' as const, color: colors.textPrimary },
  h2: { fontSize: 22, fontWeight: '700' as const, color: colors.textPrimary },
  h3: { fontSize: 18, fontWeight: '600' as const, color: colors.textPrimary },
  body: { fontSize: 16, fontWeight: '400' as const, color: colors.textPrimary },
  bodyBold: { fontSize: 16, fontWeight: '600' as const, color: colors.textPrimary },
  caption: { fontSize: 13, fontWeight: '400' as const, color: colors.textSecondary },
  button: { fontSize: 16, fontWeight: '700' as const, color: colors.textInverse },
};
