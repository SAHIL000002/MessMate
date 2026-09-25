/**
 * MessMate - the "When did you join the mess?" date field.
 *
 * Sends a plain `YYYY-MM-DD` string out of `onChange`. The picker itself
 * behaves the way each platform expects: a dialog on Android, an inline
 * spinner with a DONE button on iOS.
 */

import { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { colors, fontFamily, layout, radius, spacing, typography } from '../constants/theme';
import { formatDisplayDate, toDateObject, toDateString } from '../utils/date';

export default function JoinDateField({
  value,
  onChange,
  error,
  helper,
  maximumDate = new Date(),
  minimumDate,
}) {
  const [androidOpen, setAndroidOpen] = useState(false);
  const [iosOpen, setIosOpen] = useState(false);

  const pickerValue = toDateObject(value);

  /* @react-native-community/datetimepicker v9.1.0 deprecated the combined
     `onChange` callback (it printed a console warning). The same behaviour is
     rebuilt from the three precise callbacks it recommends:
       - onValueChange       -> a day was actually picked
       - onDismiss           -> the Android dialog was cancelled
       - onNeutralButtonPress-> Android's neutral button (none is configured) */
  function handleValueChange(_event, selected) {
    if (selected) onChange(toDateString(selected));
    // The Android dialog must close whichever callback fired.
    if (Platform.OS === 'android') setAndroidOpen(false);
  }

  function handleDismiss() {
    // Cancelled (back button / outside tap / negative button) or neutral
    // pressed: close the dialog and keep the previously stored join date.
    if (Platform.OS === 'android') setAndroidOpen(false);
  }

  function openPicker() {
    if (Platform.OS === 'ios') {
      setIosOpen((previous) => !previous);
      return;
    }
    setAndroidOpen(true);
  }

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>When did you join the mess?</Text>

      <Pressable
        onPress={openPicker}
        accessibilityRole="button"
        accessibilityLabel="Choose the date you joined the mess"
        style={[styles.field, iosOpen && styles.fieldOpen, error && styles.fieldError]}
      >
        <View style={styles.iconTile}>
          <MaterialCommunityIcons
            name="calendar-month-outline"
            size={18}
            color={colors.primary}
          />
        </View>

        <Text style={styles.value}>{formatDisplayDate(value) || 'Choose a date'}</Text>

        <MaterialCommunityIcons
          name={iosOpen ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.onSurfaceVariant}
        />
      </Pressable>

      {Platform.OS === 'ios' && iosOpen ? (
        <View style={styles.pickerCard}>
          <DateTimePicker
            value={pickerValue}
            mode="date"
            display="spinner"
            maximumDate={maximumDate}
            minimumDate={minimumDate}
            themeVariant="light"
            onValueChange={handleValueChange}
          />
          <Pressable
            onPress={() => setIosOpen(false)}
            style={styles.done}
            accessibilityRole="button"
          >
            <Text style={styles.doneText}>DONE</Text>
          </Pressable>
        </View>
      ) : null}

      {Platform.OS === 'android' && androidOpen ? (
        <DateTimePicker
          value={pickerValue}
          mode="date"
          display="calendar"
          maximumDate={maximumDate}
          minimumDate={minimumDate}
          onValueChange={handleValueChange}
          onDismiss={handleDismiss}
          onNeutralButtonPress={handleDismiss}
        />
      ) : null}

      {error ? (
        <Text style={styles.error}>{error}</Text>
      ) : helper ? (
        <Text style={styles.helper}>{helper}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: spacing.sm,
  },
  label: {
    ...typography.bodyMd,
    fontFamily: fontFamily.semibold,
    color: colors.onSurfaceVariant,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: layout.minTouchSize + 8,
    paddingHorizontal: spacing.sm + 4,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.outlineVariant,
    backgroundColor: colors.surfaceContainerLow,
  },
  fieldOpen: {
    borderColor: colors.primaryContainer,
    backgroundColor: colors.surfaceContainerLowest,
  },
  fieldError: {
    borderColor: colors.error,
    backgroundColor: colors.surfaceContainerLowest,
  },
  iconTile: {
    width: 34,
    height: 34,
    borderRadius: radius.base,
    backgroundColor: colors.surfaceContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    flex: 1,
    ...typography.bodyLg,
    fontFamily: fontFamily.semibold,
    color: colors.onSurface,
  },
  pickerCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surfaceContainerLow,
    padding: spacing.sm,
  },
  done: {
    alignSelf: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  doneText: {
    ...typography.labelMd,
    fontFamily: fontFamily.bold,
    color: colors.primary,
    letterSpacing: 1,
  },
  helper: {
    ...typography.bodySm,
    color: colors.onSurfaceVariant,
  },
  error: {
    ...typography.bodySm,
    color: colors.error,
  },
});
