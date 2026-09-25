/**
 * MessMate - the shared shell for the two not-built-yet tabs.
 *
 * PHASE 3 ONLY: Meals and Profile are placeholders while Home is the real
 * screen. They exist so the bottom navigation is complete and honest about
 * what is coming, in the same visual language as the rest of the app
 * (mint canvas, white card, emerald tile, one short sentence).
 *
 * Both placeholders are replaced by their real screens in a later phase.
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import MessMateLogo from './MessMateLogo';
import { colors, fontFamily, radius, shadows, spacing, typography } from '../constants/theme';

export default function PlaceholderScreen({ tag, title, message, icon, children }) {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <MessMateLogo size="md" />

        <View style={[styles.card, shadows.card]}>
          <View style={styles.iconTile}>
            <MaterialCommunityIcons name={icon || 'information-outline'} size={26} color={colors.primary} />
          </View>

          <Text style={styles.tag}>{tag}</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          {children ? <View style={styles.body}>{children}</View> : null}
        </View>

        <Text style={styles.footer}>MESSMATE - breakfast, dinner and the 30-meal cycle.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconTile: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  tag: {
    ...typography.labelSm,
    fontFamily: fontFamily.bold,
    color: colors.outline,
    letterSpacing: 1,
  },
  title: {
    ...typography.headlineSm,
    fontFamily: fontFamily.bold,
    color: colors.onSurface,
    letterSpacing: 0.5,
  },
  message: {
    ...typography.bodyMd,
    color: colors.onSurfaceVariant,
    textAlign: 'center',
  },
  body: {
    alignSelf: 'stretch',
    marginTop: spacing.md,
    gap: spacing.md,
  },
  footer: {
    ...typography.labelSm,
    color: colors.outline,
    textAlign: 'center',
  },
});
