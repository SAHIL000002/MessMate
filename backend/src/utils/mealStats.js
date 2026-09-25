/**
 * MessMate - meal cycle maths and date helpers.
 *
 * THE CYCLE RULE
 * --------------
 * Breakfast and dinner are counted INDEPENDENTLY, and each has its own
 * 30-meal cycle. Only 'eaten' counts. 'not_eaten' does not count, and a date
 * with no record at all ("NOT RECORDED") does not count either.
 *
 *   eaten  -> cycle 1, 0/30      (currentCycle 1, inCurrent 0, remaining 30)
 *   1      -> cycle 1, 1/30
 *   29     -> cycle 1, 29/30
 *   30     -> cycle 1 COMPLETE  (completedCycles 1, cycleComplete true)
 *   31     -> cycle 2, 1/30
 *   60     -> cycle 2 COMPLETE  (completedCycles 2)
 *   61     -> cycle 3, 1/30
 *
 * Old records are NEVER deleted when a cycle completes - the counters just
 * keep moving forward.
 */

const CYCLE_SIZE = 30;
const EATEN = 'eaten';
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function pad(value) {
  return String(value).padStart(2, '0');
}

/**
 * Today as a YYYY-MM-DD string, built from LOCAL calendar parts.
 * (Using toISOString() here would shift the day for most timezones.)
 */
function todayString(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * True only for a real calendar date in YYYY-MM-DD form.
 * Rejects wrong shapes and impossible dates such as 2026-02-31.
 */
function isRealDateString(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;

  const [year, month, day] = value.split('-').map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));

  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/**
 * Turn a raw count of eaten meals into the cycle information the app shows.
 */
function buildCycle(eatenCount) {
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

/** Count how many records have this meal marked as 'eaten'. */
function countEaten(meals, field) {
  return meals.reduce((total, meal) => (meal[field] === EATEN ? total + 1 : total), 0);
}

/** Full breakfast + dinner + totals payload for one user's meal records. */
function buildUserStats(meals) {
  const list = Array.isArray(meals) ? meals : [];

  const totalBreakfastEaten = countEaten(list, 'breakfast');
  const totalDinnerEaten = countEaten(list, 'dinner');

  return {
    breakfast: buildCycle(totalBreakfastEaten),
    dinner: buildCycle(totalDinnerEaten),
    totalBreakfastEaten,
    totalDinnerEaten,
    totalMealsEaten: totalBreakfastEaten + totalDinnerEaten,
  };
}

module.exports = {
  CYCLE_SIZE,
  buildCycle,
  buildUserStats,
  countEaten,
  isRealDateString,
  todayString,
};
