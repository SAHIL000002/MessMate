/**
 * MessMate - "Edit Daily Status": breakfast and dinner for ONE selected date.
 *
 * Follows the Stitch Meals mockup: a white card, a divider under the heading,
 * and one tinted row per meal with the meal name, its current status and the
 * two choices EATEN / NOT EATEN side by side.
 *
 * The two rows share NOTHING. Each one only ever reports "this meal changed to
 * this status" through `onMark(meal, status)`, so marking breakfast can never
 * touch dinner and marking dinner can never touch breakfast.
 *
 * Status colours come from `constants/mealTones.js` - the same tones Home uses
 * (EATEN emerald, NOT EATEN gold, NOT RECORDED muted - a tracked meal is never
 * shown as an alarming error).
 */

import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { colors, fontFamily, radius, shadows, spacing, typography } from '../constants/theme';
import { toneFor } from '../constants/mealTones';
import { MEAL_STATUS, MEAL_TYPES } from '../services/storage';
import { statusLabel } from '../utils/mealStatus';
import { formatShortDate } from '../utils/date';

// Straight from the mockup: a sun for breakfast, a moon for dinner.
const ROW_META = {
  [MEAL_TYPES.BREAKFAST]: { label: 'BREAKFAST', icon: 'weather-sunny', iconColor: colors.secondary },
  [MEAL_TYPES.DINNER]: { label: 'DINNER', icon: 'weather-night', iconColor: colors.tertiary },
};

// The two choices a member can make. "NOT RECORDED" is never a choice - it is
// simply what a date with no record shows.
const CHOICES = [
  { status: MEAL_STATUS.EATEN, label: 'EATEN' },
  { status: MEAL_STATUS.NOT_EATEN, label: 'NOT EATEN' },
];

function ChoiceButton({ label, selected, tone, loading, disabled, onPress }) {
  const textColor = selected ? tone.onSolid : colors.onSurfaceVariant;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled: disabled || loading, busy: loading }}
      style={({ pressed }) => [
        styles.choice,
        selected ? { backgroundColor: tone.solid, borderColor: tone.solid } : styles.choiceIdle,
        pressed && !disabled && !loading ? styles.pressed : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={textColor} />
      ) : (
        <Text style={[styles.choiceLabel, { color: textColor }]} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

function MealRow({ meal, status, busyStatus, disabled, onMark }) {
  const meta = ROW_META[meal];
  const tone = toneFor(status);
  const label = statusLabel(status);

  return (
    <View style={styles.row}>
      <View style={styles.rowInfo}>
        <View style={styles.rowTitle}>
          <MaterialCommunityIcons name={meta.icon} size={17} color={meta.iconColor} />
          <Text style={styles.rowLabel} numberOfLines={1}>
            {meta.label}
          </Text>
        </View>

        <Text
          style={[styles.rowStatus, { color: tone.text }]}
          accessibilityLabel={`${meta.label} status ${label}`}
        >
          {label}
        </Text>
      </View>

      <View style={styles.rowActions}>
        {CHOICES.map((choice) => (
          <ChoiceButton
            key={choice.status}
            label={choice.label}
            selected={status === choice.status}
            tone={toneFor(choice.status)}
            loading={busyStatus === choice.status}
            disabled={disabled}
            onPress={() => onMark?.(meal, choice.status)}
          />
        ))}
      </View>
    </View>
  );
}

export default function MealEditorCard({
  date,
  breakfast = null,
  dinner = null,
  pending = false,
  busyMeal = null,
  busyStatus = null,
  disabled = false,
  onMark,
}) {
  return (
    <View style={[styles.card, shadows.card]}>
      <View style={styles.head}>
        <Text style={styles.title}>Edit Daily Status</Text>
        <Text style={styles.headDate}>{formatShortDate(date)}</Text>
      </View>

      <MealRow
        meal={MEAL_TYPES.BREAKFAST}
        status={breakfast}
        busyStatus={busyMeal === MEAL_TYPES.BREAKFAST ? busyStatus : null}
        disabled={disabled}
        onMark={onMark}
      />
      <MealRow
        meal={MEAL_TYPES.DINNER}
        status={dinner}
        busyStatus={busyMeal === MEAL_TYPES.DINNER ? busyStatus : null}
        disabled={disabled}
        onMark={onMark}
      />

      {pending ? (
        <View style={styles.noteRow}>
          <MaterialCommunityIcons
            name="cloud-upload-outline"
            size={13}
            color={colors.onSurfaceVariant}
          />
          <Text style={styles.note}>
            Saved on this device - it uploads when you are online.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    padding: spacing.md,
    gap: spacing.sm + 2,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  title: {
    ...typography.headlineSm,
    fontFamily: fontFamily.semibold,
    color: colors.primary,
    flexShrink: 1,
  },
  headDate: {
    ...typography.labelSm,
    color: colors.outline,
    flexShrink: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.base,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm + 2,
  },
  rowInfo: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  rowLabel: {
    ...typography.labelMd,
    fontFamily: fontFamily.bold,
    color: colors.onSurface,
    letterSpacing: 0.4,
    flexShrink: 1,
  },
  rowStatus: {
    ...typography.labelSm,
    fontFamily: fontFamily.bold,
    letterSpacing: 0.6,
  },
  rowActions: {
    flexDirection: 'row',
    gap: spacing.xs + 2,
    flexShrink: 0,
  },
  choice: {
    minHeight: 32,
    minWidth: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.base,
    borderWidth: 1,
  },
  choiceIdle: {
    backgroundColor: colors.surfaceContainerHigh,
    borderColor: colors.outlineVariant,
  },
  choiceLabel: {
    ...typography.labelSm,
    fontFamily: fontFamily.bold,
    letterSpacing: 0.4,
  },
  pressed: {
    opacity: 0.85,
  },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
    paddingTop: spacing.xs / 2,
  },
  note: {
    ...typography.labelSm,
    color: colors.onSurfaceVariant,
    flexShrink: 1,
  },
});
