/**
 * MessMate - date helpers.
 *
 * The whole app uses plain `YYYY-MM-DD` STRINGS, never Date objects, so a
 * record can never slide onto the wrong day because of a timezone. These
 * helpers mirror `backend/src/utils/mealStats.js` exactly, which is what
 * keeps local records and server records comparable.
 */

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Upper bound for `datesBetween()` - roughly 11 years of days.
const MAX_RANGE_DAYS = 4000;

function pad(value) {
  return String(value).padStart(2, "0");
}

/**
 * Today as `YYYY-MM-DD`, built from LOCAL calendar parts.
 * (`toISOString()` would shift the day for most timezones - never use it.)
 */
export function todayString(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** True only for a real calendar date in `YYYY-MM-DD` form. Rejects 2026-02-31. */
export function isRealDateString(value) {
  if (typeof value !== "string" || !DATE_PATTERN.test(value)) return false;

  const [year, month, day] = value.split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));

  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

/** A `YYYY-MM-DD` string -> a Date at LOCAL noon (safe across every timezone). */
export function toDateObject(dateString) {
  if (!isRealDateString(dateString)) return new Date();

  const [year, month, day] = dateString.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

/** A Date (e.g. from the date picker) -> a `YYYY-MM-DD` string. */
export function toDateString(date) {
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return todayString();
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}

/** `2026-09-05` -> `05 September 2026` (the format used in the designs). */
export function formatDisplayDate(dateString) {
  if (!isRealDateString(dateString)) return "";

  const [year, month, day] = dateString.split("-").map(Number);
  return `${pad(day)} ${MONTH_NAMES[month - 1]} ${year}`;
}

/** True when the date is after today - used to reject future join dates. */
export function isFutureDateString(dateString) {
  if (!isRealDateString(dateString)) return false;
  return dateString > todayString();
}

/** `2026-09-23` -> `Wednesday` (used next to the date on Home). */
export function weekdayName(dateString) {
  if (!isRealDateString(dateString)) return "";

  const [year, month, day] = dateString.split("-").map(Number);
  return WEEKDAY_NAMES[new Date(year, month - 1, day, 12, 0, 0, 0).getDay()];
}

/**
 * The greeting shown on Home, from the LOCAL clock:
 *
 *   before 12:00  ->  Good morning
 *   12:00 - 16:59 ->  Good afternoon
 *   17:00 onwards ->  Good evening
 *
 * Deliberately plain - one word swap, nothing cleverer than that.
 */
export function greetingFor(now = new Date()) {
  const hour = now.getHours();

  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * The Meals date stepper rules, in one testable place.
 *
 * Only `joinDate -> today` is reachable, so Previous disables on the join date
 * and Next disables on today. Nothing here can produce a date outside that
 * window, which is what stops a future date or a pre-join date being selected.
 */
export function dateNavigationState({
  selectedDate,
  joinDate = "",
  today = "",
}) {
  const max = isRealDateString(today) ? today : todayString();
  const min = isRealDateString(joinDate) ? joinDate : "";
  const current = clampDate(selectedDate, { min, max });

  const previous = addDays(current, -1);
  const next = addDays(current, 1);

  return {
    selectedDate: current,
    canGoPrevious: Boolean(min) && current > min,
    canGoNext: current < max,
    previousDate: Boolean(min) && previous >= min ? previous : null,
    nextDate: next <= max ? next : null,
  };
}

/** `2026-09-05` -> `05 Sep` (the compact DAY + MONTH form used in history). */
export function formatDayMonth(dateString) {
  if (!isRealDateString(dateString)) return "";

  const [, month, day] = dateString.split("-").map(Number);
  return `${pad(day)} ${MONTH_SHORT[month - 1]}`;
}

/** `2026-09-06` -> `06 Sep 2026` (the compact form on the Meals editor card). */
export function formatShortDate(dateString) {
  if (!isRealDateString(dateString)) return "";

  const [year, month, day] = dateString.split("-").map(Number);
  return `${pad(day)} ${MONTH_SHORT[month - 1]} ${year}`;
}

/** `2026-09-05` -> `Sat` (the DAY column of the history table). */
export function weekdayShort(dateString) {
  if (!isRealDateString(dateString)) return "";

  const [year, month, day] = dateString.split("-").map(Number);
  return WEEKDAY_SHORT[new Date(year, month - 1, day, 12, 0, 0, 0).getDay()];
}

/** `2026-09-05` + `2026-09-23` -> `05 Sep - 23 Sep` (the history range label). */
export function formatDayMonthRange(startDate, endDate) {
  if (!isRealDateString(startDate) || !isRealDateString(endDate)) return "";
  if (startDate === endDate) return formatDayMonth(startDate);

  return `${formatDayMonth(startDate)} - ${formatDayMonth(endDate)}`;
}

/**
 * Whole calendar days from `startDate` to `endDate` (negative when `endDate`
 * is earlier). Built on UTC midnights so a DST change can never make a whole
 * day count as 0.99 of a day.
 */
export function daysBetween(startDate, endDate) {
  if (!isRealDateString(startDate) || !isRealDateString(endDate)) return 0;

  const [startYear, startMonth, startDay] = startDate.split("-").map(Number);
  const [endYear, endMonth, endDay] = endDate.split("-").map(Number);

  const from = Date.UTC(startYear, startMonth - 1, startDay);
  const to = Date.UTC(endYear, endMonth - 1, endDay);

  return Math.round((to - from) / 86400000);
}

/**
 * Move a `YYYY-MM-DD` string by whole days.
 *
 * Built on local calendar parts and re-formatted with `toDateString()`, so
 * month ends, year ends and DST can never shift the answer by a day.
 */
export function addDays(dateString, days) {
  if (!isRealDateString(dateString)) return "";

  const [year, month, day] = dateString.split("-").map(Number);
  const moved = new Date(year, month - 1, day, 12, 0, 0, 0);
  moved.setDate(moved.getDate() + (Math.trunc(Number(days)) || 0));

  return toDateString(moved);
}

/**
 * Every date from `startDate` to `endDate`, inclusive of both ends.
 * Returns `[]` for an impossible range (start after end).
 */
export function datesBetween(startDate, endDate, { newestFirst = false } = {}) {
  if (!isRealDateString(startDate) || !isRealDateString(endDate)) return [];
  if (startDate > endDate) return [];

  const dates = [];
  let cursor = startDate;

  // A sane ceiling (about 11 years) so a nonsense range cannot hang the app.
  for (let guard = 0; cursor <= endDate && guard < MAX_RANGE_DAYS; guard += 1) {
    dates.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return newestFirst ? dates.reverse() : dates;
}

/** Keep a date inside `min`..`max`. An unusable input falls back to `max`. */
export function clampDate(dateString, { min = "", max = "" } = {}) {
  if (!isRealDateString(dateString))
    return isRealDateString(max) ? max : todayString();
  if (isRealDateString(min) && dateString < min) return min;
  if (isRealDateString(max) && dateString > max) return max;

  return dateString;
}

/** True when the date sits inside `min`..`max` (both ends included). */
export function isDateInRange(dateString, { min = "", max = "" } = {}) {
  if (!isRealDateString(dateString)) return false;
  if (isRealDateString(min) && dateString < min) return false;
  if (isRealDateString(max) && dateString > max) return false;

  return true;
}

export default {
  todayString,
  isRealDateString,
  toDateObject,
  toDateString,
  formatDisplayDate,
  formatShortDate,
  formatDayMonth,
  formatDayMonthRange,
  isFutureDateString,
  weekdayName,
  weekdayShort,
  greetingFor,
  addDays,
  datesBetween,
  clampDate,
  isDateInRange,
  dateNavigationState,
};
