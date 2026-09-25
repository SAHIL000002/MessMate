/**
 * MessMate - PHASE 8B tests (MASTER PDF report, separated breakfast/dinner).
 *
 * WHAT THIS PROTECTS
 * ------------------
 * The report is now a MASTER report covering joinDate -> today, with the two
 * meals kept apart from top to bottom:
 *
 *   1. the complete date range is generated (joinDate -> today, both included)
 *   2. the REPORT SUMMARY is counted from that generated range - never from a
 *      stale total and never from a different source
 *   3. there is NO COMBINED breakfast+dinner metric anywhere: not in the HTML,
 *      not in the returned object and not in the source of report.js
 *   4. breakfast and dinner each carry their OWN cycle number, eaten count,
 *      remaining count, cycle start date, calendar days, last completed cycle
 *      AND the date that cycle closed, and their own completion target
 *   5. a completion target that cannot be measured honestly says
 *      "Not enough data" - never a made-up date
 *   6. CYCLE HISTORY lists every 30-meal cycle: started on, completed on,
 *      calendar days, meals eaten
 *   7. EATEN + NOT EATEN + NOT RECORDED = TOTAL DAYS, for each meal
 *   8. the 30-MEAL cycle rule is untouched (30 meals, not 30 calendar days)
 *   9. the whole thing works offline, with unsynced local records included,
 *      and never throws whatever it is handed
 */

'use strict';

const harness = require('./harness');

const SOURCES = [
  'src/utils/date.js',
  'src/utils/cycle.js',
  'src/utils/mealHistory.js',
  'src/utils/mealStatus.js',
  'src/utils/user.js',
  'src/services/api.js',
  'src/services/storage.js',
  'src/services/sync.js',
  'src/services/meals.js',
  'src/services/report.js',
];

const reporter = harness.createReporter('PHASE 8B TESTS');
const { check, eq, section, finish, failures } = reporter;

let app = null;

/** The cycle size is LOCKED at 30 meals - 30 meals, never 30 calendar days. */
const CYCLE_SIZE = 30;

function pad(value) {
  return String(value).padStart(2, '0');
}

/** 65 breakfasts: 30 in August, 30 in September, 5 in October. */
function meals65() {
  const meals = [];

  for (let i = 1; i <= 65; i += 1) {
    const month = i <= 30 ? '08' : i <= 60 ? '09' : '10';
    const day = ((i - 1) % 30) + 1;

    meals.push({ date: `2026-${month}-${pad(day)}`, breakfast: 'eaten' });
  }

  return meals;
}

/** One breakfast a day from 2026-08-01 for `count` days (used for 29/30/31). */
function dailyBreakfasts(count) {
  return Array.from({ length: count }, (_, index) => ({
    date: app.date.addDays('2026-08-01', index),
    breakfast: 'eaten',
  }));
}

