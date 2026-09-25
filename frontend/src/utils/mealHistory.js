/**
 * MessMate - the date-wise meal history the Meals screen renders.
 *
 * THE RULE
 * --------
 * The list ALWAYS covers the member's own tracking range, `joinDate -> today`
 * (both ends included). Every date in that window gets a row, even a date with
 * no saved record at all - a missing record is "NOT RECORDED", which the UI
 * shows as the absence of a status. No document is ever invented for it, on
 * the device or on the server.
 *
 * There is no global start date anywhere: the range starts at this member's
 * joinDate and nothing older is displayed or counted.
 *
 * Rows come back NEWEST FIRST, which is the order the Stitch Meals table uses.
 */

import { datesBetween, isRealDateString, todayString } from './date';

const EATEN = 'eaten';
const NOT_EATEN = 'not_eaten';

/**
 * Only 'eaten' / 'not_eaten' are real stored values. Anything else - a missing
 * field, a corrupt value, an unknown word - means "no decision", i.e. the UI
 * shows NOT RECORDED. The fake value 'not_recorded' is never produced here.
 */
function storedStatus(value) {
  return value === EATEN || value === NOT_EATEN ? value : null;
}

/** The local records, indexed by date, ignoring anything unusable. */
function indexByDate(meals) {
  const byDate = new Map();

  for (const meal of Array.isArray(meals) ? meals : []) {
    if (!meal || typeof meal !== 'object' || !isRealDateString(meal.date)) continue;
    byDate.set(meal.date, meal);
  }

  return byDate;
}

/**
 * Build every history row for one member.
 *
 * Returns [{ date, breakfast, dinner, recorded, pending }] newest first, where
 *   date       'YYYY-MM-DD' (local calendar date)
 *   breakfast  'eaten' | 'not_eaten' | null   (null = NOT RECORDED)
 *   dinner     'eaten' | 'not_eaten' | null   (independent of breakfast)
 *   recorded   true when a record exists for that date at all
 *   pending    true when that date has a change still waiting to upload
 */
export function buildMealHistory(meals, { joinDate = '', today = '', pending = [] } = {}) {
  const byDate = indexByDate(meals);
  const end = isRealDateString(today) ? today : todayString();

  const waiting = new Set(
    (Array.isArray(pending) ? pending : [])
      .filter((item) => item && isRealDateString(item.date))
      .map((item) => item.date),
  );

  // joinDate is the boundary. If it is somehow missing, fall back to the
  // oldest record on the device (or today) rather than showing nothing.
  const storedDates = [...byDate.keys()].filter((date) => date <= end).sort();
  const start = isRealDateString(joinDate) ? joinDate : storedDates[0] || end;

  return datesBetween(start, end, { newestFirst: true }).map((date) => {
    const record = byDate.get(date) || null;

    return {
      date,
      breakfast: storedStatus(record?.breakfast),
      dinner: storedStatus(record?.dinner),
      recorded: Boolean(record),
      pending: waiting.has(date),
    };
  });
}

export default { buildMealHistory };
