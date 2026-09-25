/**
 * MessMate - the PDF meal report.
 *
 * TWO PARTS, on purpose:
 *
 *   buildReportHtml(...)   PURE: takes the local records and returns HTML.
 *                          Testable in plain Node, no device, no network.
 *   shareMealReport(...)   IMPURE: writes the HTML to a real .pdf with
 *                          expo-print and hands it to the system share sheet.
 *
 * OFFLINE: this file never touches the network. The report is built from the
 * records already on the device, so a member with no signal - and a member
 * whose changes have not uploaded yet - still gets a complete report.
 *
 * WHICH RECORDS: the rows come from the same builder the Meals screen uses
 * (`buildMealHistory`) and the totals from the same maths Home uses
 * (`buildUserStats`), so the PDF, Home, Meals and the cycle counters can never
 * quote different numbers.
 *
 * THE MASTER REPORT (Phase 8B)
 * ---------------------------
 * This is a MASTER report, not a snapshot of one day:
 *
 *   REPORT SUMMARY    report start date, report end date, total days since
 *                     joining, breakfast eaten, dinner eaten
 *   STATUS COUNTS     per meal, EATEN + NOT EATEN + NOT RECORDED = TOTAL DAYS
 *   CYCLE SUMMARIES   breakfast and dinner are INDEPENDENT: own cycle number,
 *                     own eaten/remaining, own cycle start date, own calendar
 *                     days, own last completed cycle + the date it closed, and
 *                     own completion target ("Not enough data" when the pace
 *                     cannot be measured honestly)
 *   CYCLE HISTORY     every 30-meal cycle, oldest first: started on, completed
 *                     on, calendar days, meals eaten
 *   DAILY RECORDS     one row per calendar date, joinDate -> today
 *
 * There is NO COMBINED breakfast+dinner metric anywhere in the output. The two
 * meals are never added together, never share a cycle and never share a total.
 * (Unrelated internal maths in utils/cycle.js still computes a `totalEaten`
 * for its own use; this report simply never displays or returns it.)
 *
 * Dates are LOCAL YYYY-MM-DD strings; nothing here uses toISOString().
 */

import { File } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { buildMealHistory } from '../utils/mealHistory';
import { buildUserStats, CYCLE_SIZE, NOT_ENOUGH_DATA } from '../utils/cycle';
import { displayName } from '../utils/user';
import { daysBetween, formatDisplayDate, formatShortDate, isRealDateString, todayString, weekdayName } from '../utils/date';

// Only three states exist, ever. A missing record is NOT RECORDED - the string
// 'not_recorded' is never printed.
const NOT_RECORDED = 'NOT RECORDED';

const BRAND = {
  emerald: '#005d42',
  emeraldContainer: '#047857',
  gold: '#855300',
  goldContainer: '#fea619',
  ink: '#131e19',
  muted: '#3e4943',
  line: '#bdc9c1',
  surface: '#f0fdf4',
  surfaceAlt: '#eaf7ee',
  surfaceCard: '#f7fdf9',
};

/**
 * The MessMate mark, as inline SVG.
 *
 * The app draws its logo with an icon FONT (`components/MessMateLogo.js`), and
 * a font cannot travel inside a PDF, so the same mark - emerald rounded tile,
 * white fork and knife - is drawn here with plain shapes and no path data. It
 * is generated locally: no image file, no URL, works offline.
 */
function logoSvg(size = 30) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="48" height="48" rx="12" fill="${BRAND.emeraldContainer}"/>
  <g fill="#ffffff">
    <rect x="14" y="10" width="2" height="9" rx="1"/>
    <rect x="17" y="10" width="2" height="9" rx="1"/>
    <rect x="20" y="10" width="2" height="9" rx="1"/>
    <rect x="14" y="17.5" width="8" height="3" rx="1.5"/>
    <rect x="17" y="20.5" width="2" height="17" rx="1"/>
    <rect x="26" y="10" width="5" height="12" rx="2.5"/>
    <rect x="27.5" y="21" width="2" height="16.5" rx="1"/>
  </g>
