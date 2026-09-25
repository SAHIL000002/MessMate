/**
 * MessMate - 30-meal cycle maths (frontend).
 *
 * This is the same rule the backend applies in
 * `backend/src/utils/mealStats.js#buildCycle`, kept here as a small local
 * mirror so the Home screen can show cycle numbers with the phone in
 * airplane mode. If the rule ever changes, change BOTH files.
 *
 * Breakfast and dinner are counted INDEPENDENTLY and only 'eaten' counts:
 * 'not_eaten' does not count and a missing record ("NOT RECORDED") does not
 * count either.
 *
 *   0  -> cycle 1,  0/30        30 -> cycle 2,  0/30 (cycle 1 complete)
 *   1  -> cycle 1,  1/30        31 -> cycle 2,  1/30
 *   29 -> cycle 1, 29/30        60 -> cycle 3,  0/30 (cycle 2 complete)
 *   30 -> cycle 1 COMPLETE      61 -> cycle 3,  1/30
 *
 * Records are NEVER deleted when a cycle completes. The counters simply keep
 * moving forward: 30 eaten meals stay 30 eaten meals in the history.
 */

import { addDays, daysBetween, formatShortDate, isRealDateString, todayString } from './date';

export const CYCLE_SIZE = 30;

const EATEN = 'eaten';

/** A raw count of eaten meals -> the cycle information a screen displays. */
export function buildCycle(eatenCount) {
  const totalEaten = Math.max(0, Math.floor(Number(eatenCount) || 0));

  const completedCycles = Math.floor(totalEaten / CYCLE_SIZE);
  const eatenInCurrentCycle = totalEaten % CYCLE_SIZE;

  return {
    currentCycle: completedCycles + 1,
    eatenInCurrentCycle,
    remaining: CYCLE_SIZE - eatenInCurrentCycle,
    completedCycles,
    // true on a cycle boundary, i.e. the moment a 30-meal cycle is finished
    cycleComplete: totalEaten > 0 && eatenInCurrentCycle === 0,
    cycleSize: CYCLE_SIZE,
    totalEaten,
  };
}

/** How many of these records have `field` ('breakfast' / 'dinner') eaten. */
export function countEaten(meals, field) {
  if (!Array.isArray(meals)) return 0;
  return meals.reduce((total, meal) => (meal?.[field] === EATEN ? total + 1 : total), 0);
}

/**
 * Only the records this user's tracking range covers.
 *
 *   joinDate -> today
 *
 * There is NO global start date anywhere in the app: the boundary is always
 * the signed-in member's own joinDate. A record that falls outside the range
 * (for example after the member changed their joinDate) is simply not
 * counted - it is never deleted or rewritten.
 */
export function mealsInRange(meals, { joinDate = '', today = '' } = {}) {
  const list = Array.isArray(meals) ? meals : [];
  const hasJoinDate = isRealDateString(joinDate);
  const hasToday = isRealDateString(today);

  return list.filter((meal) => {
    if (!meal || typeof meal !== 'object' || !isRealDateString(meal.date)) return false;
    if (hasJoinDate && meal.date < joinDate) return false;
    if (hasToday && meal.date > today) return false;
    return true;
  });
}

/**
 * Breakfast + dinner cycle information for one user's meal records.
 * `countedRecords` is how many records were inside the tracking range.
 *
 * `expected` carries the estimated 30-meal completion date for each meal,
 * derived from that meal's own dates - see `expectedCompletion()` below.
 */