async function main() {
  console.log('PHASE 8B FRONTEND TESTS (MASTER REPORT, SEPARATED CYCLES)');
  harness.compile(SOURCES);
  app = harness.launch(harness.createDevice(), SOURCES);

  harness.network.goOffline();
  app.sync.forgetOnlineState();

  /* ---------------------------------------------------------------- */
  section('1. Master report covers joinDate -> today, both ends included');
  /* ---------------------------------------------------------------- */

  const base = app.report.buildReportHtml({
    user: { username: 'Alice', email: 'alice@example.com', joinDate: '2026-09-01' },
    today: '2026-09-05',
    meals: [{ date: '2026-09-02', breakfast: 'eaten', dinner: 'not_eaten' }],
  });

  eq('5 day-rows generated', base.rows.length, 5);
  eq('newest row is today', base.rows[0].date, '2026-09-05');
  eq('oldest row is joinDate', base.rows[4].date, '2026-09-01');
  eq('no row before joinDate', base.rows.filter((r) => r.date < '2026-09-01').length, 0);
  eq('no row after today', base.rows.filter((r) => r.date > '2026-09-05').length, 0);

  /* ---------------------------------------------------------------- */
  section('2. Report summary: start, end, total days, per-meal totals');
  /* ---------------------------------------------------------------- */

  eq('reportStart', base.summary.reportStart, '2026-09-01');
  eq('reportEnd', base.summary.reportEnd, '2026-09-05');
  eq('totalDays inclusive', base.summary.totalDays, 5);
  eq('daysListed matches totalDays', base.summary.daysListed, base.summary.totalDays);
  eq('breakfast eaten', base.summary.totalBreakfastEaten, 1);
  eq('dinner eaten', base.summary.totalDinnerEaten, 0);
  check('start date printed', base.html.includes(app.date.formatShortDate('2026-09-01')));
  check('end date printed', base.html.includes(app.date.formatShortDate('2026-09-05')));
  check('TOTAL DAYS heading printed', base.html.includes('Total Days Since Joining'));

  section('3. Totals are counted from the generated range only');

  const outOfRange = app.report.buildReportHtml({
    user: { username: 'Alice', joinDate: '2026-09-02' },
    today: '2026-09-04',
    meals: [
      { date: '2026-09-01', breakfast: 'eaten', dinner: 'eaten' }, // BEFORE joinDate
      { date: '2026-09-03', breakfast: 'eaten', dinner: 'not_eaten' },
      { date: '2026-09-09', breakfast: 'eaten', dinner: 'eaten' }, // AFTER today
    ],
  });
  eq('range is 3 days', outOfRange.summary.totalDays, 3);
  eq('early record not counted (breakfast)', outOfRange.summary.totalBreakfastEaten, 1);
  eq('late record not counted (dinner)', outOfRange.summary.totalDinnerEaten, 0);
  eq('early record not listed', outOfRange.rows.filter((r) => r.date === '2026-09-01').length, 0);
  eq('late record not listed', outOfRange.rows.filter((r) => r.date === '2026-09-09').length, 0);

  section('4. The report built the way the app builds it (rows, no meals)');

  /* ProfileScreen hands over the very rows the Meals table renders and passes
     no `meals` at all. The summary must still be counted - it used to come out
     empty, which made the PDF disagree with the screen. */
  const sharedRows = app.mealHistory.buildMealHistory(
    [
      { date: '2026-09-01', breakfast: 'eaten', dinner: 'eaten' },
      { date: '2026-09-02', breakfast: 'not_eaten', dinner: 'eaten' },
    ],
    { joinDate: '2026-09-01', today: '2026-09-03' },
  );
  const fromRows = app.report.buildReportHtml({
    user: { username: 'Alice', joinDate: '2026-09-01' },
    today: '2026-09-03',
    rows: sharedRows,
  });
  eq('rows used as given', fromRows.rows.length, sharedRows.length);
  eq('breakfast counted from rows', fromRows.summary.totalBreakfastEaten, 1);
  eq('dinner counted from rows', fromRows.summary.totalDinnerEaten, 2);
  eq('totalDays from rows', fromRows.summary.totalDays, 3);

  /* ---------------------------------------------------------------- */
  section('5. NO combined breakfast+dinner metric anywhere');
  /* ---------------------------------------------------------------- */

  eq('totals: exactly two keys', Object.keys(base.totals).sort(), ['breakfast', 'dinner']);
  check('no totals.combined', !('combined' in base.totals));
  check('no summary.combinedEaten', !('combinedEaten' in base.summary));
  check('no summary.totalEaten', !('totalEaten' in base.summary));
  check('no summary.combined', !('combined' in base.summary));
  check('nothing combined printed', !/combined/i.test(base.html));
  check('no "both meals" wording', !/both meals/i.test(base.html));

  /* The source itself must stay free of it, so it cannot creep back in. */
  const reportSrc = harness
    .readSource('src/services/report.js')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');
  check('source: no combined metric', !/combined/i.test(reportSrc));
  check('source: no stats.totalEaten', !/totalEaten/.test(reportSrc));
  check('source: still uses the shared cycle maths', reportSrc.includes('buildUserStats'));

  /* ---------------------------------------------------------------- */
  section('6. Breakfast and dinner cycles are independent');
  /* ---------------------------------------------------------------- */

  const split = app.report.buildReportHtml({
    user: { username: 'Bea', joinDate: '2026-09-01' },
    today: '2026-09-05',
    meals: [
      { date: '2026-09-01', breakfast: 'eaten' },
      { date: '2026-09-03', breakfast: 'eaten' },
      { date: '2026-09-05', dinner: 'eaten' },
    ],
  });

  const b = split.summary.breakfastCycle;
  const d = split.summary.dinnerCycle;

  eq('B own cycle', b.currentCycle, 1);
  eq('B own eaten in cycle', b.eatenInCurrentCycle, 2);
  eq('B own remaining', b.remaining, 28);
  eq('B cycle size locked at 30', b.cycleSize, CYCLE_SIZE);
  eq('B cycles completed', b.completedCycles, 0);
  eq('B last completed', b.lastCompleted, 'No completed cycle');
  eq('B last completed date is null', b.lastCompletedDate, null);
  eq('B cycle start date', b.startDate, '2026-09-01');
  eq('B calendar days in cycle', b.cycleDays, 5); // 09-01 -> 09-05, both counted
  /* 2 breakfasts 2 days apart = 2 days per meal; 28 left => 56 days after
     2026-09-05. Fixed by the locked pace rule. */
  eq('B completion target', b.completionTarget, '2026-10-31');
  eq('B completion target label', b.completionTargetLabel, '31 Oct 2026');
  eq('B completion days', b.completionDays, 56);
  eq('B completion source', b.completionSource, 'current-cycle');

  eq('D own cycle', d.currentCycle, 1);
  eq('D own eaten in cycle', d.eatenInCurrentCycle, 1);
  eq('D own remaining', d.remaining, 29);
  eq('D cycle start date', d.startDate, '2026-09-05');
  eq('D calendar days in cycle', d.cycleDays, 1);
  eq('D last completed', d.lastCompleted, 'No completed cycle');
  /* One dinner cannot measure a pace, so the report says so instead of
     inventing a date. */
  eq('D completion target is null', d.completionTarget, null);
  eq('D completion target label', d.completionTargetLabel, 'Not enough data');
  check('B and D targets differ', b.completionTargetLabel !== d.completionTargetLabel);
  check('HTML: B summary heading', split.html.includes('Breakfast Cycle Summary'));
  check('HTML: D summary heading', split.html.includes('Dinner Cycle Summary'));
  check('HTML: Not enough data printed', split.html.includes('Not enough data'));
  check('HTML: real target printed', split.html.includes('31 Oct 2026'));

  section('7. Dinner never moves a breakfast cycle (and back)');

  const dinnerOnly = app.report.buildReportHtml({
    user: { username: 'Bea', joinDate: '2026-08-01' },
    today: '2026-09-30',
    meals: Array.from({ length: 30 }, (_, index) => ({
      date: app.date.addDays('2026-08-01', index),
      dinner: 'eaten',
    })),
  });
  eq('D reached cycle 2', dinnerOnly.summary.dinnerCycle.currentCycle, 2);
  eq('D ate 30', dinnerOnly.summary.totalDinnerEaten, 30);
  eq('D last completed is cycle 1', dinnerOnly.summary.dinnerCycle.lastCompleted, 'Cycle 1');
  eq('D last completed on its 30th dinner', dinnerOnly.summary.dinnerCycle.lastCompletedDate, '2026-08-30');
  eq('D last completed label', dinnerOnly.summary.dinnerCycle.lastCompletedLabel, '30 Aug 2026');
  eq('B untouched', dinnerOnly.summary.totalBreakfastEaten, 0);
  eq('B still cycle 1', dinnerOnly.summary.breakfastCycle.currentCycle, 1);
  eq('B status message', dinnerOnly.summary.breakfastCycle.statusMessage, 'No breakfast cycle started');
  eq('B has no cycles completed', dinnerOnly.summary.breakfastCycle.completedCycles, 0);

  /* ---------------------------------------------------------------- */
  section('8. Completion target: honest date, or "Not enough data"');
  /* ---------------------------------------------------------------- */

  const none = app.report.buildReportHtml({
    user: { username: 'Cal', joinDate: '2026-09-01' },
    today: '2026-09-10',
    meals: [],
  });
  eq('0 meals -> no date', none.summary.breakfastCycle.completionTarget, null);
  eq('0 meals -> Not enough data', none.summary.breakfastCycle.completionTargetLabel, 'Not enough data');
  eq('0 meals -> same for dinner', none.summary.dinnerCycle.completionTargetLabel, 'Not enough data');
  eq('0 meals -> no cycles completed', none.summary.breakfastCycle.completedCycles, 0);

  const one = app.report.buildReportHtml({
    user: { username: 'Cal', joinDate: '2026-09-01' },
    today: '2026-09-10',
    meals: [{ date: '2026-09-02', breakfast: 'eaten' }],
  });
  eq('1 meal -> no date', one.summary.breakfastCycle.completionTarget, null);
  eq('1 meal -> Not enough data', one.summary.breakfastCycle.completionTargetLabel, 'Not enough data');

  const two = app.report.buildReportHtml({
    user: { username: 'Cal', joinDate: '2026-09-01' },
    today: '2026-09-10',
    meals: [
      { date: '2026-09-01', breakfast: 'eaten' },
      { date: '2026-09-02', breakfast: 'eaten' },
    ],
  });
  check('2 meals -> a real date', app.date.isRealDateString(two.summary.breakfastCycle.completionTarget));
  check('2 meals -> a printed label', /2026/.test(two.summary.breakfastCycle.completionTargetLabel));
  eq('label is not the fallback', two.summary.breakfastCycle.completionTargetLabel, app.date.formatShortDate(two.summary.breakfastCycle.completionTarget));
  eq('fallback text comes from the cycle maths', app.cycle.NOT_ENOUGH_DATA, 'Not enough data');

  /* ---------------------------------------------------------------- */
  section('9. Cycle history: every 30-meal cycle, oldest first');
  /* ---------------------------------------------------------------- */

  const history65 = app.report.buildReportHtml({
    user: { username: 'Dee', joinDate: '2026-08-01' },
    today: '2026-10-10',
    meals: meals65(),
  });
  const bh = history65.summary.cycleHistory.breakfast;

  eq('65 breakfasts -> 3 cycles', bh.length, 3);
  eq('cycle 1 number', bh[0].cycle, 1);
  eq('cycle 1 meals', bh[0].mealsEaten, CYCLE_SIZE);
  eq('cycle 1 complete', bh[0].complete, true);
  eq('cycle 1 started', bh[0].startedOn, '2026-08-01');
  eq('cycle 1 completed', bh[0].completedOn, '2026-08-30');
  eq('cycle 1 calendar days', bh[0].calendarDays, 30);
  eq('cycle 2 meals', bh[1].mealsEaten, CYCLE_SIZE);
  eq('cycle 2 complete', bh[1].complete, true);
  eq('cycle 2 started', bh[1].startedOn, '2026-09-01');
  eq('cycle 2 completed', bh[1].completedOn, '2026-09-30');
  eq('cycle 2 calendar days', bh[1].calendarDays, 30);
  eq('cycle 3 meals so far', bh[2].mealsEaten, 5);
  eq('cycle 3 still running', bh[2].complete, false);
  eq('cycle 3 completed on is null', bh[2].completedOn, null);
  eq('cycle 3 started', bh[2].startedOn, '2026-10-01');
  eq('cycle 3 calendar days so far', bh[2].calendarDays, 10);
  eq('summary.cycleHistory mirrors the cycle block', history65.summary.cycleHistory.breakfast.length, bh.length);
  eq('no dinner cycles yet', history65.summary.cycleHistory.dinner.length, 0);
  check('HTML: Cycle History heading', history65.html.includes('Cycle History'));
  check('HTML: breakfast history box', history65.html.includes('Breakfast Cycle History'));
  check('HTML: dinner history box', history65.html.includes('Dinner Cycle History'));
  check('HTML: a running cycle says so', history65.html.includes('In progress'));
  check('HTML: dinner has no cycles yet', history65.html.includes('No dinner cycle has started yet.'));

  const history30 = app.report.buildReportHtml({
    user: { username: 'Dee', joinDate: '2026-08-01' },
    today: '2026-09-01',
    meals: dailyBreakfasts(CYCLE_SIZE),
  });
  eq('30 breakfasts -> exactly 1 cycle', history30.summary.cycleHistory.breakfast.length, 1);
  eq('that cycle is complete', history30.summary.cycleHistory.breakfast[0].complete, true);
  eq('30 meals in it', history30.summary.cycleHistory.breakfast[0].mealsEaten, CYCLE_SIZE);
  eq('30 calendar days for it', history30.summary.cycleHistory.breakfast[0].calendarDays, 30);
  eq('completed on the 30th day', history30.summary.cycleHistory.breakfast[0].completedOn, '2026-08-30');

  /* ---------------------------------------------------------------- */
  section('10. EATEN + NOT EATEN + NOT RECORDED = TOTAL DAYS');
  /* ---------------------------------------------------------------- */

  const counts = app.report.buildReportHtml({
    user: { username: 'Eve', joinDate: '2026-09-01' },
    today: '2026-09-06',
    meals: [
      { date: '2026-09-01', breakfast: 'eaten', dinner: 'not_eaten' },
      { date: '2026-09-02', breakfast: 'not_eaten' }, // dinner NOT RECORDED
      { date: '2026-09-03', dinner: 'eaten' }, // breakfast NOT RECORDED
    ],
  });
  eq('range is 6 days', counts.summary.totalDays, 6);
  eq('B eaten', counts.summary.status.breakfast.eaten, 1);
  eq('B not eaten', counts.summary.status.breakfast.notEaten, 1);
  eq('B not recorded', counts.summary.status.breakfast.notRecorded, 4);
  eq('B total days', counts.summary.status.breakfast.total, 6);
  eq('D eaten', counts.summary.status.dinner.eaten, 1);
  eq('D not eaten', counts.summary.status.dinner.notEaten, 1);
  eq('D not recorded', counts.summary.status.dinner.notRecorded, 4);
  eq('D total days', counts.summary.status.dinner.total, 6);
  check('HTML: Status Counts heading', counts.html.includes('Status Counts'));
  check('HTML: Not Recorded column', counts.html.includes('Not Recorded'));
  check('HTML: identity spelled out', counts.html.includes('Eaten + Not Eaten + Not Recorded = Total Days'));
  check('HTML: never the fake snake value', !counts.html.includes('not_recorded'));

  /** The identity must hold for every report, whatever the records look like. */
  function identityHolds(label, report) {
    for (const meal of ['breakfast', 'dinner']) {
      const c = report.summary.status[meal];

      check(
        `${label}: ${meal} counts add up to TOTAL DAYS`,
        c.eaten + c.notEaten + c.notRecorded === c.total && c.total === report.summary.totalDays,
        JSON.stringify(c),
      );
    }
  }

  identityHolds('mixed', counts);
  identityHolds('base', base);
  identityHolds('out of range', outOfRange);
  identityHolds('nothing recorded', none);
  identityHolds('dinner only', dinnerOnly);
  identityHolds('65 breakfasts', history65);

  /* ---------------------------------------------------------------- */
  section('11. The 30-MEAL rule is untouched (30 meals, not 30 days)');
  /* ---------------------------------------------------------------- */

  const cycleAt = (count, today) =>
    app.report.buildReportHtml({
      user: { username: 'Fay', joinDate: '2026-08-01' },
      today,
      meals: dailyBreakfasts(count),
    });

  const at29 = cycleAt(29, '2026-09-30');
  eq('29 meals -> cycle 1', at29.summary.breakfastCycle.currentCycle, 1);
  eq('29 meals -> 29 eaten', at29.summary.breakfastCycle.eatenInCurrentCycle, 29);
  eq('29 meals -> 1 remaining', at29.summary.breakfastCycle.remaining, 1);
  eq('29 meals -> nothing completed', at29.summary.breakfastCycle.completedCycles, 0);

  const at30 = cycleAt(30, '2026-09-30');
  eq('30 meals -> cycle 2', at30.summary.breakfastCycle.currentCycle, 2);
  eq('30 meals -> 0 eaten in it', at30.summary.breakfastCycle.eatenInCurrentCycle, 0);
  eq('30 meals -> 30 remaining', at30.summary.breakfastCycle.remaining, 30);
  eq('30 meals -> cycle 1 completed', at30.summary.breakfastCycle.completedCycles, 1);
  eq('30 meals -> last completed named', at30.summary.breakfastCycle.lastCompleted, 'Cycle 1');
  eq('30 meals -> and dated', at30.summary.breakfastCycle.lastCompletedDate, '2026-08-30');

  const at31 = cycleAt(31, '2026-09-30');
  eq('31 meals -> cycle 2', at31.summary.breakfastCycle.currentCycle, 2);
  eq('31 meals -> 1 eaten in it', at31.summary.breakfastCycle.eatenInCurrentCycle, 1);
  eq('31 meals -> 29 remaining', at31.summary.breakfastCycle.remaining, 29);
  eq('31 meals -> new cycle started on the 31st meal', at31.summary.breakfastCycle.startDate, '2026-08-31');
  eq('31 meals -> 31 calendar days in it', at31.summary.breakfastCycle.cycleDays, 31);
  eq('31 meals -> 2 cycles in the history', at31.summary.cycleHistory.breakfast.length, 2);

  /* 30 meals spread over 59 calendar days still completes cycle 1: the cycle
     counts MEALS. A 30-day window would have got this wrong. */
  const slow = app.report.buildReportHtml({
    user: { username: 'Fay', joinDate: '2026-08-01' },
    today: '2026-09-30',
    meals: Array.from({ length: CYCLE_SIZE }, (_, index) => ({
      date: app.date.addDays('2026-08-01', index * 2),
      breakfast: 'eaten',
    })),
  });
  eq('30 meals over 59 days still completes', slow.summary.breakfastCycle.completedCycles, 1);
  eq('and it took 59 calendar days', slow.summary.cycleHistory.breakfast[0].calendarDays, 59);
  eq('30 meals still in it', slow.summary.cycleHistory.breakfast[0].mealsEaten, CYCLE_SIZE);

  /* ---------------------------------------------------------------- */
  section('12. Offline, unsynced and junk-proof');
  /* ---------------------------------------------------------------- */

  eq('zero network calls in the whole run', harness.network.calls().length, 0);

  const unsynced = app.report.buildReportHtml({
    user: { username: 'Gil', joinDate: '2026-09-01' },
    today: '2026-09-03',
    meals: [{ date: '2026-09-01', breakfast: 'eaten' }],
    pending: [{ date: '2026-09-02', breakfast: 'eaten' }],
  });
  check('unsynced note printed', unsynced.html.includes('not uploaded yet'));
  eq('local record still counted', unsynced.summary.totalBreakfastEaten, 1);

  const junk = app.report.buildReportHtml({
    user: { username: 'Gil', joinDate: '2026-09-01' },
    today: '2026-09-03',
    meals: [null, undefined, {}, 42, 'nope', { date: 'nope' }, { date: '2026-09-02', breakfast: 'weird' }],
    pending: [{ nope: true }],
  });
  eq('junk still yields the whole range', junk.rows.length, 3);
  eq('unknown status is NOT RECORDED', junk.rows.find((r) => r.date === '2026-09-02').breakfast, null);
  eq('nothing invented from junk', junk.summary.totalBreakfastEaten, 0);
  check('junk report keeps the fake status out', !junk.html.includes('not_recorded'));

  check(
    'no arguments does not throw',
    (() => {
      try {
        const r = app.report.buildReportHtml();
        return r.rows.length === 1 && typeof r.html === 'string';
      } catch (error) {
        return false;
      }
    })(),
  );

  check(
    'a reversed range does not throw',
    (() => {
      try {
        return app.report.buildReportHtml({ user: { joinDate: '2026-09-10' }, today: '2026-09-01' }).rows.length === 0;
      } catch (error) {
        return false;
      }
    })(),
  );

  /* ---------------------------------------------------------------- */
  section('13. The master report keeps all five sections');
  /* ---------------------------------------------------------------- */

  for (const heading of ['Report Summary', 'Status Counts', 'Cycle Summaries', 'Cycle History', 'Daily Meal Records']) {
    check(`section: ${heading}`, base.html.includes(heading));
  }
  check('footer counts the days listed', base.html.includes('5 days listed'));
  check('never PENDING', !base.html.includes('PENDING'));
  check('never NOT MARKED', !base.html.includes('NOT MARKED'));
  check('NOT RECORDED still used', base.html.includes('NOT RECORDED'));

  return finish();
}

main()
  .then((f) => process.exit(f > 0 ? 1 : 0))
  .catch((e) => {
    console.error(e);
    failures.push(e.message);
    finish();
    process.exit(1);
  });
