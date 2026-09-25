/**
 * MessMate - PHASE 4 tests (the MEALS screen).
 *
 * HOW THIS RUNS
 * -------------
 * `tests/harness.js` compiles the frontend service + util layer to CommonJS
 * with the Babel that Expo already ships, then loads it on an in-memory
 * AsyncStorage with the network switched OFF.
 *
 * The whole suite runs OFFLINE: the Meals screen has to pick dates, mark
 * meals and draw the complete history with no server at all. Nothing here
 * needs the backend, and no account is created, so the real database is never
 * touched.
 *
 * The screen and component files are React Native, so they are never
 * `require`d here. They are checked two ways instead:
 *   - every file under `src/` must COMPILE (Babel parses + transforms it),
 *     which catches a JSX or syntax mistake in a component;
 *   - the source text is read and checked for the rules this phase promises
 *     (local-first reads, `markMeal()` for writes, no direct API calls, ...).
 *
 * Run:  node tests/phase4.test.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const harness = require('./harness');

const SOURCES = [
  'src/utils/date.js',
  'src/utils/cycle.js',
  'src/utils/mealHistory.js',
  'src/utils/mealStatus.js',
  'src/services/api.js',
  'src/services/storage.js',
  'src/services/sync.js',
  'src/services/meals.js',
];

const reporter = harness.createReporter('PHASE 4 TESTS');
const { check, eq, section, finish, failures } = reporter;

// A fake user id - nothing is sent to a server in this suite.
const LOCAL_ID = '65f40000000000000000dd01';
const OTHER_ID = '65f40000000000000000dd02';

let app = null;
let device = null;

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return app.date.toDateString(date);
}

function daysAhead(days) {
  return daysAgo(-days);
}

/** The Meals screen's own read: the complete joinDate -> today history. */
async function historyFor(userId, joinDate, today) {
  return app.meals.getMealHistory(userId, { joinDate, today });
}

/** The row the screen paints for one date. */
async function rowFor(userId, joinDate, date, today) {
  const rows = await historyFor(userId, joinDate, today);
  return rows.find((row) => row.date === date) || null;
}

async function mark(userId, date, meal, status, joinDate) {
  return app.meals.markMeal({ userId, date, meal, status, joinDate });
}

/** Every .js file under src/ (the screens and components included). */
function sourceFiles(dir = 'src', found = []) {
  for (const entry of fs.readdirSync(path.join(harness.ROOT, dir), { withFileTypes: true })) {
    const relative = `${dir}/${entry.name}`;
    if (entry.isDirectory()) sourceFiles(relative, found);
    else if (entry.name.endsWith('.js')) found.push(relative);
  }

  return found;
}


