/**
 * MessMate - the shared card shell used by the auth screens and by the
 * temporary Phase 2 authenticated screen.
 *
 * Keeps those screens visually identical: soft mint canvas, the MESSMATE
 * brand mark, a frosted card using the emerald/gold tokens from DESIGN.md,
 * and a keyboard-safe scroll area so nothing can hide behind the keyboard.
 */

import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { colors, fontFamily, radius, shadows, spacing, typography } from '../constants/theme';

export default function AuthScaffold({ title, subtitle, tag, onBack, children }) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandRow}>
            {onBack ? (
              <Pressable
                onPress={onBack}
                hitSlop={8}
                style={styles.back}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <MaterialCommunityIcons
                  name="chevron-left"
                  size={26}
                  color={colors.primary}
                />
              </Pressable>
            ) : null}

            <View style={styles.brandTile}>
              <MaterialCommunityIcons
                name="silverware-fork-knife"
                size={20}
                color={colors.onPrimary}
              />
            </View>
            <Text style={styles.brandName}>MESSMATE</Text>
          </View>

          <View style={[styles.card, shadows.card]}>
            {tag ? (
              <View style={styles.tag}>
                <MaterialCommunityIcons
                  name="cloud-off-outline"
                  size={13}
                  color={colors.onSecondaryFixedVariant}
                />
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ) : null}

            <Text style={styles.title}>{title}</Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

            <View style={styles.divider} />

            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 4,
    minHeight: 38,
  },
  back: {
    marginLeft: -spacing.sm,
  },
  brandTile: {
    width: 38,
    height: 38,
    borderRadius: radius.base,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    ...typography.headlineSm,
    fontFamily: fontFamily.extrabold,
    color: colors.primary,
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    alignSelf: 'flex-start',
    backgroundColor: colors.secondaryFixed,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    borderRadius: radius.full,
  },
  tagText: {
    ...typography.labelSm,
    fontFamily: fontFamily.bold,
    color: colors.onSecondaryFixedVariant,
    letterSpacing: 0.6,
  },
  title: {
    ...typography.headlineMd,
    color: colors.onSurface,
    marginTop: spacing.xs,
  },
  subtitle: {
    ...typography.bodyMd,
    color: colors.onSurfaceVariant,
  },
  divider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: spacing.md,
  },
});
