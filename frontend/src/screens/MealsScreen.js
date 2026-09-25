/**
 * MessMate - MEALS.
 *
 * Two jobs: pick ONE date (joinDate -> today) and mark its breakfast /
 * dinner, then show EVERY date in joinDate -> today, newest first
 * (dates with no record read as NOT RECORDED).
 *
 * OFFLINE-FIRST: local data paints the screen. The rows come from the SHARED
 * meal state (`context/MealContext.js`), which is the same state Home reads, so
 * the two screens can never disagree. `markMeal()` owns every write and
 * `syncUserData()` runs once in the background - neither can block the UI.
 * Offline is normal, and a quiet note says the change is saved on this device.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';

import DateNavigator from '../components/DateNavigator';
import MealEditorCard from '../components/MealEditorCard';
import MealHistoryList from '../components/MealHistoryList';
import MessageBanner from '../components/MessageBanner';
import MessMateLogo from '../components/MessMateLogo';
import { colors, fontFamily, radius, spacing, typography } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { useMeals } from '../context/MealContext';
import { markMeal } from '../services/meals';
import { MEAL_STATUS, MEAL_TYPES } from '../services/storage';
import { syncUserData } from '../services/sync';
import {
  addDays,
  clampDate,
  dateNavigationState,
  formatDayMonthRange,
  formatDisplayDate,
  isRealDateString,
  toDateObject,
  toDateString,
  todayString,
} from '../utils/date';

function historyFor(history, date) {
  return history.find((row) => row.date === date) || null;
}

export default function MealsScreen() {
  const { user } = useAuth();

  // The SAME meal state Home reads. Meals keeps no history of its own any
  // more, so a meal marked on either screen is already on the other one.
  const { history, ready, applyOptimistic, refresh, error: readError } = useMeals();

  const userId = user?.id || null;
  const joinDate = isRealDateString(user?.joinDate) ? user.joinDate : '';
  const today = todayString();

  // Usable range. If joinDate is somehow missing (an old session), fall
  // back to today-only instead of showing nothing.
  const minDate = joinDate || today;
  const maxDate = today;

  const [selectedDate, setSelectedDate] = useState(today);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState(null);
  const [busyMeal, setBusyMeal] = useState(null);
  const [busyStatus, setBusyStatus] = useState(null);

  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Only the FIRST read shows a spinner; after that the shared state is warm.
  const isReading = !ready;

  // A read failure from the shared state is shown in the same banner as a
  // failed write - one message, one place.
  const banner = error || readError;

  /* Keep the selection inside joinDate -> today. The range can move under us
     (midnight, a changed joinDate), and nothing outside it is ever selected. */
  useEffect(() => {
    setSelectedDate((current) => clampDate(current, { min: minDate, max: maxDate }));
  }, [minDate, maxDate]);

  /*
   * Open: the local records are already on screen (they are in the shared
   * state), then sync quietly in the background. Local data is never blocked
   * by, or replaced by, the network.
   */
  useEffect(() => {
    let cancelled = false;

    if (!userId) return undefined;

    (async () => {
      if (mounted.current) setSyncing(true);

      try {
        await syncUserData(userId);
        // The download notified the shared state, which re-read the device.
        if (!cancelled) await refresh();
      } catch (syncError) {
        // Offline is normal. Local data stays exactly as it is.
      } finally {
        if (!cancelled && mounted.current) setSyncing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refresh, userId]);

  /* Date navigation - joinDate -> today, nothing outside. */
  const nav = useMemo(
    () => dateNavigationState({ selectedDate, joinDate: minDate, today: maxDate }),
    [selectedDate, minDate, maxDate],
  );

  const goToDate = useCallback(
    (next) => {
      setError(null);
      setSelectedDate(clampDate(next, { min: minDate, max: maxDate }));
    },
    [minDate, maxDate],
  );

  const goPrevious = useCallback(() => {
    if (!nav.canGoPrevious) return;
    goToDate(addDays(selectedDate, -1));
  }, [goToDate, nav.canGoPrevious, selectedDate]);

  const goNext = useCallback(() => {
    if (!nav.canGoNext) return;
    goToDate(addDays(selectedDate, 1));
  }, [goToDate, nav.canGoNext, selectedDate]);

  /* @react-native-community/datetimepicker v9.1.0 deprecated the combined
     `onChange` callback (it printed a console warning). The same behaviour is
     rebuilt from the three precise callbacks it recommends:
       - onValueChange        -> a day was actually picked
       - onDismiss            -> the picker was cancelled
       - onNeutralButtonPress -> Android's neutral button (none is configured) */
  const onPickerValueChange = useCallback(
    (_event, picked) => {
      if (picked) goToDate(toDateString(picked));
      // Android's dialog closes itself; iOS keeps the inline picker mounted.
      if (Platform.OS === 'android') setPickerOpen(false);
    },
    [goToDate],
  );

  const onPickerDismiss = useCallback(() => {
    // Cancelled: close the picker and keep the date that is already shown.
    setPickerOpen(false);
  }, []);

  const onPickerNeutral = useCallback(() => {
    // Android neutral button (none is configured): the old onChange path
    // cleared the banner, kept the current date and closed the dialog.
    setError(null);
    if (Platform.OS === 'android') setPickerOpen(false);
  }, []);

  /* Marking a meal - one meal, one date, never the other meal. */
  const selectedRow = useMemo(() => historyFor(history, selectedDate), [history, selectedDate]);
  const breakfast = selectedRow?.breakfast || null;
  const dinner = selectedRow?.dinner || null;
  const selectedPending = Boolean(selectedRow?.pending);

  const mark = useCallback(
    async (meal, status) => {
      if (!userId) {
        setError('You are not signed in.');
        return;
      }
      if (busyMeal) return;
      if (meal !== MEAL_TYPES.BREAKFAST && meal !== MEAL_TYPES.DINNER) return;
      if (status !== MEAL_STATUS.EATEN && status !== MEAL_STATUS.NOT_EATEN) return;

      setError(null);
      setBusyMeal(meal);
      setBusyStatus(status);

      // The shared state moves NOW, so the row here and the card on Home show
      // the new status immediately - before the write has even landed.
      applyOptimistic({ date: selectedDate, meal, status });

      try {
        // markMeal() writes locally FIRST (the other meal of the day is
        // preserved inside storage), queues the change, and uploads only
        // when the server is known to be reachable. Offline never throws.
        await markMeal({ userId, date: selectedDate, meal, status, joinDate });
      } catch (markError) {
        setError(markError?.message || 'Could not save that meal. Please try again.');
      } finally {
        if (mounted.current) {
          setBusyMeal(null);
          setBusyStatus(null);
        }

        // The device is the truth: replace the optimistic value with what was
        // actually stored (the same value, unless the write was rejected).
        await refresh();
      }
    },
    [applyOptimistic, busyMeal, joinDate, refresh, selectedDate, userId],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      await refresh();
      if (userId) {
        try {
          await syncUserData(userId);
          await refresh();
        } catch (syncError) {
          // Pull-to-refresh while offline still shows fresh local data.
        }
      }
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  }, [refresh, userId]);

  const isTodaySelected = selectedDate === today;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={(
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
        )}
      >
        <MessMateLogo size="sm" />

        {/* Header, straight from the Stitch Meals mockup: "Meals" + the line
            about what the screen is for, then the MESS JOINED chip that makes
            the earliest reachable date visible instead of a hidden rule. */}
        <View style={styles.heading}>
          <Text style={styles.title}>Meals</Text>
          <Text style={styles.subtitle}>Update your breakfast and dinner for any day.</Text>

          <View style={styles.joined}>
            <MaterialCommunityIcons
              name="calendar-check-outline"
              size={16}
              color={colors.secondary}
            />

            <View style={styles.joinedText}>
              <Text style={styles.joinedLabel}>MESS JOINED</Text>
              <Text style={styles.joinedValue}>{formatDisplayDate(minDate)}</Text>
            </View>
          </View>
        </View>

        <MessageBanner tone="error" message={banner} />

        <DateNavigator
          selectedDate={selectedDate}
          isToday={isTodaySelected}
          canGoPrevious={nav.canGoPrevious}
          canGoNext={nav.canGoNext}
          onPrevious={goPrevious}
          onNext={goNext}
          onOpenCalendar={() => setPickerOpen(true)}
        />

        <MealEditorCard
          date={selectedDate}
          breakfast={breakfast}
          dinner={dinner}
          busyMeal={busyMeal}
          busyStatus={busyStatus}
          disabled={isReading || !userId}
          pending={selectedPending}
          onMark={mark}
        />

        {pickerOpen ? (
          <DateTimePicker
            value={toDateObject(selectedDate)}
            mode="date"
            display={Platform.OS === 'ios' ? 'inline' : 'calendar'}
            minimumDate={toDateObject(minDate)}
            maximumDate={toDateObject(maxDate)}
            onValueChange={onPickerValueChange}
            onDismiss={onPickerDismiss}
            onNeutralButtonPress={onPickerNeutral}
          />
        ) : null}

        <MealHistoryList
          rows={history}
          rangeLabel={formatDayMonthRange(minDate, maxDate)}
          today={maxDate}
          onSelectDate={goToDate}
        />
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
    gap: spacing.md + 2,
  },
  heading: {
    gap: spacing.xs / 2,
  },
  title: {
    ...typography.headlineLgMobile,
    fontFamily: fontFamily.bold,
    color: colors.primary,
  },
  subtitle: {
    ...typography.bodySm,
    color: colors.onSurfaceVariant,
  },
  joined: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs + 2,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.base,
    backgroundColor: colors.surfaceContainer,
    borderWidth: 1,
    borderColor: colors.outlineVariant,
  },
  joinedText: {
    gap: 1,
  },
  joinedLabel: {
    ...typography.labelSm,
    fontFamily: fontFamily.medium,
    fontSize: 9,
    color: colors.outline,
    letterSpacing: 0.6,
  },
  joinedValue: {
    ...typography.labelMd,
    fontFamily: fontFamily.semibold,
    color: colors.onSurface,
  },
});


