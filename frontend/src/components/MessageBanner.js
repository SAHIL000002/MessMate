/**
 * MessMate - inline feedback banner.
 *
 * Every screen shows failures the same way: one short sentence written for a
 * person, plus an optional retry. Technical details never reach the user.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { colors, fontFamily, radius, spacing, typography } from '../constants/theme';

const TONES = {
  error: {
    background: colors.errorContainer,
    text: colors.onErrorContainer,
    border: colors.error,
    icon: 'alert-circle-outline',
  },
  warning: {
    background: colors.secondaryFixed,
    text: colors.onSecondaryFixedVariant,
    border: colors.secondaryContainer,
    icon: 'wifi-off',
  },
  success: {
    background: colors.primaryFixed,
    text: colors.onPrimaryFixedVariant,
    border: colors.primaryContainer,
    icon: 'check-circle-outline',
  },
  info: {
    background: colors.surfaceContainer,
    text: colors.onSurfaceVariant,
    border: colors.outlineVariant,
    icon: 'information-outline',
  },
};

export default function MessageBanner({ tone = 'error', message, onRetry, retryLabel = 'TRY AGAIN' }) {
  if (!message) return null;

  const palette = TONES[tone] || TONES.error;

  return (
    <View
      style={[styles.banner, { backgroundColor: palette.background, borderColor: palette.border }]}
      accessibilityRole="alert"
    >
      <MaterialCommunityIcons name={palette.icon} size={18} color={palette.text} />

      <View style={styles.body}>
        <Text style={[styles.message, { color: palette.text }]}>{message}</Text>

        {onRetry ? (
          <Pressable onPress={onRetry} hitSlop={8} accessibilityRole="button">
            <Text style={[styles.retry, { color: palette.text }]}>{retryLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  body: {
    flex: 1,
    gap: spacing.xs,
  },
  message: {
    ...typography.bodySm,
  },
  retry: {
    ...typography.labelSm,
    fontFamily: fontFamily.bold,
    letterSpacing: 0.8,
    textDecorationLine: 'underline',
  },
});