export function buildUserStats(meals, { joinDate = '', today = '' } = {}) {
  const counted = mealsInRange(meals, { joinDate, today });

  const totalBreakfastEaten = countEaten(counted, 'breakfast');
  const totalDinnerEaten = countEaten(counted, 'dinner');

  const breakfast = buildCycle(totalBreakfastEaten);
  const dinner = buildCycle(totalDinnerEaten);

  const end = isRealDateString(today) ? today : todayString();

  return {
    breakfast,
    dinner,
    totalBreakfastEaten,
    totalDinnerEaten,
    totalEaten: totalBreakfastEaten + totalDinnerEaten,
    countedRecords: counted.length,
    expected: {
      breakfast: expectedCompletion(eatenDatesFor(counted, 'breakfast'), {
        today: end,
        cycle: breakfast,
      }),
      dinner: expectedCompletion(eatenDatesFor(counted, 'dinner'), {
        today: end,
        cycle: dinner,
      }),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Expected 30-meal completion date                                    */
/* ------------------------------------------------------------------ */

// The one message shown whenever there is not enough history to make an
// honest estimate. Chosen once, used everywhere - the app never invents a
// date it cannot justify.
export const NOT_ENOUGH_DATA = 'Not enough data';

export const EXPECTED_SOURCES = {
  /** Pace measured over the 30-meal cycle that is running right now. */
  CURRENT_CYCLE: 'current-cycle',
  /** Pace measured over the member's whole history (used on a fresh cycle). */
  HISTORY: 'history',
};

/** Every dated record for one meal, ascending, de-duplicated. */
function eatenDatesFor(meals, field) {
  const dates = [];

  for (const meal of Array.isArray(meals) ? meals : []) {
    if (!meal || typeof meal !== 'object' || !isRealDateString(meal.date)) continue;
    if (meal[field] !== EATEN) continue;
    dates.push(meal.date);
  }

  return [...new Set(dates)].sort();
}

/** Calendar days per eaten meal: `span / (how many meals span it)`. */
function paceOver(dates) {
  if (dates.length < 2) return null;

  const span = daysBetween(dates[0], dates[dates.length - 1]);
  if (span <= 0) return null;

  return span / (dates.length - 1);
}

/**
 * When should the 30-meal cycle finish, at the member's own pace?
 *
 * THE RULE, and nothing more than the rule:
 *
 *   1. the current cycle's eaten meals set the pace for a running cycle
 *   2. a cycle with 0 or 1 eaten meals cannot set a pace of its own, so the
 *      member's whole history is used instead
 *   3. if neither is available the answer is "Not enough data" - never a
 *      made-up date
 *   4. remaining meals x the pace = days from TODAY
 *
 * Breakfast and dinner are estimated from their own dates only; the two
 * numbers never share a pace and never share a date.
 *
 * @param {string[]} eatenDates  that meal's eaten dates (any order)
 * @param {object}   options     { today, cycle } - `cycle` comes from buildCycle()
 * @returns {{ date: string|null, days: number|null, pace: number|null,
 *            source: string|null, remaining: number, label: string }}
 */
export function expectedCompletion(eatenDates, { today = '', cycle = null } = {}) {
  const end = isRealDateString(today) ? today : todayString();
  const info = cycle && typeof cycle === 'object' ? cycle : buildCycle(0);

  const remaining = Math.max(0, Math.floor(Number(info.remaining) || 0));

  const dates = [...new Set((Array.isArray(eatenDates) ? eatenDates : []).filter(isRealDateString))].sort();

  const blank = { date: null, days: null, pace: null, source: null, remaining, label: NOT_ENOUGH_DATA };

  // Nothing left to eat (impossible: remaining is 30 on a boundary, never 0)
  // or nothing eaten yet -> no pace exists at all.
  if (remaining === 0 || dates.length === 0) return blank;

  // 1. A running cycle with two or more meals in it measures itself.
  const inCycle = Math.max(0, Math.floor(Number(info.eatenInCurrentCycle) || 0));

  let pace = null;
  let source = null;

  if (inCycle >= 2 && dates.length >= inCycle) {
    pace = paceOver(dates.slice(dates.length - inCycle));
    if (pace !== null) source = EXPECTED_SOURCES.CURRENT_CYCLE;
  }

  // 2. A brand new cycle (0 or 1 meals in it) borrows the overall pace.
  if (pace === null) {
    pace = paceOver(dates);
    if (pace !== null) source = EXPECTED_SOURCES.HISTORY;
  }

  // 3. Still nothing usable -> say so rather than guess.
  if (pace === null || !(pace > 0)) return blank;

  // Whole days, rounded up: the estimate is never earlier than the pace that
  // produced it. At least one day, because the cycle cannot finish before
  // tomorrow's meal.
  const days = Math.max(1, Math.ceil(remaining * pace));
  const date = addDays(end, days);

  return { date, days, pace, source, remaining, label: formatShortDate(date) };
}

/**
 * Breakfast + dinner expected completion, straight from one user's records.
 * The maths lives in `buildUserStats`; this is a convenience for a caller that
 * holds raw records and wants only the two dates.
 */
export function buildExpectedCompletion(meals, options = {}) {
  return (options.stats || buildUserStats(meals, options)).expected;
}

/** A one-line footer for a cycle card: "Expected completion: 15 Oct 2026". */
export function expectedLabel(expected, prefix = 'Expected completion') {
  if (!expected || !expected.date) return `Expected date: ${NOT_ENOUGH_DATA}`;
  return `${prefix}: ${expected.label}`;
}

export default {
  CYCLE_SIZE,
  buildCycle,
  countEaten,
  mealsInRange,
  buildUserStats,
  expectedCompletion,
  buildExpectedCompletion,
  expectedLabel,
  NOT_ENOUGH_DATA,
  EXPECTED_SOURCES,
};
