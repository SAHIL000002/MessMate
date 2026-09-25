/**
 * MessMate - "Meal History": every date from joinDate to today, newest first.
 *
 * Follows the Stitch Meals mockup: a section heading with the range label,
 * then a rounded table with DATE | DAY | BREAKFAST | DINNER and a small status
 * chip in each meal cell.
 *
 * The rows come from `utils/mealHistory.js`, which already makes sure that a
 * date with no record appears as NOT RECORDED. Nothing is invented for those
 * dates anywhere - this list only shows what the device (and the server) know.
 *
 * Rows are flexible (no fixed widths), so the table fits a small Android phone
 * and an iPhone without overflowing.
 */

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { colors, fontFamily, radius, shadows, spacing, typography } from '../constants/theme';
import { toneFor } from '../constants/mealTones';
import { statusLabel } from '../utils/mealStatus';
import { formatDayMonth, weekdayName, weekdayShort } from '../utils/date';

const COLUMNS = [
  { label: 'DATE', style: 'dateCell' },
  { label: 'DAY', style: 'dayCell' },
  { label: 'BREAKFAST', style: 'mealCell' },
  { label: 'DINNER', style: 'mealCell' },
];

/** One status chip. A missing status arrives here as null = NOT RECORDED. */
function StatusChip({ status }) {
  const tone = toneFor(status);

  return (
    <View style={[styles.chip, { backgroundColor: tone.solid, borderColor: tone.solid }]}>
      <Text style={[styles.chipLabel, { color: tone.onSolid }]} numberOfLines={1}>
        {statusLabel(status)}
      </Text>
    </View>
  );
}

function HistoryRow({ row, isToday, striped, first, onSelectDate }) {
  const breakfast = statusLabel(row.breakfast);
  const dinner = statusLabel(row.dinner);

  const label =
    `${formatDayMonth(row.date)}, ${weekdayName(row.date)}. ` +
    `Breakfast ${breakfast}. Dinner ${dinner}.` +
    (row.pending ? ' Waiting to upload.' : '');

  return (
    <Pressable
      onPress={onSelectDate ? () => onSelectDate(row.date) : undefined}
      disabled={!onSelectDate}
      accessibilityRole={onSelectDate ? 'button' : 'text'}
      accessibilityLabel={label}
      accessibilityHint={onSelectDate ? 'Opens this date in the editor above' : undefined}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: isToday ? colors.primaryFixedSoft : striped ? colors.surfaceContainerLow : colors.surfaceContainerLowest },
        first ? styles.rowFirst : null,
        pressed && onSelectDate ? styles.pressedRow : null,
      ]}
    >
      <View style={styles.dateCell}>
        <View style={styles.dateLine}>
          {row.pending ? (
            <MaterialCommunityIcons
              name="cloud-upload-outline"
              size={12}
              color={isToday ? colors.primary : colors.onSurfaceVariant}
              accessibilityLabel="Waiting to upload"
            />
          ) : null}
          <Text style={[styles.dateText, isToday ? styles.dateToday : null]} numberOfLines={1}>
            {formatDayMonth(row.date)}
          </Text>
        </View>
      </View>

      <View style={styles.dayCell}>
        <Text style={styles.dayText} numberOfLines={1}>
          {weekdayShort(row.date)}
        </Text>
      </View>

      <View style={styles.mealCell}>
        <StatusChip status={row.breakfast} />
      </View>

      <View style={styles.mealCell}>
        <StatusChip status={row.dinner} />
      </View>
    </Pressable>
  );
}

export default function MealHistoryList({ rows = [], rangeLabel = '', today = '', onSelectDate }) {
  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text style={styles.title}>Meal History</Text>
        <Text style={styles.range} numberOfLines={1}>
          {rangeLabel}
        </Text>
      </View>

      <View style={[styles.table, shadows.card]}>
        <View style={styles.headerRow}>
          {COLUMNS.map((column) => (
            <View key={column.label} style={styles[column.style]}>
              <Text style={styles.headerLabel} numberOfLines={1}>
                {column.label}
              </Text>
            </View>
          ))}
        </View>

        {rows.map((row, index) => (
          <HistoryRow
            key={row.date}
            row={row}
            first={index === 0}
            striped={index % 2 === 1}
            isToday={row.date === today}
            onSelectDate={onSelectDate}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.sm + 2,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: 2,
  },
  title: {
    ...typography.headlineSm,
    fontFamily: fontFamily.semibold,
    color: colors.onSurface,
    flexShrink: 1,
  },
  range: {
    ...typography.labelSm,
    color: colors.outline,
    flexShrink: 1,
    textAlign: 'right',
  },
  table: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceContainer,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.outlineVariant,
  },
  headerLabel: {
    ...typography.labelSm,
    fontFamily: fontFamily.bold,
    fontSize: 10,
    color: colors.onSurfaceVariant,
    letterSpacing: 0.4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: colors.outlineVariant,
  },
  rowFirst: {
    borderTopWidth: 0,
  },
  pressedRow: {
    opacity: 0.8,
  },
  dateCell: {
    flex: 0.85,
    paddingRight: 2,
  },
  dateLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  dateText: {
    ...typography.bodySm,
    fontFamily: fontFamily.medium,
    color: colors.onSurface,
    flexShrink: 1,
  },
  dateToday: {
    fontFamily: fontFamily.bold,
    color: colors.primary,
  },
  dayCell: {
    flex: 0.6,
    paddingRight: 2,
  },
  dayText: {
    ...typography.bodySm,
    color: colors.onSurfaceVariant,
  },
  mealCell: {
    flex: 1.3,
    paddingRight: 2,
  },
  chip: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  chipLabel: {
    ...typography.labelSm,
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 0.3,
    flexShrink: 1,
  },
});
