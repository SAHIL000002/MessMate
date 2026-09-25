/**
 * MessMate - HOME.
 *
 * The daily dashboard: who is signed in, today's date, today's breakfast and
 * dinner, and the two independent 30-meal cycle counters.
 *
 * OFFLINE-FIRST RULES THIS SCREEN FOLLOWS
 * ---------------------------------------
 * 1. LOCAL DATA IS THE SOURCE. Everything on screen comes from the SHARED meal
 *    state (`context/MealContext.js`), which reads this device through
 *    `services/meals.js` + `services/storage.js`. Opening Home makes no network
 *    request, so it works in airplane mode.
 * 2. A TAP LANDS IMMEDIATELY. The optimistic patch moves the shared state, so
 *    the button, the counters and the expected dates all change at once; the
 *    write to the device follows through the single `markMeal()` path.
 * 3. ONE STATE, TWO SCREENS. Home and Meals read the same object, so a change
 *    made here is already visible there - no remount, no manual refresh.
 * 4. SYNC NEVER BLOCKS. A failed sync changes nothing and is never an error.
 *
 * Dates are LOCAL YYYY-MM-DD strings from `utils/date.js`; the code builds
 * them from calendar parts and never shifts the day across timezones.
 */

import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import CycleCard, { CycleCompleteBanner } from '../components/CycleCard';
import MealStatusCard from '../components/MealStatusCard';
import MessageBanner from '../components/MessageBanner';
import MessMateLogo from '../components/MessMateLogo';
import { colors, fontFamily, radius, shadows, spacing, typography } from '../constants/theme';
import { useAuth } from '../context/AuthContext';
import { useMeals } from '../context/MealContext';
import { markMeal } from '../services/meals';
import { MEAL_STATUS, MEAL_TYPES } from '../services/storage';
import { CYCLE_SIZE } from '../utils/cycle';
import { formatDisplayDate, greetingFor, todayString, weekdayName } from '../utils/date';
import { SYNC_TONES, syncState } from '../utils/syncStatus';
import { displayName, initialsFor } from '../utils/user';

const MEALS = [MEAL_TYPES.BREAKFAST, MEAL_TYPES.DINNER];

// Plain-language helper line under each card title. No invented deadlines -
// the app has no cut-off times, so it does not claim any.
const HELPERS = {
  [MEAL_TYPES.BREAKFAST]:
    "Mark today's breakfast. Only days marked eaten count towards the 30-meal cycle.",
  [MEAL_TYPES.DINNER]:
    "Mark today's dinner. It is counted on its own, completely separately from breakfast.",
};

const CHIP_TONES = {
  [SYNC_TONES.OK]: {
    background: colors.primaryFixed,
    border: colors.primaryContainer,
    text: colors.onPrimaryFixedVariant,
  },
  [SYNC_TONES.PENDING]: {
    background: colors.secondaryFixed,
    border: colors.secondaryContainer,
    text: colors.onSecondaryFixedVariant,
  },
  [SYNC_TONES.MUTED]: {
    background: colors.surfaceContainer,
    border: colors.outlineVariant,
    text: colors.onSurfaceVariant,
  },
};

/** The quiet "All synced / Offline / 2 changes to sync" pill. */
function SyncChip({ state }) {
  const tone = CHIP_TONES[state?.tone] || CHIP_TONES[SYNC_TONES.MUTED];

  return (
    <View style={[styles.chip, { backgroundColor: tone.background, borderColor: tone.border }]}>
      <MaterialCommunityIcons name={state?.icon || 'cloud-outline'} size={13} color={tone.text} />
      <Text style={[styles.chipText, { color: tone.text }]}>{state?.label}</Text>
    </View>
  );
}

