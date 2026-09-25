/**
 * MessMate - PHASE 8A tests (Detailed PDF Report Upgrade).
 *
 * Tests:
 * - Every date joinDate -> today is generated.
 * - Missing records become NOT RECORDED.
 * - Total days since joining is calendar inclusive.
 * - Breakfast cycle and dinner cycle summaries are independent.
 * - Current cycle start date and cycle calendar days.
 * - Edge cases: 0 meals, 1 meal, exactly 30, 31, 60, 65 meals.
 * - Unsynced local data included.
 * - Generation works offline without network.
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

const reporter = harness.createReporter('PHASE 8A TESTS');
const { check, eq, section, finish, failures } = reporter;

let app = null;
let device = null;

async function main() {
  console.log('PHASE 8A FRONTEND TESTS (DETAILED PDF REPORT)');
  harness.compile(SOURCES);
  device = harness.createDevice();
  app = harness.launch(device, SOURCES);

  harness.network.goOffline();
  app.sync.forgetOnlineState();

  section('1. Report date range coverage');
  const rep1 = app.report.buildReportHtml({
    user: { username: 'Alice', email: 'alice@example.com', joinDate: '2026-09-01' },
    today: '2026-09-05',
    meals: [{ date: '2026-09-02', breakfast: 'eaten', dinner: 'not_eaten' }]
  });
  eq('all 5 dates generated', rep1.rows.length, 5);
  eq('first row is today (newest first)', rep1.rows[0].date, '2026-09-05');
  eq('last row is joinDate', rep1.rows[4].date, '2026-09-01');
  check('joinDate in HTML', rep1.html.includes('01 September 2026'));
  check('today in HTML', rep1.html.includes('05 September 2026'));
  check('missing date shows NOT RECORDED', rep1.html.includes('NOT RECORDED'));
  check('never PENDING', !rep1.html.includes('PENDING'));
  check('never NOT MARKED', !rep1.html.includes('NOT MARKED'));
  check('never not_recorded string', !rep1.html.includes('not_recorded'));

  section('2. Report summary calculations');
  eq('total days since joining', rep1.summary.totalDays, 5);
  eq('total breakfast eaten', rep1.summary.totalBreakfastEaten, 1);
  eq('total dinner eaten', rep1.summary.totalDinnerEaten, 0);
  check('summary grid in HTML', rep1.html.includes('Total Days Since Joining'));
  // Phase 8B removed every combined metric, so this now proves the absence
  // instead of the presence.
  check('no combinedEaten field', !('combinedEaten' in rep1.summary));
  check('no combined metric printed', !/combined/i.test(rep1.html));

  section('3. Breakfast and dinner cycle summary independence');
  eq('B current cycle', rep1.summary.breakfastCycle.currentCycle, 1);
  eq('B eaten in cycle', rep1.summary.breakfastCycle.eatenInCurrentCycle, 1);
  eq('B remaining', rep1.summary.breakfastCycle.remaining, 29);
  eq('B last completed', rep1.summary.breakfastCycle.lastCompleted, 'No completed cycle');
  eq('B cycle start date', rep1.summary.breakfastCycle.startDate, '2026-09-02');
  eq('B cycle calendar days', rep1.summary.breakfastCycle.cycleDays, 4);

  eq('D current cycle', rep1.summary.dinnerCycle.currentCycle, 1);
  eq('D eaten in cycle', rep1.summary.dinnerCycle.eatenInCurrentCycle, 0);
  eq('D remaining', rep1.summary.dinnerCycle.remaining, 30);
  eq('D last completed', rep1.summary.dinnerCycle.lastCompleted, 'No completed cycle');
  eq('D cycle start date', rep1.summary.dinnerCycle.startDate, null);
  eq('D status message', rep1.summary.dinnerCycle.statusMessage, 'No dinner cycle started');
  check('HTML contains B summary', rep1.html.includes('Breakfast Cycle Summary'));
  check('HTML contains D summary', rep1.html.includes('Dinner Cycle Summary'));
  check('HTML contains No dinner cycle started', rep1.html.includes('No dinner cycle started'));

  section('4. Edge case: 0 meals recorded');
  const rep0 = app.report.buildReportHtml({
    user: { username: 'Bob', email: 'bob@example.com', joinDate: '2026-09-10' },
    today: '2026-09-10',
    meals: []
  });
  eq('single day history', rep0.rows.length, 1);
  eq('total days is 1', rep0.summary.totalDays, 1);
  eq('B total 0', rep0.summary.totalBreakfastEaten, 0);
  eq('D total 0', rep0.summary.totalDinnerEaten, 0);
  eq('B status', rep0.summary.breakfastCycle.statusMessage, 'No breakfast cycle started');
  eq('D status', rep0.summary.dinnerCycle.statusMessage, 'No dinner cycle started');

  section('5. Edge case: multiple completed cycles (65 meals)');
  const meals65 = [];
  for (let i = 1; i <= 65; i++) {
    const m = i <= 30 ? '08' : (i <= 60 ? '09' : '10');
    const d = ((i - 1) % 30) + 1;
    const ds = d < 10 ? '0' + d : '' + d;
    meals65.push({ date: '2026-' + m + '-' + ds, breakfast: 'eaten' });
  }
  const rep65 = app.report.buildReportHtml({
    user: { username: 'Charlie', email: 'charlie@example.com', joinDate: '2026-08-01' },
    today: '2026-10-10',
    meals: meals65
  });
  eq('65 meals cycle', rep65.summary.breakfastCycle.currentCycle, 3);
  eq('65 meals in cycle', rep65.summary.breakfastCycle.eatenInCurrentCycle, 5);
  eq('65 meals remaining', rep65.summary.breakfastCycle.remaining, 25);
  eq('65 meals last completed', rep65.summary.breakfastCycle.lastCompleted, 'Cycle 2');
  eq('65 meals cycle start date', rep65.summary.breakfastCycle.startDate, '2026-10-01');
  eq('65 meals cycle calendar days', rep65.summary.breakfastCycle.cycleDays, 10);

  section('6. Edge case: exactly 30 meals (completed cycle)');
  const meals30 = meals65.slice(0, 30);
  const rep30 = app.report.buildReportHtml({
    user: { username: 'Dan', email: 'dan@example.com', joinDate: '2026-08-01' },
    today: '2026-09-01',
    meals: meals30
  });
  eq('30 meals current cycle', rep30.summary.breakfastCycle.currentCycle, 2);
  eq('30 meals eaten in cycle', rep30.summary.breakfastCycle.eatenInCurrentCycle, 0);
  eq('30 meals remaining', rep30.summary.breakfastCycle.remaining, 30);
  eq('30 meals last completed', rep30.summary.breakfastCycle.lastCompleted, 'Cycle 1');
  eq('30 meals status message', rep30.summary.breakfastCycle.statusMessage, 'No breakfast cycle started');

  section('7. Unsynced local data included');
  const repUnsynced = app.report.buildReportHtml({
    user: { username: 'Eve', email: 'eve@example.com', joinDate: '2026-09-01' },
    today: '2026-09-03',
    meals: [{ date: '2026-09-01', breakfast: 'eaten' }],
    pending: [{ date: '2026-09-02', breakfast: 'eaten' }]
  });
  check('unsynced note in html', repUnsynced.html.includes('not uploaded yet'));

  section('8. Offline generation safety (never throws, zero network)');
  eq('zero network calls made', harness.network.calls().length, 0);

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