/**
 * MessMate - one meal card on Home (breakfast or dinner).
 *
 * Follows the Stitch Home mockup: a white card with a coloured top accent, a
 * status dot + title, the current status pill, one short helper line and the
 * two actions MARK EATEN / MARK NOT EATEN.
 *
 * Breakfast and dinner are two independent instances of this component, and
 * the card knows nothing about the other one - which is exactly why changing
 * dinner can never touch breakfast.
 *
 * Status colours:
 *   EATEN         emerald
 *   NOT EATEN     gold / neutral  (deliberately NOT red - tracking a meal is
 *                 not an error and the app must never feel alarming)
 *   NOT RECORDED  muted
 */

import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { colors, fontFamily, radius, shadows, spacing, typography } from '../constants/theme';
import { toneFor } from '../constants/mealTones';
import { MEAL_STATUS } from '../services/storage';
import { statusLabel } from '../utils/mealStatus';

// Per-meal accent, straight from the mockup: emerald for breakfast, gold for
// dinner. `onSolid` is the text colour that stays readable on that accent.
const ACCENTS = {
  breakfast: {
    bar: colors.primaryContainer,
    dot: colors.primaryContainer,
    solid: colors.primaryContainer,
    onSolid: colors.onPrimary,
    border: colors.primaryFixed,
  },
  dinner: {
    bar: colors.secondaryContainer,
    dot: colors.secondaryContainer,
    solid: colors.secondaryContainer,
    onSolid: colors.onSecondaryFixed,
    border: colors.divider,
  },
};

/*
 * The status pill colours live in `constants/mealTones.js` - shared with the
 * Meals screen, so EATEN / NOT EATEN / NOT RECORDED can never look different
 * on two screens.
 */

/**
 * MARK EATEN / MARK NOT EATEN.
 *
 * The two buttons must never look alike, or the member cannot tell which state
 * the day is in. The one matching the STORED status is filled with that
 * status's colour and carries a ticked icon; the other one stays a quiet
 * outline. When nothing is recorded for the day, BOTH stay outlines - so an
 * unrecorded day can never look like a decision that was made.
 *
 * Local to this file - it exists only inside a meal card.
 */
function OptionButton({
  label,
  icon,
  onPress,
  loading,
  disabled,
  selected = false,
  tone,
}) {
  const textColor = selected ? tone.onSolid : colors.onSurfaceVariant;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled: disabled || loading, busy: loading }}
      testID={`meal-option-${selected ? 'selected' : 'idle'}`}
      style={({ pressed }) => [
        styles.option,
        selected
          ? { backgroundColor: tone.solid, borderColor: tone.solid }
          : styles.optionGhost,
        pressed && !disabled && !loading && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <MaterialCommunityIcons name={icon} size={16} color={textColor} />
      )}

      <Text style={[styles.optionLabel, { color: textColor }]} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function MealStatusCard({
  meal,
  status,
  helper,
  pendingUpload = false,
  busyStatus = null,
  disabled = false,
  onMark,
}) {
  const palette = ACCENTS[meal] || ACCENTS.breakfast;
  const label = statusLabel(status);
  const tone = toneFor(status);

  // Only a real stored value counts as a decision. Anything else - including a
  // missing record - is NOT RECORDED, and must leave BOTH buttons unselected so
  // an empty day can never look like a choice that was made.
  const isEatenSelected = status === MEAL_STATUS.EATEN;
  const isNotEatenSelected = status === MEAL_STATUS.NOT_EATEN;
  const isRecorded = isEatenSelected || isNotEatenSelected;

  return (
    <View style={[styles.card, { borderColor: palette.border }, shadows.card]}>
      <View style={[styles.accentBar, { backgroundColor: palette.bar }]} />

      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.dot, { backgroundColor: palette.dot }]} />
          <Text style={styles.title}>{String(meal).toUpperCase()}</Text>
        </View>

        <View style={[styles.pill, { backgroundColor: tone.soft, borderColor: tone.border }]}>
          <Text style={[styles.pillText, { color: tone.text }]}>{label}</Text>
        </View>
      </View>

      <Text style={styles.helper}>{helper}</Text>

      {/* The two choices. Exactly one is filled when the day has a record for
          this meal; neither is filled when the meal is NOT RECORDED. */}
      <View style={styles.actions}>
        <OptionButton
          label="MARK EATEN"
          icon={isEatenSelected ? 'check-circle' : 'circle-outline'}
          selected={isEatenSelected}
          tone={toneFor(MEAL_STATUS.EATEN)}
          disabled={disabled}
          loading={busyStatus === MEAL_STATUS.EATEN}
          onPress={() => onMark?.(MEAL_STATUS.EATEN)}
        />
        <OptionButton
          label="MARK NOT EATEN"
          icon={isNotEatenSelected ? 'minus-circle' : 'circle-outline'}
          selected={isNotEatenSelected}
          tone={toneFor(MEAL_STATUS.NOT_EATEN)}
          disabled={disabled}
          loading={busyStatus === MEAL_STATUS.NOT_EATEN}
          onPress={() => onMark?.(MEAL_STATUS.NOT_EATEN)}
        />
      </View>

      {/* Nothing recorded yet: say so in words as well as in the pill, so
          nobody mistakes an empty day for a decision. */}
      {isRecorded ? null : (
        <View style={styles.noteRow}>
          <MaterialCommunityIcons
            name="information-outline"
            size={13}
            color={colors.onSurfaceVariant}
          />
          <Text style={styles.note}>
            Not recorded yet - tap either button to mark today.
          </Text>
        </View>
      )}

      {pendingUpload ? (
        <View style={styles.noteRow}>
          <MaterialCommunityIcons
            name="cloud-upload-outline"
            size={13}
            color={colors.onSurfaceVariant}
          />
          <Text style={styles.note}>Saved on this device - it uploads when you are online.</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    paddingTop: spacing.lg + spacing.xs,
    gap: spacing.md,
    overflow: 'hidden',
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    flexShrink: 1,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
  },
  title: {
    ...typography.bodyMd,
    fontFamily: fontFamily.bold,
    color: colors.onSurface,
    letterSpacing: 0.4,
  },
  pill: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  pillText: {
    ...typography.labelSm,
    fontFamily: fontFamily.bold,
    letterSpacing: 0.6,
  },
  helper: {
    ...typography.bodySm,
    color: colors.onSurfaceVariant,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm + 2,
  },
  option: {
    flex: 1,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs + 2,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  optionGhost: {
    backgroundColor: colors.surfaceContainerLowest,
    borderColor: colors.outlineVariant,
  },
  optionLabel: {
    ...typography.labelSm,
    fontFamily: fontFamily.bold,
    letterSpacing: 0.6,
    textAlign: 'center',
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.88,
  },
  disabled: {
    opacity: 0.55,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  note: {
    ...typography.labelSm,
    color: colors.onSurfaceVariant,
    flexShrink: 1,
  },
});
