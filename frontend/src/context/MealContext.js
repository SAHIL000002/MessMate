/**
 * MessMate - the ONE shared meal state.
 *
 * WHY THIS EXISTS
 * ---------------
 * Home and Meals must never disagree. Before this file each screen kept its own
 * copy of "today" and of the history, so a change made on one screen only
 * reached the other one on a remount. Now there is a single place that holds
 * the derived meal state, and both screens read it:
 *
 *   AsyncStorage  =  where meal records live          (services/storage.js)
 *   markMeal()    =  the ONLY way a record changes     (services/meals.js)
 *   MealProvider  =  the ONE place the state is shaped  (this file)
 *
 * THE FLOW FOR ONE TAP
 * --------------------
 *   1. the screen calls markMeal() (unchanged - one write path)
 *   2. storage writes to the device and calls notifyMealsChanged()
 *   3. this provider hears that and re-reads the device once
 *   4. Home, Meals and the cycle counters all re-render from the same data
 *
 * `applyOptimistic()` lets a screen move *instantly* on tap, and the re-read
 * that follows (milliseconds later) replaces the guess with the stored value,
 * so the device is always the truth.
 *
 * OFFLINE-FIRST: this provider only ever reads the device. It makes no network
 * request of its own; `syncNow()` and the AuthContext background sync are the
 * only things that talk to the server, and neither can break the screen.
 *
 * No Redux, no store library - one React context over the services that were
 * already there.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';

import { useAuth } from './AuthContext';
import { getMealHistory, getTodaySummary } from '../services/meals';
import { subscribeToMealChanges } from '../services/storage';
import { syncUserData } from '../services/sync';
import { buildUserStats } from '../utils/cycle';
import { isRealDateString, todayString } from '../utils/date';

const MealContext = createContext(null);

// A burst of writes (one sync can save ten days) is folded into a single
// re-read, so the device is not asked to parse the same list twenty times.
const COALESCE_MS = 40;

/**
 * Rebuild the Home summary from history rows.
 *
 * The rows already cover the whole tracking range - every date from joinDate to
 * today, with NOT RECORDED as a null status - so they carry exactly the
 * information the cycle maths needs. Drift is therefore impossible: what Home
 * shows and what Meals shows come from the same rows.
 */
function summaryFromRows(rows, previous, { date, joinDate }) {
  const stats = buildUserStats(
    rows.map((row) => ({ date: row.date, breakfast: row.breakfast, dinner: row.dinner })),
    { joinDate, today: date },
  );

  return {
    date,
    meal: rows.find((row) => row.date === date) || null,
    breakfast: stats.breakfast,
    dinner: stats.dinner,
    expected: stats.expected,
    totalEaten: stats.totalEaten,
    countedRecords: stats.countedRecords,
    // These describe the queue and the device, not the maths, so they are kept.
    records: previous?.records ?? rows.length,
    pending: previous?.pending ?? 0,
    pendingItems: previous?.pendingItems ?? [],
    pendingToday: previous?.pendingToday ?? false,
  };
}

