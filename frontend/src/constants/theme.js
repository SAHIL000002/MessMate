/**
 * MessMate design tokens.
 *
 * Source of truth: the provided design folder
 *   stitch_messmate_meal_tracker/messmate/DESIGN.md
 * plus the Home / Meals / Profile mockups.
 *
 * Values are Material Design 3 semantic tokens (Material You), renamed to
 * camelCase. Screens must import from here instead of hardcoding colours,
 * radii, font sizes or spacing so every screen stays consistent.
 */

/* ------------------------------------------------------------------ */
/* Colours                                                             */
/* ------------------------------------------------------------------ */

export const colors = {
  // Surfaces (soft mint canvas + white / tinted containers)
  surface: '#f0fdf4',
  surfaceDim: '#d0ddd5',
  surfaceBright: '#f0fdf4',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#eaf7ee',
  surfaceContainer: '#e4f1e8',
  surfaceContainerHigh: '#deebe3',
  surfaceContainerHighest: '#d9e6dd',
  surfaceVariant: '#d9e6dd',
  background: '#f0fdf4',

  // Text + lines (Deep Forest Charcoal / muted outlines)
  onSurface: '#131e19',
  onSurfaceVariant: '#3e4943',
  onBackground: '#131e19',
  outline: '#6e7a73',
  outlineVariant: '#bdc9c1',

  // Inverse
  inverseSurface: '#27332d',
  inverseOnSurface: '#e7f4eb',
  surfaceTint: '#006c4e',

  // Primary - Emerald Green
  primary: '#005d42',
  onPrimary: '#ffffff',
  primaryContainer: '#047857',
  onPrimaryContainer: '#9ffdd3',
  inversePrimary: '#7bd8b1',

  // Secondary - Warm Gold
  secondary: '#855300',
  onSecondary: '#ffffff',
  secondaryContainer: '#fea619',
  onSecondaryContainer: '#684000',

  // Tertiary
  tertiary: '#495167',
  onTertiary: '#ffffff',
  tertiaryContainer: '#616980',
  onTertiaryContainer: '#e4e9ff',

  // Status - NOT EATEN uses error, PENDING uses the gold container
  error: '#ba1a1a',
  onError: '#ffffff',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',

  // Fixed accent ramps
  primaryFixed: '#97f5cc',
  primaryFixedDim: '#7bd8b1',
  onPrimaryFixed: '#002115',
  onPrimaryFixedVariant: '#00513a',
  secondaryFixed: '#ffddb8',
  secondaryFixedDim: '#ffb95f',
  onSecondaryFixed: '#2a1700',
  onSecondaryFixedVariant: '#653e00',
  tertiaryFixed: '#dae2fd',
  tertiaryFixedDim: '#bec6e0',
  onTertiaryFixed: '#131b2e',
  onTertiaryFixedVariant: '#3f465c',

  // Glass surfaces (DESIGN.md: "Glassmorphism meets Minimalism")
  glass: 'rgba(255, 255, 255, 0.75)',
  glassStrong: 'rgba(255, 255, 255, 0.92)',
  divider: 'rgba(0, 93, 66, 0.12)',

  // The soft emerald wash the Meals mockup paints today's history row with
  // (bg-primary-fixed/20). Kept here so the screen has no raw colour in it.
  primaryFixedSoft: 'rgba(151, 245, 204, 0.28)',
};

/* ------------------------------------------------------------------ */
/* Typography - Plus Jakarta Sans                                      */
/* ------------------------------------------------------------------ */

// React Native cannot fake weights on a custom font, so each weight is a
// separate loaded family (see @expo-google-fonts/plus-jakarta-sans).
export const fontFamily = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
};

// letterSpacing is converted from em to px (em value * fontSize).
export const typography = {
  headlineLg: { fontFamily: fontFamily.bold, fontSize: 32, lineHeight: 40, letterSpacing: -0.64 },
  headlineLgMobile: { fontFamily: fontFamily.bold, fontSize: 26, lineHeight: 32, letterSpacing: -0.26 },
  headlineMd: { fontFamily: fontFamily.semibold, fontSize: 24, lineHeight: 30, letterSpacing: -0.24 },
  headlineSm: { fontFamily: fontFamily.semibold, fontSize: 20, lineHeight: 26 },
  bodyLg: { fontFamily: fontFamily.regular, fontSize: 16, lineHeight: 24 },
  bodyMd: { fontFamily: fontFamily.regular, fontSize: 14, lineHeight: 20 },
  bodySm: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 18 },
  labelMd: { fontFamily: fontFamily.semibold, fontSize: 12, lineHeight: 16, letterSpacing: 0.24 },
  labelSm: { fontFamily: fontFamily.medium, fontSize: 11, lineHeight: 14, letterSpacing: 0.22 },
};

/* ------------------------------------------------------------------ */
/* Shape + spacing                                                     */
/* ------------------------------------------------------------------ */

// DESIGN.md `rounded` scale, in px. Cards use lg / xl, pills use full.
export const radius = {
  sm: 4,
  base: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
};

// DESIGN.md `spacing` scale, in px.
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
  gutter: 24,
  margin: 32,
};

/* ------------------------------------------------------------------ */
/* Elevation                                                           */
/* ------------------------------------------------------------------ */

// DESIGN.md: shadows pull warmth from emerald / forest charcoal instead
// of harsh black. `elevation` is the Android equivalent.
export const shadows = {
  card: {
    shadowColor: '#005d42',
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  raised: {
    shadowColor: '#131e19',
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
};

/* ------------------------------------------------------------------ */
/* Layout                                                              */
/* ------------------------------------------------------------------ */

export const layout = {
  screenPadding: spacing.lg,
  cardPadding: spacing.lg,
  hitSlop: { top: 8, bottom: 8, left: 8, right: 8 },
  minTouchSize: 44,
};

export default { colors, fontFamily, typography, radius, spacing, shadows, layout };
