/**
 * MessMate - the Meals date stepper:  < PREV   06 September 2026   NEXT >
 *
 * Follows the Stitch Meals mockup: one rounded card, a chevron button on each
 * side, and the selected date in the middle next to a small gold calendar
 * glyph. The middle block is the date-picker trigger, so a date far in the
 * past does not have to be reached one tap at a time.
 *
 * The screen owns the rules (which dates are reachable) and passes two plain
 * booleans in. A disabled side LOOKS disabled, cannot be pressed, and is
 * announced as disabled by a screen reader.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { colors, fontFamily, layout, radius, spacing, typography } from '../constants/theme';
import { formatDisplayDate } from '../utils/date';

const CHEVRON = { prev: 'chevron-left', next: 'chevron-right' };

function StepButton({ direction, label, enabled, onPress }) {
  const color = enabled ? colors.primary : colors.outlineVariant;

  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      accessibilityRole="button"
      accessibilityLabel={direction === 'prev' ? 'Previous day' : 'Next day'}
      accessibilityState={{ disabled: !enabled }}
      hitSlop={layout.hitSlop}
      style={({ pressed }) => [
        styles.step,
        pressed && enabled ? styles.pressed : null,
      ]}
    >
      {direction === 'prev' ? (
        <MaterialCommunityIcons name={CHEVRON.prev} size={20} color={color} />
      ) : null}

      <Text style={[styles.stepLabel, { color }]}>{label}</Text>

      {direction === 'next' ? (
        <MaterialCommunityIcons name={CHEVRON.next} size={20} color={color} />
      ) : null}
    </Pressable>
  );
}

export default function DateNavigator({
  selectedDate,
  isToday = false,
  canGoPrevious = false,
  canGoNext = false,
  onPrevious,
  onNext,
  onOpenCalendar,
}) {
  return (
    <View style={styles.card}>
      <StepButton direction="prev" label="PREV" enabled={canGoPrevious} onPress={onPrevious} />

      <Pressable
        onPress={onOpenCalendar}
        accessibilityRole="button"
        accessibilityLabel={`Choose a date, currently ${formatDisplayDate(selectedDate)}${
          isToday ? ', today' : ''
        }`}
        accessibilityHint="Opens the calendar"
        style={({ pressed }) => [styles.selected, pressed ? styles.pressed : null]}
      >
        <MaterialCommunityIcons name="calendar-month-outline" size={18} color={colors.secondary} />
        <Text style={styles.selectedLabel} numberOfLines={1}>
          {formatDisplayDate(selectedDate)}
        </Text>

        {isToday ? (
          <View style={styles.todayPill}>
            <Text style={styles.todayPillLabel}>TODAY</Text>
          </View>
        ) : null}
      </Pressable>

      <StepButton direction="next" label="NEXT" enabled={canGoNext} onPress={onNext} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
    backgroundColor: colors.surfaceContainer,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.sm,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.base,
  },
  stepLabel: {
    ...typography.labelSm,
    fontFamily: fontFamily.bold,
    letterSpacing: 0.6,
  },
  selected: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radius.base,
  },
  selectedLabel: {
    ...typography.bodyLg,
    fontFamily: fontFamily.semibold,
    color: colors.onSurface,
    flexShrink: 1,
  },
  // A small gold tag so "am I editing today?" never has to be guessed.
  todayPill: {
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 1,
    borderRadius: radius.full,
    backgroundColor: colors.secondaryContainer,
  },
  todayPillLabel: {
    ...typography.labelSm,
    fontFamily: fontFamily.bold,
    fontSize: 10,
    color: colors.onSecondaryContainer,
  },
  pressed: {
    opacity: 0.75,
  },
});
