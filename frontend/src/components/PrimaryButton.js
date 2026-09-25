/**
 * MessMate - the one button used across the auth screens and the temporary
 * authenticated screen.
 *
 * Variants come straight from DESIGN.md's component rules: solid Emerald for
 * the primary action, gold for accent, a ghost outline for secondary, and
 * the error container for destructive actions such as LOGOUT.
 */

import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { colors, fontFamily, radius, spacing, typography } from '../constants/theme';

const VARIANTS = {
  primary: {
    background: colors.primaryContainer,
    border: colors.primaryContainer,
    text: colors.onPrimary,
  },
  gold: {
    background: colors.secondaryContainer,
    border: colors.secondaryContainer,
    text: colors.onSecondary,
  },
  ghost: {
    background: colors.surfaceContainerLowest,
    border: colors.outlineVariant,
    text: colors.primary,
  },
  danger: {
    background: colors.errorContainer,
    border: colors.error,
    text: colors.onErrorContainer,
  },
};

export default function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  icon,
  variant = 'primary',
}) {
  const palette = VARIANTS[variant] || VARIANTS.primary;
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: palette.background, borderColor: palette.border },
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={palette.text} />
      ) : icon ? (
        <MaterialCommunityIcons name={icon} size={18} color={palette.text} />
      ) : null}

      <Text style={[styles.label, { color: palette.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    minHeight: 52,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  pressed: {
    opacity: 0.88,
  },
  disabled: {
    opacity: 0.55,
  },
  label: {
    ...typography.labelMd,
    fontFamily: fontFamily.bold,
    letterSpacing: 1,
  },
});