export function MealProvider({ children }) {
  const { user, lastSync } = useAuth();

  const userId = user?.id || null;
  const joinDate = isRealDateString(user?.joinDate) ? user.joinDate : '';

  const [state, setState] = useState({
    ready: false,
    loading: false,
    error: null,
    today: todayString(),
    summary: null,
    history: [],
  });

  const mounted = useRef(true);
  const readTimer = useRef(null);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      if (readTimer.current) clearTimeout(readTimer.current);
    };
  }, []);

  /* ---------------------------------------------------------------- */
  /* Read the device - the only source of truth                       */
  /* ---------------------------------------------------------------- */

  const read = useCallback(
    async ({ quiet = false } = {}) => {
      if (!userId) {
        if (mounted.current) {
          setState((previous) => ({
            ...previous,
            ready: true,
            loading: false,
            error: null,
            summary: null,
            history: [],
          }));
        }
        return;
      }

      if (!quiet && mounted.current) {
        setState((previous) => ({ ...previous, loading: true }));
      }

      const day = todayString();

      try {
        const [summary, history] = await Promise.all([
          getTodaySummary(userId, { joinDate, date: day }),
          getMealHistory(userId, { joinDate, today: day }),
        ]);

        if (!mounted.current) return;

        setState({ ready: true, loading: false, error: null, today: day, summary, history });
      } catch (error) {
        // A failed read must never take a screen down, and must never wipe
        // what is already displayed.
        if (mounted.current) {
          setState((previous) => ({
            ...previous,
            ready: true,
            loading: false,
            error: 'Could not read the meal records saved on this device.',
          }));
        }
      }
    },
    [joinDate, userId],
  );

  /** Fold a burst of write notifications into one re-read. */
  const scheduleRead = useCallback(() => {
    if (readTimer.current) clearTimeout(readTimer.current);

    readTimer.current = setTimeout(() => {
      readTimer.current = null;
      read({ quiet: true });
    }, COALESCE_MS);
  }, [read]);

  // 1. Signing in, signing out, or a changed joinDate: read again.
  useEffect(() => {
    read();
  }, [read]);

  // 2. Anything anywhere in the app changes a meal: Home, Meals and the cycle
  //    counters all hear it. This is what removes the need to remount.
  useEffect(() => subscribeToMealChanges(scheduleRead), [scheduleRead]);

  // 3. The background sync (AuthContext) reports in: pick up what it downloaded.
  useEffect(() => {
    if (lastSync) read({ quiet: true });
  }, [lastSync, read]);

  // 4. Coming back from the background - or crossing midnight - must not leave
  //    yesterday's date on screen.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') read({ quiet: true });
    });

    return () => subscription?.remove?.();
  }, [read]);

  /* ---------------------------------------------------------------- */
  /* Instant feedback, then the device's real value                   */
  /* ---------------------------------------------------------------- */

  /**
   * Move the shared state NOW, before the write lands. Only the meal the user
   * touched is changed - the other meal of that day keeps its own stored value,
   * which is what makes breakfast and dinner truly independent.
   */
  const applyOptimistic = useCallback(
    ({ date, meal, status }) => {
      if (!userId || !isRealDateString(date)) return;

      setState((previous) => {
        const rows = previous.history.map((row) =>
          row.date === date ? { ...row, [meal]: status, recorded: true, pending: true } : row,
        );

        return {
          ...previous,
          summary: summaryFromRows(rows, previous.summary, { date: previous.today, joinDate }),
          history: rows,
        };
      });
    },
    [joinDate, userId],
  );

  /* ---------------------------------------------------------------- */
  /* Sync / download - upload the queue, then pull the server's copy   */
  /* ---------------------------------------------------------------- */

  const syncNow = useCallback(async () => {
    if (!userId) {
      return { ok: false, online: false, message: 'You are not signed in.' };
    }

    try {
      // Never throws: "you are offline" comes back as a plain result.
      const result = await syncUserData(userId);
      await read({ quiet: true });
      return result;
    } catch (error) {
      // The download deleted nothing; say so plainly and re-read the device.
      await read({ quiet: true });

      return {
        ok: false,
        online: true,
        message: 'Could not reach the server. Your records on this device are safe.',
      };
    }
  }, [read, userId]);

  const refresh = useCallback(() => read({ quiet: true }), [read]);

  const value = useMemo(
    () => ({
      userId,
      joinDate,
      today: state.today,
      ready: state.ready,
      loading: state.loading,
      error: state.error,
      summary: state.summary,
      history: state.history,
      pending: state.summary?.pending ?? 0,
      pendingItems: state.summary?.pendingItems ?? [],
      applyOptimistic,
      refresh,
      syncNow,
    }),
    [
      applyOptimistic,
      joinDate,
      refresh,
      state.error,
      state.history,
      state.loading,
      state.ready,
      state.summary,
      state.today,
      syncNow,
      userId,
    ],
  );

  return <MealContext.Provider value={value}>{children}</MealContext.Provider>;
}

export function useMeals() {
  const context = useContext(MealContext);

  if (!context) {
    throw new Error('useMeals must be used inside <MealProvider>.');
  }

  return context;
}

export default MealContext;