async function main() {
  console.log('PHASE 4 FRONTEND TESTS');
  console.log('======================');
  console.log('This suite runs with NO network and needs NO backend.');
  console.log('It never creates an account, so no database is touched.');

  harness.compile(SOURCES);

  device = harness.createDevice();
  app = harness.launch(device, SOURCES);

  // Everything below happens with the phone offline.
  harness.network.goOffline();
  app.sync.forgetOnlineState();

  const today = app.date.todayString();

  /* ---------------------------------------------------------------- */
  section('1. The Phase 4 files exist and nothing new was installed');
  /* ---------------------------------------------------------------- */

  const EXPECTED_FILES = [
    'src/screens/MealsScreen.js',
    'src/screens/HomeScreen.js',
    'src/screens/ProfileScreen.js',
    'src/components/DateNavigator.js',
    'src/components/MealEditorCard.js',
    'src/components/MealHistoryList.js',
    'src/components/MealStatusCard.js',
    'src/components/MessMateLogo.js',
    'src/utils/mealHistory.js',
    'src/constants/mealTones.js',
    'src/services/meals.js',
    'src/services/storage.js',
    'src/services/sync.js',
    'tests/phase4.test.js',
  ];

  for (const relative of EXPECTED_FILES) {
    check(`exists: ${relative}`, harness.exists(relative));
  }

  check(
    'Profile is the real Phase 5 screen (Profile 5 owns it)',
    harness.readSource('src/screens/ProfileScreen.js').includes('DOWNLOAD REPORT') ||
      harness.readSource('src/screens/ProfileScreen.js').includes('Download Report'),
  );
  check(
    'there is still exactly one logo component',
    fs
      .readdirSync(path.join(harness.ROOT, 'src/components'))
      .filter((name) => /logo/i.test(name)).length === 1,
  );

  const pkg = harness.readJSON('package.json');
  const deps = pkg.dependencies || {};

  const EXPECTED_DEPS = [
    '@expo-google-fonts/plus-jakarta-sans',
    '@expo/vector-icons',
    '@react-native-async-storage/async-storage',
    '@react-native-community/datetimepicker',
    '@react-navigation/bottom-tabs',
    '@react-navigation/native',
    '@react-navigation/native-stack',
    'axios',
    'expo',
    'expo-constants',
    'expo-file-system',
    'expo-font',
    'expo-print',
    'expo-sharing',
    'expo-status-bar',
    'expo-system-ui',
    'react',
    'react-native',
    'react-native-safe-area-context',
    'react-native-screens',
  ];

  eq(
    'no dependency was added or removed by Phase 4',
    Object.keys(deps).sort(),
    EXPECTED_DEPS.slice().sort(),
  );

  for (const banned of [
    'redux',
    '@reduxjs/toolkit',
    'zustand',
    'mobx',
    'realm',
    '@nozbe/watermelondb',
    'expo-sqlite',
    'sqlite3',
    'react-native-sqlite-storage',
    '@react-native-community/netinfo',
    'socket.io-client',
    'expo-linear-gradient',
    'react-native-svg',
    'chart.js',
    'victory-native',
  ]) {
    check(`not installed: ${banned}`, !deps[banned]);
  }

  /* ---------------------------------------------------------------- */
  section('2. Every screen and component still compiles (JSX included)');
  /* ---------------------------------------------------------------- */

  const babel = require('@babel/core');
  const cjsPlugin = require.resolve('@babel/plugin-transform-modules-commonjs');
  const jsxPlugin = require.resolve('@babel/plugin-transform-react-jsx');

  const files = sourceFiles();
  const broken = [];

  for (const relative of files) {
    try {
      babel.transformFileSync(path.join(harness.ROOT, relative), {
        cwd: harness.ROOT,
        root: harness.ROOT,
        plugins: [jsxPlugin, cjsPlugin],
        babelrc: false,
        configFile: false,
      });
    } catch (error) {
      broken.push(`${relative}: ${error.message.split('\n')[0]}`);
    }
  }

  check(`all ${files.length} files under src/ compile`, broken.length === 0, broken.join(' | '));
  check('the Meals screen is one of them', files.includes('src/screens/MealsScreen.js'));

  /* ---------------------------------------------------------------- */
  section('3. Bottom navigation is still HOME | MEALS | PROFILE, and MEALS is real');
  /* ---------------------------------------------------------------- */

  const tabsSource = harness.readSource('src/navigation/MainTabs.js');

  eq(
    'three tabs, in order',
    [...tabsSource.matchAll(/name: '([A-Za-z]+)',\s*\n\s*label: '([A-Z]+)'/g)].map((m) => m[1]),
    ['Home', 'Meals', 'Profile'],
  );
  eq(
    'the labels are HOME | MEALS | PROFILE',
    [...tabsSource.matchAll(/label: '([A-Z]+)'/g)].map((m) => m[1]),
    ['HOME', 'MEALS', 'PROFILE'],
  );

  for (const forbidden of ['Progress', 'Records', 'Settings', 'Dashboard', 'Analytics', 'Reports']) {
    check(`there is still no ${forbidden} tab`, !tabsSource.includes(forbidden));
  }

  check(
    'MEALS now points at the real Meals screen',
    tabsSource.includes("import MealsScreen from '../screens/MealsScreen'") &&
      tabsSource.includes('component: MealsScreen'),
  );
  check('the Meals placeholder is no longer routed', !tabsSource.includes('MealsPlaceholderScreen'));
  check('HOME is untouched', tabsSource.includes('component: HomeScreen'));
  check(
    'PROFILE is the real screen',
    tabsSource.includes('component: ProfileScreen'),
  );



  /* ---------------------------------------------------------------- */
  section('4. The Meals screen obeys the offline-first rules');
  /* ---------------------------------------------------------------- */

  const mealsSource = harness.readSource('src/screens/MealsScreen.js');

  check(
    'Meals reads local data through services/meals.js',
    mealsSource.includes("from '../services/meals'"),
  );
  check('Meals writes through markMeal()', mealsSource.includes('markMeal({'));
  check(
    'Meals writes nothing itself',
    !/saveLocalMeal|updateLocalMeal|mergeLocalMeals|savePendingSync/.test(mealsSource),
  );
  check(
    'Meals uses the shared sync service',
    mealsSource.includes("from '../services/sync'") && mealsSource.includes('syncUserData('),
  );
  check(
    'Meals never calls the API directly',
    !mealsSource.includes('services/api') && !mealsSource.includes('axios'),
  );
  check('Meals never uses toISOString for a date', !mealsSource.includes('toISOString'));
  check('Meals has no hardcoded YYYY-MM-DD date', !/['"]\d{4}-\d{2}-\d{2}['"]/.test(mealsSource));
  check('Meals never mentions the fake not_recorded status', !mealsSource.includes('not_recorded'));
  check('Meals uses the local date helpers', mealsSource.includes("from '../utils/date'"));
  check(
    'Meals keeps the selected date inside joinDate -> today',
    mealsSource.includes('clampDate(') && mealsSource.includes('dateNavigationState('),
  );
  check(
    'Meals does not duplicate the mark logic',
    !/storage\.(saveLocalMeal|getLocalMeals)/.test(mealsSource) &&
      !/api\.(saveMealRecord|fetchMealRecords)/.test(mealsSource),
  );
  check(
    'Meals reuses the shared meal components',
    mealsSource.includes('<MealEditorCard') &&
      mealsSource.includes('<DateNavigator') &&
      mealsSource.includes('<MealHistoryList'),
  );
  check('Meals reuses the Phase 3 logo', mealsSource.includes('<MessMateLogo'));
  check('Meals does not repeat the Home cycle dashboard', !mealsSource.includes('CycleCard'));
  check(
    'Meals scrolls, so a small phone never clips the history',
    mealsSource.includes('<ScrollView') && mealsSource.includes('RefreshControl'),
  );
  check(
    'the calendar picker is bounded by joinDate and today',
    mealsSource.includes('minimumDate={toDateObject(minDate)}') &&
      mealsSource.includes('maximumDate={toDateObject(maxDate)}'),
  );
  check('sync is a background best effort, never a blocker', mealsSource.includes('catch (syncError)'));
  check(
    'a failed sync leaves the local records on screen',
    mealsSource.includes('// Offline is normal. Local data stays exactly as it is.'),
  );
  check(
    'an offline change is described as saved, not as an error',
    harness.readSource('src/components/MealEditorCard.js').includes('Saved on this device'),
  );
  check('the history list is fed the rows the screen built', mealsSource.includes('rows={history}'));

  /* ---- the screen matches the Stitch Meals mockup ---- */

  check(
    'the header follows the mockup (title, line, MESS JOINED)',
    mealsSource.includes('Update your breakfast and dinner for any day.') &&
      mealsSource.includes('MESS JOINED'),
  );
  check(
    'the editor card carries the mockup’s title',
    harness.readSource('src/components/MealEditorCard.js').includes('Edit Daily Status'),
  );
  check(
    'the history table carries the mockup’s title and columns',
    harness.readSource('src/components/MealHistoryList.js').includes('Meal History') &&
      /DATE[\s\S]{0,200}BREAKFAST[\s\S]{0,200}DINNER/.test(harness.readSource('src/components/MealHistoryList.js')),
  );
  check(
    'the date stepper follows the mockup (chevrons + calendar trigger)',
    /chevron-left/.test(harness.readSource('src/components/DateNavigator.js')) &&
      harness.readSource('src/components/DateNavigator.js').includes('chevron-right') &&
      harness.readSource('src/components/DateNavigator.js').includes('calendar-month-outline'),
  );

  const tonesSource = harness.readSource('src/constants/mealTones.js');
  check(
    'EATEN is emerald',
    tonesSource.includes('solid: colors.primaryContainer'),
  );
  check(
    'NOT EATEN is gold, never an alarming red',
    tonesSource.includes('solid: colors.secondaryContainer') && !tonesSource.includes('colors.error'),
  );
  check(
    'NOT RECORDED is muted',
    tonesSource.includes('solid: colors.surfaceVariant'),
  );

  const editorSource = harness.readSource('src/components/MealEditorCard.js');
  check(
    'the editor offers exactly the two real choices',
    /CHOICES = \[[\s\S]{0,200}MEAL_STATUS.EATEN[\s\S]{0,200}MEAL_STATUS.NOT_EATEN[\s\S]{0,80}\]/.test(editorSource),
  );
  check(
    'one meal row reports its own meal and status only',
    editorSource.includes('onMark(meal, status)') && editorSource.includes('meal={MEAL_TYPES.BREAKFAST}') &&
      editorSource.includes('meal={MEAL_TYPES.DINNER}'),
  );

  /* ---------------------------------------------------------------- */
  section('5. Date navigation: joinDate -> today, never outside');
  /* ---------------------------------------------------------------- */

  const joinDate = daysAgo(6);
  const navFor = (selectedDate, min = joinDate, max = today) =>
    app.date.dateNavigationState({ selectedDate, joinDate: min, today: max });

  const onToday = navFor(today);
  eq('on today, NEXT is disabled', onToday.canGoNext, false);
  eq('on today, PREV is enabled', onToday.canGoPrevious, true);
  eq('PREV from today is yesterday', onToday.previousDate, daysAgo(1));
  eq('there is no NEXT beyond today', onToday.nextDate, null);

  const onJoin = navFor(joinDate);
  eq('on the join date, PREV is disabled', onJoin.canGoPrevious, false);
  eq('on the join date, NEXT is enabled', onJoin.canGoNext, true);
  eq('NEXT from the join date is one day later', onJoin.nextDate, daysAgo(5));
  eq('there is no PREV before the join date', onJoin.previousDate, null);

  const inMiddle = navFor(daysAgo(3));
  eq('in the middle, both arrows work', [inMiddle.canGoPrevious, inMiddle.canGoNext], [true, true]);

  const oneDayUser = navFor(today, today, today);
  eq(
    'joinDate == today: both arrows are disabled',
    [oneDayUser.canGoPrevious, oneDayUser.canGoNext],
    [false, false],
  );
  eq(
    'joinDate == today: no other date exists',
    [oneDayUser.previousDate, oneDayUser.nextDate],
    [null, null],
  );

  // Nothing the stepper can produce may fall outside the window.
  let escaped = null;
  for (let index = 0; index < 8; index += 1) {
    const state = navFor(daysAgo(index));
    for (const candidate of [state.previousDate, state.nextDate, state.selectedDate]) {
      if (candidate !== null && (candidate < joinDate || candidate > today)) escaped = candidate;
    }
  }
  check('no arrow can ever reach a date outside the range', escaped === null, String(escaped));

  eq(
    'a date before the join date is clamped to the join date',
    app.date.clampDate(daysAgo(9), { min: joinDate, max: today }),
    joinDate,
  );
  eq(
    'a future date is clamped to today',
    app.date.clampDate(daysAhead(4), { min: joinDate, max: today }),
    today,
  );
  eq(
    'a nonsense date falls back to today',
    app.date.clampDate('not-a-date', { min: joinDate, max: today }),
    today,
  );
  eq(
    'a real in-range date is left alone',
    app.date.clampDate(daysAgo(2), { min: joinDate, max: today }),
    daysAgo(2),
  );

  const DATE_SOURCE = harness.readSource('src/utils/date.js');
  const dateCode = DATE_SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
  check('date.js never calls toISOString either', !/toISOString/.test(dateCode));
  eq('day stepping survives a month end', app.date.addDays('2026-08-31', 1), '2026-09-01');
  eq('day stepping survives a year end', app.date.addDays('2026-12-31', 1), '2027-01-01');
  eq('day stepping survives a leap day', app.date.addDays('2028-02-28', 1), '2028-02-29');
  eq('day stepping crosses a DST change without sliding', app.date.addDays('2026-03-08', 1), '2026-03-09');



  /* ---------------------------------------------------------------- */
  section('6. History covers every date from joinDate to today');
  /* ---------------------------------------------------------------- */

  harness.network.reset();

  // A member who joined 6 days ago and has recorded only two of those days.
  const rangeJoin = daysAgo(6);
  const rangeDays = [daysAgo(6), daysAgo(5), daysAgo(4), daysAgo(3), daysAgo(2), daysAgo(1), today];

  await app.storage.saveLocalMeal({ userId: LOCAL_ID, date: daysAgo(3), breakfast: 'eaten' });
  await app.storage.saveLocalMeal({ userId: LOCAL_ID, date: daysAgo(1), dinner: 'not_eaten' });

  const rangeRows = await historyFor(LOCAL_ID, rangeJoin);

  eq('seven dates, one row each', rangeRows.length, 7);
  eq('newest first', rangeRows.map((row) => row.date), rangeDays.slice().reverse());
  eq('the oldest row is the join date', rangeRows[rangeRows.length - 1].date, rangeJoin);
  eq('the first row is today', rangeRows[0].date, today);

  const dayWithNothing = rangeRows.find((row) => row.date === daysAgo(5));
  eq(
    'a date with no record is NOT RECORDED / NOT RECORDED',
    [
      app.mealStatus.statusLabel(dayWithNothing.breakfast),
      app.mealStatus.statusLabel(dayWithNothing.dinner),
    ],
    ['NOT RECORDED', 'NOT RECORDED'],
  );
  eq(
    '...and it carries no values at all',
    [dayWithNothing.breakfast, dayWithNothing.dinner],
    [null, null],
  );
  eq('...and it is marked as having no record', dayWithNothing.recorded, false);

  const eatenDay = rangeRows.find((row) => row.date === daysAgo(3));
  eq('the day with a breakfast shows EATEN', app.mealStatus.statusLabel(eatenDay.breakfast), 'EATEN');
  eq('...and its untouched dinner stays NOT RECORDED', eatenDay.dinner, null);

  const notEatenDay = rangeRows.find((row) => row.date === daysAgo(1));
  eq(
    'NOT EATEN is shown as NOT EATEN, not as a gap',
    app.mealStatus.statusLabel(notEatenDay.dinner),
    'NOT EATEN',
  );
  eq('...and its breakfast stays NOT RECORDED', notEatenDay.breakfast, null);

  check(
    'no row ever produces the fake not_recorded value',
    !JSON.stringify(rangeRows).includes('not_recorded'),
  );
  eq('no missing date was written to the device', (await app.storage.getLocalMeals(LOCAL_ID)).length, 2);

  // joinDate == today: exactly one date, and it may be NOT RECORDED.
  const singleRow = await historyFor(OTHER_ID, today);
  eq('joinDate == today: exactly one row', singleRow.length, 1);
  eq('...and it is today', singleRow[0].date, today);
  eq(
    '...and a brand new member has recorded nothing',
    [singleRow[0].breakfast, singleRow[0].dinner],
    [null, null],
  );

  // A record outside the range is simply not part of the history.
  await app.storage.saveLocalMeal({ userId: OTHER_ID, date: daysAgo(20), breakfast: 'eaten' });
  const stillOne = await historyFor(OTHER_ID, today);
  eq('a pre-join record is not listed', stillOne.length, 1);
  eq('...and it was not deleted either', (await app.storage.getLocalMeals(OTHER_ID)).length, 1);

  eq(
    'the range label matches the design',
    app.date.formatDayMonthRange(rangeJoin, today),
    `${app.date.formatDayMonth(rangeJoin)} - ${app.date.formatDayMonth(today)}`,
  );
  eq(
    'a one-day range label is a single date',
    app.date.formatDayMonthRange(today, today),
    app.date.formatDayMonth(today),
  );

  eq('building the history made zero network calls', harness.network.count(), 0);


  /* ---------------------------------------------------------------- */
  section('7. Marking a meal offline: independent, one record per date');
  /* ---------------------------------------------------------------- */

  const EDIT_ID = '65f40000000000000000dd03';
  const editJoin = daysAgo(6);
  const editDay = daysAgo(4);

  harness.network.reset();

  const before = await rowFor(EDIT_ID, editJoin, editDay);
  eq('the chosen day starts NOT RECORDED', [before.breakfast, before.dinner], [null, null]);

  /* ---- the two examples from the Phase 4 brief ---- */

  // Breakfast = EATEN, Dinner = NOT EATEN -> change Breakfast to NOT EATEN.
  await mark(EDIT_ID, editDay, 'breakfast', 'eaten', editJoin);
  await mark(EDIT_ID, editDay, 'dinner', 'not_eaten', editJoin);
  await mark(EDIT_ID, editDay, 'breakfast', 'not_eaten', editJoin);

  const exampleA = await rowFor(EDIT_ID, editJoin, editDay);
  eq('example A: breakfast is NOT EATEN', exampleA.breakfast, 'not_eaten');
  eq('example A: dinner is still NOT EATEN', exampleA.dinner, 'not_eaten');

  // Breakfast = EATEN, Dinner = EATEN -> change Dinner to NOT EATEN.
  await mark(EDIT_ID, editDay, 'breakfast', 'eaten', editJoin);
  await mark(EDIT_ID, editDay, 'dinner', 'eaten', editJoin);
  await mark(EDIT_ID, editDay, 'dinner', 'not_eaten', editJoin);

  const exampleB = await rowFor(EDIT_ID, editJoin, editDay);
  eq('example B: breakfast is still EATEN', exampleB.breakfast, 'eaten');
  eq('example B: dinner changed to NOT EATEN', exampleB.dinner, 'not_eaten');

  /* ---- hammering one day must never duplicate it ---- */

  const stamp = (await app.storage.getLocalMeals(EDIT_ID)).length;

  for (const [meal, status] of [
    ['breakfast', 'eaten'],
    ['dinner', 'eaten'],
    ['breakfast', 'not_eaten'],
    ['dinner', 'not_eaten'],
    ['breakfast', 'eaten'],
    ['dinner', 'eaten'],
  ]) {
    await mark(EDIT_ID, editDay, meal, status, editJoin);
  }

  eq(
    'six more changes on one day = one record',
    (await app.storage.getLocalMeals(EDIT_ID)).length,
    stamp,
  );
  const hammered = await rowFor(EDIT_ID, editJoin, editDay);
  eq('the last word on breakfast wins', hammered.breakfast, 'eaten');
  eq('the last word on dinner wins', hammered.dinner, 'eaten');

  /* ---- offline behaviour of every one of those taps ---- */

  eq('every offline tap stayed on this device', harness.network.count(), 0);
  const queue = await app.storage.getPendingSync(EDIT_ID);
  eq('one queued item per date, not per tap', queue.length, 1);
  eq('...and it is the day that was edited', queue[0].date, editDay);
  eq('...carrying both meals of that day', [queue[0].breakfast, queue[0].dinner], ['eaten', 'eaten']);
  eq('...and the history row says it is waiting', (await rowFor(EDIT_ID, editJoin, editDay)).pending, true);

  /* ---- editing one date leaves every other date alone ---- */

  const untouched = await rowFor(EDIT_ID, editJoin, daysAgo(5));
  eq('a neighbouring day is still NOT RECORDED', [untouched.breakfast, untouched.dinner], [null, null]);
  eq('today was never touched', (await rowFor(EDIT_ID, editJoin, today)).recorded, false);

  await mark(EDIT_ID, today, 'breakfast', 'eaten', editJoin);
  const afterToday = await historyFor(EDIT_ID, editJoin);
  const editedRow = afterToday.find((row) => row.date === editDay);

  eq('today can be marked as well', afterToday[0].breakfast, 'eaten');
  eq(
    '...and the earlier date kept both of its values',
    [editedRow.breakfast, editedRow.dinner],
    ['eaten', 'eaten'],
  );
  eq('two edited dates = two queued items', (await app.storage.getPendingSync(EDIT_ID)).length, 2);
  eq('still nothing was uploaded', harness.network.count(), 0);

  /* ---- a meal nobody decided stays NOT RECORDED ---- */

  await mark(EDIT_ID, daysAgo(2), 'dinner', 'eaten', editJoin);
  const dinnerOnly = await rowFor(EDIT_ID, editJoin, daysAgo(2));
  eq('only dinner was recorded', dinnerOnly.dinner, 'eaten');
  eq('its breakfast is still NOT RECORDED', dinnerOnly.breakfast, null);

  const rawRecord = (await app.storage.getLocalMeals(EDIT_ID)).find((row) => row.date === daysAgo(2));
  eq(
    'the stored day is sparse: only the decided meal is written',
    Object.prototype.hasOwnProperty.call(rawRecord, 'breakfast'),
    false,
  );
  eq(
    'the backend-shaped read fills the untouched side with the server default',
    (await app.storage.getLocalMeal(EDIT_ID, daysAgo(2))).breakfast,
    'not_eaten',
  );
  eq(
    '...without writing that default back to the device',
    Object.prototype.hasOwnProperty.call(
      (await app.storage.getLocalMeals(EDIT_ID)).find((row) => row.date === daysAgo(2)),
      'breakfast',
    ),
    false,
  );

  /* ---------------------------------------------------------------- */
  section('8. A date the screen must never offer is refused');
  /* ---------------------------------------------------------------- */

  const refused = {};

  for (const [name, attempt] of [
    ['a future date', () => mark(EDIT_ID, daysAhead(1), 'breakfast', 'eaten', editJoin)],
    ['a date before the join date', () => mark(EDIT_ID, daysAgo(9), 'breakfast', 'eaten', editJoin)],
    ['the fake not_recorded status', () => mark(EDIT_ID, editDay, 'breakfast', 'not_recorded', editJoin)],
    ['a meal that does not exist', () => mark(EDIT_ID, editDay, 'lunch', 'eaten', editJoin)],
    ['a date that is not a date', () => mark(EDIT_ID, '24/09/2026', 'breakfast', 'eaten', editJoin)],
  ]) {
    try {
      await attempt();
      refused[name] = null;
    } catch (error) {
      refused[name] = error.message;
    }
  }

  check('a future date is refused', /future/i.test(refused['a future date'] || ''), refused['a future date']);
  check(
    'a date before the join date is refused',
    /join date/i.test(refused['a date before the join date'] || ''),
    refused['a date before the join date'],
  );
  check(
    'the fake not_recorded status is refused',
    /eaten/.test(refused['the fake not_recorded status'] || ''),
    refused['the fake not_recorded status'],
  );
  check(
    'an unknown meal is refused',
    /breakfast/.test(refused['a meal that does not exist'] || ''),
    refused['a meal that does not exist'],
  );
  check(
    'a malformed date is refused',
    /YYYY-MM-DD/.test(refused['a date that is not a date'] || ''),
    refused['a date that is not a date'],
  );
  eq(
    'not one refused tap created a record',
    (await app.storage.getLocalMeals(EDIT_ID)).length,
    3,
  );
  eq('not one refused tap was queued', (await app.storage.getPendingSync(EDIT_ID)).length, 3);


  /* ---------------------------------------------------------------- */
  section('9. A failed sync is never an error and never loses a change');
  /* ---------------------------------------------------------------- */

  harness.network.reset();
  app.sync.forgetOnlineState();

  const rowsBeforeSync = await historyFor(EDIT_ID, editJoin);
  const result = await app.sync.syncUserData(EDIT_ID);

  eq('an offline sync reports that it did not reach the server', [result.ok, result.online], [false, false]);
  check('...in plain language, not as a failure', /Offline/i.test(result.message), result.message);
  eq('...and it still knows what is waiting', result.pending, 3);
  eq('no meal was uploaded', result.uploaded, 0);
  eq('no meal was downloaded', result.downloaded, 0);

  const rowsAfterSync = await historyFor(EDIT_ID, editJoin);
  eq('the history on screen is unchanged', rowsAfterSync, rowsBeforeSync);
  eq('the queued changes are still queued', (await app.storage.getPendingSync(EDIT_ID)).length, 3);
  eq(
    'every local record is still there',
    (await app.storage.getLocalMeals(EDIT_ID)).length,
    3,
  );

  // A second user on the same phone must not see the first user's meals.
  const strangerRows = await historyFor('65f40000000000000000dd04', editJoin);
  check(
    'another member never inherits these records',
    strangerRows.every((row) => row.breakfast === null && row.dinner === null),
  );

  /* ---------------------------------------------------------------- */
  section('10. Nothing in Phase 4 needs the internet');
  /* ---------------------------------------------------------------- */

  check('the whole suite ran with the network switched OFF', harness.network.isOffline());
  eq(
    'no meal record was ever sent anywhere',
    harness.network.calls().filter((call) => call.url.includes('/meals')).length,
    0,
  );
  check(
    'no signup or login was ever attempted',
    harness.network.calls().filter((call) => call.url.includes('/auth/')).length === 0,
  );

  return finish();
}

main()
  .then((failed) => {
    process.exit(failed > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error('\n!! The test runner itself crashed:');
    console.error(error);
    failures.push(`the test runner crashed: ${error.message}`);
    finish();
    process.exit(1);
  });