</svg>`;
}

/** `eaten` -> a coloured pill; anything else -> the muted NOT RECORDED pill. */
function statusCell(status) {
  if (status === 'eaten') return '<span class="pill eaten">EATEN</span>';
  if (status === 'not_eaten') return '<span class="pill not-eaten">NOT EATEN</span>';
  return `<span class="pill none">${NOT_RECORDED}</span>`;
}

/* ------------------------------------------------------------------ */
/* Cycle helpers - one meal at a time, never a combined figure          */
/* ------------------------------------------------------------------ */

/** Every date this meal was eaten on, ascending and de-duplicated. */
export function eatenDatesFor(field, historyRows) {
  const rows = Array.isArray(historyRows) ? historyRows : [];

  return [...new Set(rows.filter((row) => row?.[field] === 'eaten').map((row) => row.date))]
    .filter(isRealDateString)
    .sort();
}

/**
 * Every 30-meal cycle this meal has reached, oldest first.
 *
 *   { cycle, mealsEaten, complete, startedOn, completedOn, calendarDays }
 *
 * A cycle is COMPLETE only when all CYCLE_SIZE meals sit in it. `completedOn`
 * stays null while a cycle is still running, and `calendarDays` then means
 * "calendar days so far" instead of a finished length. Both ends are counted,
 * so a cycle finished on the day it started is 1 calendar day - the same
 * inclusive counting the rest of the app uses.
 *
 * A cycle is built from EATEN MEALS, not from the calendar: 30 eaten breakfasts
 * are cycle 1 whether they took 30 days or 300.
 */
export function buildCycleHistory(field, historyRows, endDate) {
  const eatenDates = eatenDatesFor(field, historyRows);
  const end = isRealDateString(endDate) ? endDate : todayString();
  const cycles = [];

  for (let index = 0; index < eatenDates.length; index += CYCLE_SIZE) {
    const block = eatenDates.slice(index, index + CYCLE_SIZE);
    const startedOn = block[0] || null;
    const complete = block.length === CYCLE_SIZE;
    const completedOn = complete ? block[block.length - 1] : null;

    cycles.push({
      cycle: index / CYCLE_SIZE + 1,
      mealsEaten: block.length,
      complete,
      startedOn,
      completedOn,
      calendarDays: startedOn ? daysBetween(startedOn, completedOn || end) + 1 : null,
    });
  }

  return cycles;
}

/**
 * EATEN / NOT EATEN / NOT RECORDED for one meal, counted from the very rows the
 * report prints.
 *
 * The three numbers add up to `total` BY CONSTRUCTION, so the printed identity
 *
 *   EATEN + NOT EATEN + NOT RECORDED = TOTAL DAYS
 *
 * cannot drift, whatever the records look like. A date is NOT RECORDED when its
 * record is missing - the fake status 'not_recorded' is never produced.
 */
export function buildStatusCounts(field, historyRows) {
  const rows = Array.isArray(historyRows) ? historyRows : [];

  let eaten = 0;
  let notEaten = 0;
  let notRecorded = 0;

  for (const row of rows) {
    if (row?.[field] === 'eaten') eaten += 1;
    else if (row?.[field] === 'not_eaten') notEaten += 1;
    else notRecorded += 1;
  }

  return { eaten, notEaten, notRecorded, total: rows.length };
}

/**
 * The cycle block for ONE meal (breakfast or dinner), from that meal's own
 * rows only. Nothing here can read the other meal's data.
 *
 * @param {string} field       'breakfast' | 'dinner'
 * @param {Array}  historyRows the report's own rows
 * @param {object} cycleInfo   buildCycle() output for that meal alone
 * @param {string} endDate     the report end date, YYYY-MM-DD
 * @param {object} expected    expectedCompletion() output for that meal alone
 */
export function getMealCycleDetails(field, historyRows, cycleInfo, endDate, expected = null) {
  const eatenDates = eatenDatesFor(field, historyRows);

  const currentCycle = cycleInfo.currentCycle;
  const eatenInCurrentCycle = cycleInfo.eatenInCurrentCycle;
  const remaining = cycleInfo.remaining;
  const completedCycles = cycleInfo.completedCycles;

  const lastCompleted = completedCycles > 0 ? `Cycle ${completedCycles}` : 'No completed cycle';

  // The 30th meal of the newest FINISHED cycle - the date that cycle closed.
  const lastCompletedDate =
    completedCycles > 0 ? eatenDates[completedCycles * CYCLE_SIZE - 1] || null : null;

  let startDate = null;
  let cycleDays = null;
  let statusMessage = '';

  if (eatenInCurrentCycle === 0) {
    statusMessage = field === 'breakfast' ? 'No breakfast cycle started' : 'No dinner cycle started';
  } else {
    const startIndex = completedCycles * CYCLE_SIZE;
    startDate = eatenDates[startIndex] || null;
    if (startDate) {
      cycleDays = daysBetween(startDate, endDate) + 1;
    }
  }

  // The honest estimate from utils/cycle.js. `label` is either a real date or
  // the fixed "Not enough data" - a made-up date is never printed.
  const target = expected && typeof expected === 'object' ? expected : {};

  return {
    field,
    currentCycle,
    eatenInCurrentCycle,
    remaining,
    cycleSize: CYCLE_SIZE,
    completedCycles,
    lastCompleted,
    lastCompletedDate,
    lastCompletedLabel: lastCompletedDate ? formatShortDate(lastCompletedDate) : null,
    startDate,
    cycleDays,
    statusMessage,
    completionTarget: target.date || null,
    completionTargetLabel: target.label || NOT_ENOUGH_DATA,
    completionDays: target.days ?? null,
    completionSource: target.source || null,
    cycleHistory: buildCycleHistory(field, historyRows, endDate),
  };
}


/** The whole report's look, in the MessMate palette. No external font, no CSS file. */
const REPORT_CSS = `
  @page { margin: 28px 24px; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: ${BRAND.ink};
    margin: 0;
    font-size: 11px;
  }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand-text { font-size: 19px; font-weight: 800; letter-spacing: 1px; color: ${BRAND.emerald}; }
  .brand-sub { font-size: 10px; color: ${BRAND.muted}; margin-top: 1px; }
  .rule { height: 3px; background: ${BRAND.emeraldContainer}; margin: 12px 0 16px; border-radius: 2px; }
  .facts { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 16px; }
  .fact {
    flex: 1 1 45%;
    border: 1px solid ${BRAND.line};
    border-radius: 8px;
    padding: 8px 10px;
    background: ${BRAND.surface};
  }
  .fact .label { font-size: 8px; letter-spacing: 0.6px; color: ${BRAND.muted}; text-transform: uppercase; }
  .fact .value { font-size: 12px; font-weight: 700; margin-top: 2px; }

  h2 { font-size: 12px; letter-spacing: 0.8px; text-transform: uppercase; color: ${BRAND.emerald}; margin: 18px 0 8px; }

  .summary-grid { display: flex; gap: 10px; margin-bottom: 16px; }
  .summary-card {
    flex: 1;
    border: 1px solid ${BRAND.line};
    border-radius: 8px;
    padding: 9px 10px;
    background: ${BRAND.surfaceCard};
    text-align: center;
  }
  .summary-card .label { font-size: 8px; letter-spacing: 0.6px; color: ${BRAND.muted}; text-transform: uppercase; }
  .summary-card .value { font-size: 17px; font-weight: 800; color: ${BRAND.emerald}; margin-top: 2px; }
  .summary-card.gold .value { color: ${BRAND.gold}; }
  .summary-card.range .value { font-size: 12px; }

  /* STATUS COUNTS - EATEN + NOT EATEN + NOT RECORDED = TOTAL DAYS */
  table.counts { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
  table.counts th { text-align: right; }
  table.counts th:first-child, table.counts td:first-child { text-align: left; }
  table.counts td { text-align: right; font-weight: 600; }
  table.counts td.meal { font-weight: 700; letter-spacing: 0.3px; }
  table.counts td.meal.breakfast { color: ${BRAND.emerald}; }
  table.counts td.meal.dinner { color: ${BRAND.gold}; }
  table.counts td.muted { color: ${BRAND.muted}; font-weight: 500; }
  table.counts td.rule-cell { border-top: 1.5px solid ${BRAND.emeraldContainer}; }
  .counts-note { font-size: 8.5px; color: ${BRAND.muted}; margin-bottom: 4px; }

  /* CYCLE HISTORY - one box per meal, full width, oldest cycle first */
  .cycle-history-box {
    border: 1px solid ${BRAND.line};
    border-radius: 8px;
    padding: 9px 12px;
    background: #ffffff;
    margin-bottom: 10px;
  }
  .cycle-history-box h3 {
    margin: 0 0 6px;
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: ${BRAND.emerald};
    border-bottom: 1.5px solid ${BRAND.emeraldContainer};
    padding-bottom: 4px;
  }
  .cycle-history-box.dinner h3 { color: ${BRAND.gold}; border-bottom-color: ${BRAND.goldContainer}; }
  table.history { width: 100%; border-collapse: collapse; }
  table.history th { font-size: 7.5px; padding: 4px 5px; }
  table.history td { font-size: 9px; padding: 3px 5px; border-bottom: 0.5px solid #edf2ef; }
  table.history td.num { text-align: right; }
  table.history td.cycle-name { font-weight: 700; white-space: nowrap; }
  .in-progress { color: ${BRAND.gold}; font-style: italic; }
  .closed { color: ${BRAND.emerald}; font-weight: 600; }

  .cycles-container { display: flex; gap: 12px; margin-bottom: 16px; }
  .cycle-box {
    flex: 1;
    border: 1px solid ${BRAND.line};
    border-radius: 8px;
    padding: 10px 12px;
    background: #ffffff;
  }
  .cycle-box h3 {
    margin: 0 0 8px;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: ${BRAND.emerald};
    border-bottom: 1.5px solid ${BRAND.emeraldContainer};
    padding-bottom: 4px;
  }
  .cycle-box.dinner h3 {
    color: ${BRAND.gold};
    border-bottom-color: ${BRAND.goldContainer};
  }
  .cycle-row { display: flex; justify-content: space-between; padding: 3px 0; border-bottom: 0.5px solid #edf2ef; }
  .cycle-row .c-label { color: ${BRAND.muted}; font-size: 9px; }
  .cycle-row .c-val { font-weight: 700; font-size: 9.5px; }
  .cycle-empty { color: ${BRAND.muted}; font-style: italic; font-size: 9.5px; padding: 4px 0; }

  table { width: 100%; border-collapse: collapse; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th {
    text-align: left;
    font-size: 8px;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    color: ${BRAND.muted};
    border-bottom: 1.5px solid ${BRAND.emeraldContainer};
    padding: 5px 6px;
  }
  td { padding: 5px 6px; border-bottom: 0.5px solid ${BRAND.line}; vertical-align: middle; }
  tr:nth-child(even) td { background: ${BRAND.surfaceAlt}; }
  .date { white-space: nowrap; font-weight: 600; }
  .day { color: ${BRAND.muted}; }
  .pill {
    display: inline-block;
    padding: 2px 7px;
    border-radius: 10px;
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 0.4px;
    white-space: nowrap;
  }
  .eaten { background: #97f5cc; color: #00513a; }
  .not-eaten { background: #ffddb8; color: #653e00; }
  .none { background: #e4f1e8; color: ${BRAND.muted}; }
  .totals { display: flex; gap: 10px; margin-top: 16px; }
  .total {
    flex: 1;
    border: 1px solid ${BRAND.line};
    border-radius: 8px;
    padding: 9px 10px;
    text-align: center;
  }
  .total .label { font-size: 8px; letter-spacing: 0.6px; color: ${BRAND.muted}; text-transform: uppercase; }
  .total .value { font-size: 17px; font-weight: 800; color: ${BRAND.emerald}; margin-top: 2px; }
  .total.gold .value { color: ${BRAND.gold}; }
  .note { margin-top: 14px; font-size: 9px; color: ${BRAND.muted}; }
  .footer { margin-top: 18px; border-top: 1px solid ${BRAND.line}; padding-top: 8px; font-size: 8.5px; color: ${BRAND.muted}; }
`;

/* ------------------------------------------------------------------ */
/* HTML fragments - one meal at a time                                 */
/* ------------------------------------------------------------------ */

/** `12` -> `12/30`. One place, so the cycle size can never drift. */
function mealsFraction(eaten) {
  return `${eaten}/${CYCLE_SIZE}`;
}

/**
 * The cycle summary box for ONE meal.
 *
 * Everything printed here comes from that meal's own rows and its own
 * completion estimate. There is no combined row and no combined card anywhere.
 */
function cycleBoxHtml(details) {
  const rows = [];

  if (details.statusMessage) {
    rows.push(
      `<div class="cycle-row"><span class="c-label">Current Cycle</span><span class="c-val">${details.currentCycle}</span></div>`,
      `<div class="cycle-row"><span class="c-label">Cycle Eaten</span><span class="c-val">${mealsFraction(0)}</span></div>`,
      `<div class="cycle-row"><span class="c-label">Meals Remaining</span><span class="c-val">${details.remaining}</span></div>`,
    );
  } else {
    rows.push(
      `<div class="cycle-row"><span class="c-label">Current Cycle</span><span class="c-val">${details.currentCycle} (${mealsFraction(
        details.eatenInCurrentCycle,
      )})</span></div>`,
      `<div class="cycle-row"><span class="c-label">Cycle Eaten</span><span class="c-val">${mealsFraction(
        details.eatenInCurrentCycle,
      )}</span></div>`,
      `<div class="cycle-row"><span class="c-label">Meals Remaining</span><span class="c-val">${details.remaining}</span></div>`,
      `<div class="cycle-row"><span class="c-label">Cycle Start Date</span><span class="c-val">${
        details.startDate ? formatShortDate(details.startDate) : '-'
      }</span></div>`,
      `<div class="cycle-row"><span class="c-label">Calendar Days In Cycle</span><span class="c-val">${
        details.cycleDays === null ? '-' : details.cycleDays
      }</span></div>`,
    );
  }

  rows.push(
    `<div class="cycle-row"><span class="c-label">Cycles Completed</span><span class="c-val">${details.completedCycles}</span></div>`,
    `<div class="cycle-row"><span class="c-label">Last Completed</span><span class="c-val">${details.lastCompleted}${
      details.lastCompletedLabel ? ` - ${details.lastCompletedLabel}` : ''
    }</span></div>`,
    `<div class="cycle-row"><span class="c-label">Completion Target</span><span class="c-val">${details.completionTargetLabel}</span></div>`,
  );

  if (details.statusMessage) rows.push(`<div class="cycle-empty">${details.statusMessage}</div>`);

  return rows.join('\n       ');
}

/**
 * The cycle-history box for ONE meal: every 30-meal cycle, oldest first, with
 * the date it started, the date it closed, how many calendar days that took and
 * how many meals sit in it. An unfinished cycle reads "In progress".
 */
function cycleHistoryHtml(details, label) {
  if (details.cycleHistory.length === 0) {
    return `<div class="cycle-empty">No ${label.toLowerCase()} cycle has started yet.</div>`;
  }

  const rows = details.cycleHistory
    .map(
      (cycle) => `<tr>
        <td class="cycle-name">Cycle ${cycle.cycle}</td>
        <td>${cycle.startedOn ? formatShortDate(cycle.startedOn) : '-'}</td>
        <td>${
          cycle.completedOn
            ? `<span class="closed">${formatShortDate(cycle.completedOn)}</span>`
            : '<span class="in-progress">In progress</span>'
        }</td>
        <td class="num">${cycle.calendarDays === null ? '-' : cycle.calendarDays}</td>
        <td class="num">${mealsFraction(cycle.mealsEaten)}</td>
      </tr>`,
    )
    .join('\n      ');

  return `<table class="history">
      <thead>
        <tr><th>Cycle</th><th>Started On</th><th>Completed On</th><th>Calendar Days</th><th>Meals</th></tr>
      </thead>
      <tbody>
      ${rows}
      </tbody>
    </table>`;
}

/**
 * EATEN / NOT EATEN / NOT RECORDED / TOTAL DAYS for both meals.
 *
 * Two rows, two independent sets of numbers. There is deliberately no "both
 * meals" row: the two are never added together.
 */
function statusCountsHtml(breakfastCounts, dinnerCounts) {
  const row = (label, key, counts) => `<tr>
        <td class="meal ${key}">${label}</td>
        <td>${counts.eaten}</td>
        <td>${counts.notEaten}</td>
        <td class="muted">${counts.notRecorded}</td>
        <td>${counts.total}</td>
      </tr>`;

  return `<table class="counts">
      <thead>
        <tr><th>Meal</th><th>Eaten</th><th>Not Eaten</th><th>Not Recorded</th><th>Total Days</th></tr>
      </thead>
      <tbody>
      ${row('BREAKFAST', 'breakfast', breakfastCounts)}
      ${row('DINNER', 'dinner', dinnerCounts)}
      </tbody>
    </table>`;
}

/**
 * Build the complete report as HTML.
 *
 * @param {object} options
 * @param {object} options.user     the signed-in session (username, email, joinDate)
 * @param {Array}  options.meals    the local meal records
 * @param {Array}  options.pending  dates still waiting to upload (optional)
 * @param {string} options.today    report end date, YYYY-MM-DD (optional)
 * @param {Array}  options.rows     pre-built history rows (optional; built here otherwise)
 * @returns {{
 *   html: string,
 *   rows: Array,
 *   totals: { breakfast: number, dinner: number },
 *   joinDate: string,
 *   endDate: string,
 *   summary: {
 *     reportStart: string, reportEnd: string, totalDays: number, daysListed: number,
 *     totalBreakfastEaten: number, totalDinnerEaten: number,
 *     breakfastCycle: object, dinnerCycle: object,
 *     status: { breakfast: object, dinner: object },
 *     cycleHistory: { breakfast: Array, dinner: Array },
 *   },
 * }}
 * There is deliberately NO combined breakfast+dinner figure in the result.
 */
export function buildReportHtml({ user = {}, meals = [], pending = [], today = '', rows = null } = {}) {
  const endDate = isRealDateString(today) ? today : todayString();
  const joinDate = isRealDateString(user?.joinDate) ? user.joinDate : endDate;

  // The SAME builder the Meals screen uses: every date from joinDate -> today
  // gets a row, and a date with no record reads as NOT RECORDED. When the
  // caller already holds those rows (the app hands over the very rows the Meals
  // table renders) they are used as they are, so the PDF can never disagree
  // with the screen.
  const historyRows = Array.isArray(rows)
    ? rows
    : buildMealHistory(meals, { joinDate, today: endDate, pending });

  // The SAME maths Home uses - fed with THIS range's rows, exactly as
  // `summaryFromRows` in context/MealContext.js does. Counting the generated
  // range (and not a bag of records from somewhere else) is what makes the
  // summary and the daily table below it add up to the same thing.
  const stats = buildUserStats(
    historyRows.map((row) => ({ date: row.date, breakfast: row.breakfast, dinner: row.dinner })),
    { joinDate, today: endDate },
  );

  const name = displayName(user);
  const email = user?.email || '';
  const generatedOn = formatDisplayDate(endDate);
  const unSynced = Array.isArray(pending) ? pending.length : 0;

  // Total calendar days from joinDate through today, inclusive.
  const totalDays = Math.max(1, daysBetween(joinDate, endDate) + 1);

  // Breakfast and dinner, each from its OWN rows and its OWN pace. The cycle
  // numbers, the cycle start date, the calendar days, the last completed cycle
  // and the completion target all belong to one meal and are never shared.
  const bCycle = getMealCycleDetails(
    'breakfast',
    historyRows,
    stats.breakfast,
    endDate,
    stats.expected?.breakfast,
  );
  const dCycle = getMealCycleDetails(
    'dinner',
    historyRows,
    stats.dinner,
    endDate,
    stats.expected?.dinner,
  );

  // EATEN + NOT EATEN + NOT RECORDED = TOTAL DAYS, per meal, by construction.
  const bCounts = buildStatusCounts('breakfast', historyRows);
  const dCounts = buildStatusCounts('dinner', historyRows);

  const bCycleHtml = cycleBoxHtml(bCycle);
  const dCycleHtml = cycleBoxHtml(dCycle);
  const bHistoryHtml = cycleHistoryHtml(bCycle, 'Breakfast');
  const dHistoryHtml = cycleHistoryHtml(dCycle, 'Dinner');

  const body = historyRows
    .map(
      (row) => `<tr>
      <td class="date">${formatShortDate(row.date)}</td>
      <td class="day">${weekdayName(row.date)}</td>
      <td>${statusCell(row.breakfast)}</td>
      <td>${statusCell(row.dinner)}</td>
    </tr>`,
    )
    .join('\n');

  const unSyncedNote =
    unSynced > 0
      ? `<br/>${unSynced} day${unSynced === 1 ? '' : 's'} in this report ${
          unSynced === 1 ? 'has' : 'have'
        } not uploaded yet - the report was built from this device.`
      : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>MessMate meal report</title>
<style>${REPORT_CSS}</style>
</head>
<body>
  <div class="brand">
    ${logoSvg(30)}
    <div>
      <div class="brand-text">MESSMATE</div>
      <div class="brand-sub">Mess meal report</div>
    </div>
  </div>
  <div class="rule"></div>

  <div class="facts">
    <div class="fact"><div class="label">Username</div><div class="value">${name}</div></div>
    <div class="fact"><div class="label">Email</div><div class="value">${email || '-'}</div></div>
    <div class="fact"><div class="label">Join Date</div><div class="value">${formatDisplayDate(joinDate)}</div></div>
    <div class="fact"><div class="label">Report End Date</div><div class="value">${generatedOn}</div></div>
  </div>

  <h2>Report Summary</h2>
  <div class="summary-grid">
    <div class="summary-card range"><div class="label">Report Start Date</div><div class="value">${formatShortDate(joinDate)}</div></div>
    <div class="summary-card range"><div class="label">Report End Date</div><div class="value">${formatShortDate(endDate)}</div></div>
    <div class="summary-card"><div class="label">Total Days Since Joining</div><div class="value">${totalDays}</div></div>
  </div>
  <div class="summary-grid">
    <div class="summary-card"><div class="label">Total Breakfast Eaten</div><div class="value">${stats.totalBreakfastEaten}</div></div>
    <div class="summary-card gold"><div class="label">Total Dinner Eaten</div><div class="value">${stats.totalDinnerEaten}</div></div>
  </div>

  <h2>Status Counts</h2>
  <div class="counts-note">
    Every date from ${formatShortDate(joinDate)} to ${formatShortDate(endDate)} sits in exactly one column,
    for each meal on its own: Eaten + Not Eaten + Not Recorded = Total Days.
  </div>
  ${statusCountsHtml(bCounts, dCounts)}

  <h2>Cycle Summaries</h2>
  <div class="cycles-container">
    <div class="cycle-box breakfast">
      <h3>Breakfast Cycle Summary</h3>
      ${bCycleHtml}
    </div>
    <div class="cycle-box dinner">
      <h3>Dinner Cycle Summary</h3>
      ${dCycleHtml}
    </div>
  </div>

  <h2>Cycle History</h2>
  <div class="cycle-history-box breakfast">
    <h3>Breakfast Cycle History</h3>
    ${bHistoryHtml}
  </div>
  <div class="cycle-history-box dinner">
    <h3>Dinner Cycle History</h3>
    ${dHistoryHtml}
  </div>

  <h2>Daily Meal Records</h2>
  <table>
    <thead>
      <tr><th>Date</th><th>Day</th><th>Breakfast</th><th>Dinner</th></tr>
    </thead>
    <tbody>
${body}
    </tbody>
  </table>

  <div class="totals">
    <div class="total"><div class="label">Breakfast eaten</div><div class="value">${stats.totalBreakfastEaten}</div></div>
    <div class="total gold"><div class="label">Dinner eaten</div><div class="value">${stats.totalDinnerEaten}</div></div>
  </div>

  <div class="note">
    Only meals marked EATEN count towards a total; NOT EATEN and ${NOT_RECORDED} count for nothing.
    Breakfast and dinner each run their own 30-meal cycle and are counted separately - the two are never added together.${unSyncedNote}
  </div>

  <div class="footer">
    Generated by MessMate on ${generatedOn} - ${historyRows.length} day${historyRows.length === 1 ? '' : 's'} listed.
  </div>
</body>
</html>`;

  return {
    html,
    rows: historyRows,
    // Two numbers, two meals. There is no combined field - by design.
    totals: {
      breakfast: stats.totalBreakfastEaten,
      dinner: stats.totalDinnerEaten,
    },
    joinDate,
    endDate,
    summary: {
      reportStart: joinDate,
      reportEnd: endDate,
      totalDays,
      daysListed: historyRows.length,
      totalBreakfastEaten: stats.totalBreakfastEaten,
      totalDinnerEaten: stats.totalDinnerEaten,
      breakfastCycle: bCycle,
      dinnerCycle: dCycle,
      status: { breakfast: bCounts, dinner: dCounts },
      cycleHistory: { breakfast: bCycle.cycleHistory, dinner: dCycle.cycleHistory },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Generating the real PDF on the device                               */
/* ------------------------------------------------------------------ */

/** A file name a person can recognise in the share sheet or in Files. */
export function reportFileName(user, endDate) {
  const who = displayName(user, 'messmate')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return `messmate-report-${who || 'messmate'}-${endDate}.pdf`;
}

/**
 * Generate the PDF from the records already on this device and hand it to the
 * system share sheet, so the member can save it, mail it or print it.
 *
 * WORKS OFFLINE - nothing here touches the network, and any change that has not
 * uploaded yet is included because the report is built from local records.
 *
 * NEVER THROWS: every outcome is a plain result object, so the Profile screen
 * can always stop spinning. A failure says so - it never pretends the file was
 * produced.
 */
export async function shareMealReport({
  user = {},
  meals = [],
  pending = [],
  today = '',
  rows = null,
} = {}) {
  const report = buildReportHtml({ user, meals, pending, today, rows });

  // 1. expo-print renders the HTML into a real PDF in the app's cache folder.
  let uri;

  try {
    const printed = await Print.printToFileAsync({ html: report.html });
    uri = printed.uri;
  } catch (error) {
    return {
      ok: false,
      reason: 'generation',
      message: 'Could not create the PDF report on this device. Please try again.',
    };
  }

  // 2. Give it a name that means something. Renaming is a nicety - if the
  //    runtime refuses, the file is still perfectly shareable as it is.
  const fileName = reportFileName(user, report.endDate);

  try {
    // SDK 57 file API: `rename` is synchronous and updates `file.uri`.
    const file = new File(uri);
    file.rename(fileName);
    uri = file.uri;
  } catch (error) {
    // Keep the printed uri.
  }

  // 3. Hand it to the platform. Sharing is not available everywhere (an old
  //    simulator, for instance), and that is not a crash.
  try {
    const available = await Sharing.isAvailableAsync();

    if (!available) {
      return {
        ok: false,
        reason: 'unavailable',
        uri,
        fileName,
        rows: report.rows.length,
        message: `The report was created as ${fileName}, but this device has no share sheet to open it with.`,
      };
    }

    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: 'MessMate meal report',
    });

    return {
      ok: true,
      uri,
      fileName,
      rows: report.rows.length,
      totals: report.totals,
    };
  } catch (error) {
    // Dismissing the sheet lands here on some platforms. The file exists, so
    // never report a failure that did not happen.
    return {
      ok: false,
      reason: 'share',
      uri,
      fileName,
      rows: report.rows.length,
      message: 'The report was created, but it was not shared.',
    };
  }
}

export default {
  buildReportHtml,
  buildCycleHistory,
  buildStatusCounts,
  getMealCycleDetails,
  eatenDatesFor,
  reportFileName,
  shareMealReport,
};
