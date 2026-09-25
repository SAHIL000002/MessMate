/**
 * MessMate - the 30-meal cycle display on Home.
 *
 * Two components live here because they are two halves of one idea:
 *
 *   CycleCard            "BREAKFAST 12/30, CYCLE 2, 18 meals remaining"
 *   CycleCompleteBanner  shown only on a cycle boundary (30/30 eaten)
 *
 * The maths itself lives in `src/utils/cycle.js`; this file only draws it.
 * Breakfast and dinner are separate cards with separate counters - 20/30
 * breakfast next to 7/30 dinner is a perfectly normal state.
 */

import { StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { colors, fontFamily, radius, shadows, spacing, typography } from '../constants/theme';
import { CYCLE_SIZE, expectedLabel } from '../utils/cycle';

const ACCENTS = {
  breakfast: {
    label: colors.primaryContainer,
    fill: colors.primaryContainer,
    border: colors.primaryFixed,
    icon: 'weather-sunny',
  },
  dinner: {
    label: colors.onSecondaryFixedVariant,
    fill: colors.secondaryContainer,
    border: colors.divider,
    icon: 'weather-night',
  },
};

function remainingText(cycle) {
  if (cycle.cycleComplete) return `Cycle ${cycle.currentCycle - 1} complete`;

  const left = Number(cycle.remaining) || 0;
  return `${left} meal${left === 1 ? '' : 's'} remaining`;
}

export default function CycleCard({ meal, cycle, expected = null, style }) {
  const accent = ACCENTS[meal] || ACCENTS.breakfast;

  const eaten = Number(cycle?.eatenInCurrentCycle) || 0;
  const size = Number(cycle?.cycleSize) || CYCLE_SIZE;
  const percent = Math.min(100, Math.max(0, (eaten / size) * 100));

  // No history yet -> "Expected date: Not enough data". The card never invents
  // a date it cannot justify from this meal's own eaten days.
  const hasDate = Boolean(expected?.date);

  return (
    <View style={[styles.card, { borderColor: accent.border }, shadows.card, style]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, { color: accent.label }]}>{String(meal).toUpperCase()}</Text>
        <MaterialCommunityIcons name={accent.icon} size={16} color={accent.fill} />
      </View>

      <View style={styles.countRow}>
        <Text style={[styles.count, { color: accent.label }]}>{eaten}</Text>
        <Text style={styles.countTotal}>/ {size}</Text>
      </View>

      <Text style={styles.cycleLabel}>CYCLE {cycle?.currentCycle ?? 1}</Text>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${percent}%`, backgroundColor: accent.fill }]} />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>{remainingText(cycle || {})}</Text>

        <View style={styles.expectedRow}>
          <MaterialCommunityIcons
            name={hasDate ? 'calendar-check-outline' : 'calendar-question'}
            size={13}
            color={hasDate ? accent.label : colors.outline}
          />
          <Text
            style={[styles.expectedText, hasDate ? { color: colors.onSurface } : null]}
            numberOfLines={2}
          >
            {expectedLabel(expected)}
          </Text>
        </View>
      </View>
    </View>
  );
}

/**
 * Shown only when a 30-meal cycle has just been completed, exactly like the
 * banner at the bottom of the mockup:
 *
 *   "30 / 30 - CYCLE COMPLETE (next eaten meal starts cycle 2)"
 *
 * `meals` is a list of { meal, cycle } entries; an empty list renders nothing.
 * Completing a cycle changes nothing in storage - the 30 records stay exactly
 * where they are.
 */
export function CycleCompleteBanner({ meals = [], style }) {
  const completed = meals.filter((entry) => entry?.cycle?.cycleComplete);
  if (completed.length === 0) return null;

  return (
    <View style={[styles.banner, shadows.card, style]}>
      <MaterialCommunityIcons name="check-decagram" size={18} color={colors.primaryContainer} />

      <View style={styles.bannerBody}>
        {completed.map(({ meal, cycle }) => (
          <Text key={meal} style={styles.bannerText}>
            <Text style={styles.bannerStrong}>
              {String(meal).toUpperCase()} {cycle.cycleSize}/{cycle.cycleSize} - CYCLE COMPLETE
            </Text>
            {`  next eaten meal starts cycle ${cycle.currentCycle}`}
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  cardTitle: {
    ...typography.labelSm,
    fontFamily: fontFamily.bold,
    letterSpacing: 0.8,
    flexShrink: 1,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  count: {
    ...typography.headlineLgMobile,
    fontFamily: fontFamily.bold,
    lineHeight: 32,
  },
  countTotal: {
    ...typography.bodySm,
    fontFamily: fontFamily.semibold,
    color: colors.outline,
  },
  cycleLabel: {
    ...typography.labelSm,
    fontFamily: fontFamily.semibold,
    color: colors.outline,
    letterSpacing: 0.6,
  },
  track: {
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceContainerLow,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  fill: {
    height: 8,
    borderRadius: radius.full,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.surfaceContainerLow,
    marginTop: spacing.sm + 2,
    paddingTop: spacing.sm,
    gap: spacing.xs + 1,
  },
  footerText: {
    ...typography.labelSm,
    color: colors.onSurfaceVariant,
    flexShrink: 1,
  },
  expectedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs + 1,
  },
  expectedText: {
    ...typography.labelSm,
    fontFamily: fontFamily.semibold,
    color: colors.onSurfaceVariant,
    flexShrink: 1,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm + 2,
    backgroundColor: colors.surfaceContainerLow,
    borderWidth: 1,
    borderColor: colors.primaryFixed,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  bannerBody: {
    flex: 1,
    gap: spacing.xs,
  },
  bannerText: {
    ...typography.labelSm,
    color: colors.onSurfaceVariant,
  },
  bannerStrong: {
    fontFamily: fontFamily.bold,
    color: colors.onSurface,
  },
});