export default function HomeScreen() {
  const { user, lastSync } = useAuth();

  // The shared meal state. Home does NOT keep its own copy of today's meals or
  // of the counters - it reads the same object Meals reads, which is what makes
  // the two screens agree the instant either one is touched.
  const { summary, loading, applyOptimistic, refresh } = useMeals();

  const userId = user?.id;
  const joinDate = user?.joinDate || '';

  const [banner, setBanner] = useState(null);
  const [busy, setBusy] = useState(null); // { meal, status } while a tap is being saved

  // Read once per open, from the LOCAL clock - never from the network.
  const [openedAt] = useState(() => new Date());

  const greeting = useMemo(() => greetingFor(openedAt), [openedAt]);
  const name = displayName(user);
  const dateString = summary?.date || todayString();

  // A spinner only until the FIRST read lands. Changing a meal never shows one,
  // because the shared state already moved optimistically.
  const isReading = !summary && loading;

  /* ---------------------------------------------------------------- */
  /* Marking a meal - local first, never waiting for the server        */
  /* ---------------------------------------------------------------- */

  const handleMark = useCallback(
    async (meal, status) => {
      if (!userId || !summary || busy) return;

      setBanner(null);

      const current = summary.meal ? summary.meal[meal] : null;

      // Already in that state: nothing to write and nothing to upload.
      if (current === status) {
        setBanner({
          tone: 'info',
          message: `${String(meal).toUpperCase()} is already marked as ${
            status === MEAL_STATUS.EATEN ? 'eaten' : 'not eaten'
          } for today.`,
        });
        return;
      }

      setBusy({ meal, status });

      // 1. The SHARED state moves now: the button fills, the cycle counters and
      //    the expected completion dates recalculate, and Meals already shows
      //    the new value when the member gets there.
      applyOptimistic({ date: summary.date, meal, status });

      try {
        // 2. Writes to the device, queues the change, and uploads only if the
        //    server happens to be reachable. It does not throw when offline.
        //    storage then notifies every screen, and the device value wins.
        await markMeal({ userId, date: summary.date, meal, status, joinDate });
      } catch (error) {
        setBanner({
          tone: 'warning',
          message: 'That change could not be saved on this device. Please try again.',
        });
      } finally {
        setBusy(null);
        // The device is the truth, so undo the optimistic value if the write
        // agreed on something else (or never landed at all).
        await refresh();
      }
    },
    [applyOptimistic, busy, joinDate, refresh, summary, userId],
  );

  const chip = syncState({ pending: summary?.pending ?? 0, lastSync });

  const cycleBannerItems = MEALS.map((meal) => ({ meal, cycle: summary?.[meal] }));

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Brand row: the same lockup used by Meals, Profile and the PDF report */}
        <View style={styles.header}>
          <MessMateLogo size="md" />
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initialsFor(user)}</Text>
          </View>
        </View>

        {/* Greeting + today's date */}
        <View style={[styles.hero, shadows.card]}>
          <View style={styles.heroTop}>
            <View style={styles.heroText}>
              <Text style={styles.heroEyebrow}>{`HI, ${name.toUpperCase()}`}</Text>
              <Text style={styles.heroTitle}>{`${greeting}, ${name}`}</Text>
            </View>

            <SyncChip state={chip} />
          </View>

          <View style={styles.heroDate}>
            <Text style={styles.heroDateText}>{formatDisplayDate(dateString)}</Text>
            <Text style={styles.heroWeekday}>{weekdayName(dateString)}</Text>
          </View>
        </View>

        {/* Only real failures or a friendly heads-up ever appear here. */}
        <MessageBanner tone={banner?.tone} message={banner?.message} />

        {/* Today's meals - two independent cards */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>TODAY'S MEALS</Text>
            <Text style={styles.sectionHint}>TAP TO UPDATE</Text>
          </View>

          {isReading ? (
            <View style={styles.loading}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={styles.loadingText}>Reading your records on this device...</Text>
            </View>
          ) : (
            MEALS.map((meal) => (
              <MealStatusCard
                key={meal}
                meal={meal}
                status={summary?.meal?.[meal] ?? null}
                helper={HELPERS[meal]}
                pendingUpload={Boolean(summary?.pendingToday)}
                busyStatus={busy?.meal === meal ? busy.status : null}
                disabled={Boolean(busy)}
                onMark={(status) => handleMark(meal, status)}
              />
            ))
          )}
        </View>

        {/* The two 30-meal cycles - never combined, never reset by each other */}
        {summary ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{`${CYCLE_SIZE} MEAL COUNT`}</Text>
              <Text style={styles.sectionHint}>ACTIVE CYCLE</Text>
            </View>

            <View style={styles.cycleRow}>
              {MEALS.map((meal) => (
                <CycleCard
                  key={meal}
                  meal={meal}
                  cycle={summary[meal]}
                  expected={summary.expected?.[meal]}
                />
              ))}
            </View>

            <CycleCompleteBanner meals={cycleBannerItems} />
          </View>
        ) : null}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  avatar: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    borderWidth: 1,
    borderColor: colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.labelMd,
    fontFamily: fontFamily.bold,
    color: colors.onPrimary,
    letterSpacing: 0.5,
  },
  hero: {
    backgroundColor: colors.surfaceContainerLowest,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.surfaceContainerHigh,
    padding: spacing.lg - spacing.xs,
    gap: spacing.md,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  heroText: {
    flexShrink: 1,
    gap: spacing.xs / 2,
  },
  heroEyebrow: {
    ...typography.labelSm,
    fontFamily: fontFamily.semibold,
    color: colors.onSurfaceVariant,
    letterSpacing: 0.8,
  },
  heroTitle: {
    ...typography.headlineSm,
    fontFamily: fontFamily.bold,
    color: colors.onSurface,
  },
  heroDate: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.surfaceContainerLow,
    paddingTop: spacing.sm + 4,
  },
  heroDateText: {
    ...typography.bodyMd,
    fontFamily: fontFamily.semibold,
    color: colors.onSurface,
  },
  heroWeekday: {
    ...typography.bodySm,
    color: colors.outline,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 1,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    flexShrink: 0,
  },
  chipText: {
    ...typography.labelSm,
    fontFamily: fontFamily.semibold,
    letterSpacing: 0.3,
  },
  section: {
    gap: spacing.sm + 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  sectionTitle: {
    ...typography.labelMd,
    fontFamily: fontFamily.bold,
    color: colors.onSurfaceVariant,
    letterSpacing: 0.8,
  },
  sectionHint: {
    ...typography.labelSm,
    color: colors.outline,
    letterSpacing: 0.6,
  },
  cycleRow: {
    flexDirection: 'row',
    gap: spacing.sm + 4,
  },
  loading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceContainerLow,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  loadingText: {
    ...typography.bodySm,
    color: colors.onSurfaceVariant,
  },
});


