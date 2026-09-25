/**
 * MessMate - PHASE 3 tests (Home, 30-meal cycles, bottom navigation).
 *
 * HOW THIS RUNS
 * -------------
 * `tests/harness.js` compiles the frontend service + util layer to CommonJS
 * with the Babel Expo already ships, then loads it on an in-memory
 * AsyncStorage with the network switched OFF.
 *
 * This whole suite runs OFFLINE on purpose: Home must work with no server at
 * all. Nothing here needs the backend to be running, and no account is
 * created, so the real database is never touched.
 *
 * Run:  node tests/phase3.test.js
 */

'use strict';

const fsp = require('fs');
const path = require('path');

const harness = require('./harness');

const SOURCES = [
  'src/utils/date.js',
  'src/utils/cycle.js',
  // Added in Phase 4: `services/meals.js` now also builds the Meals history,
  // so its pure builder has to be compiled alongside it. No assertion in this
  // suite changed - this list only says WHAT gets compiled.
  'src/utils/mealHistory.js',
  'src/utils/user.js',
  'src/utils/mealStatus.js',
  'src/utils/syncStatus.js',
  'src/services/api.js',
  'src/services/storage.js',
  'src/services/sync.js',
  'src/services/meals.js',
];

const reporter = harness.createReporter('PHASE 3 TESTS');
const { check, eq, section, finish, failures } = reporter;

// A fake user id - nothing is sent to a server in this suite.
const LOCAL_ID = '65f10000000000000000cc01';

let app = null;
let device = null;

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return app.date.toDateString(date);
}

async function summaryFor(userId, joinDate) {
  return app.meals.getTodaySummary(userId, { joinDate });
}

async function mark(userId, day, meal, status, joinDate) {
  return app.meals.markMeal({ userId, date: day, meal, status, joinDate });
}

async function main() {
  console.log('PHASE 3 FRONTEND TESTS');
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
  section('1. The Phase 3 files exist and nothing new was installed');
  /* ---------------------------------------------------------------- */

  const EXPECTED_FILES = [
    'src/screens/HomeScreen.js',
    'src/screens/MealsPlaceholderScreen.js',
    'src/screens/ProfilePlaceholderScreen.js',
    'src/navigation/MainTabs.js',
    'src/components/MessMateLogo.js',
    'src/components/MealStatusCard.js',
    'src/components/CycleCard.js',
    'src/components/PlaceholderScreen.js',
    'src/utils/cycle.js',
    'src/utils/user.js',
    'src/utils/mealStatus.js',
    'src/utils/syncStatus.js',
    'tests/harness.js',
    'tests/phase3.test.js',
  ];

  for (const relative of EXPECTED_FILES) {
    check(`exists: ${relative}`, harness.exists(relative));
  }

  check(
    'the Phase 2 placeholder screen is gone',
    !harness.exists('src/screens/AuthenticatedPlaceholderScreen.js'),
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
    'no dependency was added or removed by Phase 3',
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
    '@react-native-community/netinfo',
    'socket.io-client',
    'expo-notifications',
    'expo-linear-gradient',
    'expo-background-fetch',
    'react-native-svg',
    'expo-av',
    'expo-camera',
    'chart.js',
    'victory-native',
  ]) {
    check(`not installed: ${banned}`, !deps[banned]);
  }

  check('bottom tabs are actually used now', Boolean(deps['@react-navigation/bottom-tabs']));

  /* ---------------------------------------------------------------- */
  section('2. Bottom navigation is exactly HOME | MEALS | PROFILE');
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
    check(`there is no ${forbidden} tab`, !tabsSource.includes(forbidden));
  }

  check(
    'MainTabs renders the real Home screen',
    tabsSource.includes("import HomeScreen from '../screens/HomeScreen'"),
  );
  check(
    'the bar keeps the emerald/gold tokens',
    tabsSource.includes('colors.primaryContainer') && tabsSource.includes('colors.outline'),
  );

  const appNavigatorSource = harness.readSource('src/navigation/AppNavigator.js');

  check(
    'AppNavigator shows MainTabs when a session exists',
    appNavigatorSource.includes('<Stack.Screen name="MainTabs" component={MainTabs} />'),
  );
  check(
    'the Phase 2 placeholder is no longer routed',
    !appNavigatorSource.includes('AuthenticatedPlaceholder'),
  );
  check(
    'AuthContext still decides which stack shows',
    appNavigatorSource.includes('{user ? <AppStack /> : <AuthNavigator />}'),
  );

  const authSource = harness.readSource('src/context/AuthContext.js');
  check(
    'logout still goes through AuthContext.signOut',
    authSource.includes('const signOut = useCallback') && authSource.includes('clearLocalUser()'),
  );

  /* ---------------------------------------------------------------- */
  section('3. Screen source rules (offline-first, no fixed dates)');
  /* ---------------------------------------------------------------- */

  const SCREENS = [
    'src/screens/HomeScreen.js',
    'src/screens/MealsPlaceholderScreen.js',
    'src/screens/ProfilePlaceholderScreen.js',
  ];

  for (const relative of SCREENS) {
    const source = harness.readSource(relative);
    const name = path.basename(relative);

    check(`${name} never calls the API directly`, !source.includes('services/api') && !source.includes('axios'));
    check(`${name} never uses toISOString for a date`, !source.includes('toISOString'));
    check(`${name} has no hardcoded YYYY-MM-DD date`, !/['"]\d{4}-\d{2}-\d{2}['"]/.test(source));
    check(`${name} never mentions the fake not_recorded status`, !source.includes('not_recorded'));
  }

  const homeSource = harness.readSource('src/screens/HomeScreen.js');

  check('Home reads local data through services/meals.js', homeSource.includes("from '../services/meals'"));
  check('Home marks meals through markMeal()', homeSource.includes('markMeal({'));
  check('Home uses the local date helpers', homeSource.includes("from '../utils/date'"));
  check('Home uses the shared cycle maths', homeSource.includes("from '../utils/cycle'"));
  check(
    'the Meals placeholder cannot touch stored meals',
    !/services\/(meals|storage)/.test(harness.readSource('src/screens/MealsPlaceholderScreen.js')),
  );
  check(
    'both meal cards come from the same component',
    (homeSource.match(/<MealStatusCard/g) || []).length === 1,
  );

  const cardSource = harness.readSource('src/components/MealStatusCard.js');
  for (const word of ['MARK EATEN', 'MARK NOT EATEN']) {
    check(`the meal card offers ${word}`, cardSource.includes(word));
  }
  check('the meal card shows the three real statuses', harness.readSource('src/utils/mealStatus.js').includes("NOT_RECORDED: 'NOT RECORDED'"));

  const logoSource = harness.readSource('src/components/MessMateLogo.js');
  check('the logo is drawn locally, not downloaded', !/https?:\/\//.test(logoSource));
  check('the logo says MESSMATE', logoSource.includes('MESSMATE'));
  check('the logo uses the emerald brand token', logoSource.includes('colors.primaryContainer'));

  /* ---------------------------------------------------------------- */
  section('4. Greeting, dates, initials and the sync chip');
  /* ---------------------------------------------------------------- */

  const at = (hour, minute = 0) => new Date(2026, 8, 23, hour, minute, 0, 0);

  eq('09:00 is a morning greeting', app.date.greetingFor(at(9)), 'Good morning');
  eq('11:59 is still morning', app.date.greetingFor(at(11, 59)), 'Good morning');
  eq('12:00 becomes afternoon', app.date.greetingFor(at(12)), 'Good afternoon');
  eq('16:59 is still afternoon', app.date.greetingFor(at(16, 59)), 'Good afternoon');
  eq('17:00 becomes evening', app.date.greetingFor(at(17)), 'Good evening');
  eq('23:30 is still evening', app.date.greetingFor(at(23, 30)), 'Good evening');

  eq('today is built from LOCAL parts, not toISOString', app.date.todayString(at(0, 30)), '2026-09-23');
  eq('the mockup date renders as designed', app.date.formatDisplayDate('2026-09-23'), '23 September 2026');
  eq('the weekday matches the mockup', app.date.weekdayName('2026-09-23'), 'Wednesday');
  eq('an impossible date gives no weekday', app.date.weekdayName('2026-02-31'), '');

  eq('initials from two words', app.user.initialsFor({ username: 'Sahil Dubey' }), 'SD');
  eq('initials from one word', app.user.initialsFor({ username: 'sahil' }), 'S');
  eq('initials when nothing is stored', app.user.initialsFor({}), 'MM');
  eq('the display name falls back', app.user.displayName({ username: '   ' }), 'MessMate member');

  eq(
    'the three real status labels',
    ['eaten', 'not_eaten', null].map((value) => app.mealStatus.statusLabel(value)),
    ['EATEN', 'NOT EATEN', 'NOT RECORDED'],
  );
  eq(
    'an unknown stored value can never leak through',
    app.mealStatus.statusLabel('not_recorded'),
    'NOT RECORDED',
  );

  eq(
    'nothing waiting, offline, reads quietly',
    app.syncStatus.syncState({ pending: 0, lastSync: { ok: false, online: false } }).label,
    'Offline',
  );
  eq('one waiting change', app.syncStatus.syncState({ pending: 1, lastSync: null }).label, '1 change to sync');
  eq('several waiting changes', app.syncStatus.syncState({ pending: 3, lastSync: null }).label, '3 changes to sync');
  eq(
    'a completed sync says so',
    app.syncStatus.syncState({ pending: 0, lastSync: { ok: true, online: true } }).label,
    'All synced',
  );
  check(
    'normal offline operation is never styled as an error',
    app.syncStatus.syncState({ pending: 0, lastSync: { ok: false, online: false } }).tone !== 'error',
  );

  /* ---------------------------------------------------------------- */
  section('5. The 30-meal cycle: 0 / 1 / 29 / 30 / 31 / 60 / 61');
  /* ---------------------------------------------------------------- */

  const { buildCycle, buildUserStats, CYCLE_SIZE } = app.cycle;

  eq('the cycle size is 30', CYCLE_SIZE, 30);

  // [currentCycle, eatenInCurrentCycle, remaining, cycleComplete]
  const shape = (eaten) => {
    const cycle = buildCycle(eaten);
    return [cycle.currentCycle, cycle.eatenInCurrentCycle, cycle.remaining, cycle.cycleComplete];
  };

  eq('0 eaten -> cycle 1, 0/30', shape(0), [1, 0, 30, false]);
  eq('1 eaten -> cycle 1, 1/30', shape(1), [1, 1, 29, false]);
  eq('29 eaten -> cycle 1, 29/30', shape(29), [1, 29, 1, false]);
  eq('30 eaten -> cycle 2, 0/30 and cycle 1 complete', shape(30), [2, 0, 30, true]);
  eq('31 eaten -> cycle 2, 1/30', shape(31), [2, 1, 29, false]);
  eq('59 eaten -> cycle 2, 29/30', shape(59), [2, 29, 1, false]);
  eq('60 eaten -> cycle 3, 0/30 and cycle 2 complete', shape(60), [3, 0, 30, true]);
  eq('61 eaten -> cycle 3, 1/30', shape(61), [3, 1, 29, false]);
  eq('91 eaten -> 3 cycles completed', buildCycle(91).completedCycles, 3);
  eq('nonsense input is treated as zero', shape(-12), [1, 0, 30, false]);

  // The frontend must agree with the backend, or the same day would show two
  // different numbers online and offline.
  const backendPath = path.resolve(harness.ROOT, '..', 'backend', 'src', 'utils', 'mealStats.js');

  if (fsp.existsSync(backendPath)) {
    const backend = require(backendPath);
    let identical = true;

    for (let eaten = 0; eaten <= 150; eaten += 1) {
      if (JSON.stringify(buildCycle(eaten)) !== JSON.stringify(backend.buildCycle(eaten))) {
        identical = false;
        break;
      }
    }

    check('frontend and backend agree on every count from 0 to 150', identical);
  } else {
    check('backend/src/utils/mealStats.js is available for the parity check', false, backendPath);
  }

  /* ---- counting real records ---- */

  const recordList = (breakfastEaten, dinnerEaten) => {
    const list = [];
    const length = Math.max(breakfastEaten, dinnerEaten);

    for (let index = 0; index < length; index += 1) {
      list.push({
        date: daysAgo(index + 1),
        breakfast: index < breakfastEaten ? 'eaten' : 'not_eaten',
        dinner: index < dinnerEaten ? 'eaten' : 'not_eaten',
      });
    }

    return list;
  };

  const mixed = buildUserStats(recordList(20, 7), { joinDate: daysAgo(40), today });
  eq('20 breakfasts -> 20/30', [mixed.breakfast.currentCycle, mixed.breakfast.eatenInCurrentCycle], [1, 20]);
  eq('7 dinners -> 7/30 at the very same time', [mixed.dinner.currentCycle, mixed.dinner.eatenInCurrentCycle], [1, 7]);
  check(
    'breakfast and dinner are never added together',
    mixed.totalBreakfastEaten === 20 && mixed.totalDinnerEaten === 7,
  );

  const notEaten = buildUserStats([{ date: today, breakfast: 'not_eaten', dinner: 'not_eaten' }], {});
  eq('NOT EATEN counts for nothing (breakfast)', notEaten.breakfast.eatenInCurrentCycle, 0);
  eq('NOT EATEN counts for nothing (dinner)', notEaten.dinner.eatenInCurrentCycle, 0);

  const missing = buildUserStats([], {});
  eq(
    'NOT RECORDED counts for nothing',
    [missing.breakfast.eatenInCurrentCycle, missing.dinner.eatenInCurrentCycle],
    [0, 0],
  );

  const ranged = buildUserStats(
    [
      { date: '2026-08-01', breakfast: 'eaten', dinner: 'eaten' },
      { date: '2026-09-10', breakfast: 'eaten' },
      { date: '2026-09-11', dinner: 'eaten' },
    ],
    { joinDate: '2026-09-01', today: '2026-09-30' },
  );
  eq('a record before joinDate is not counted (breakfast)', ranged.breakfast.eatenInCurrentCycle, 1);
  eq('a record before joinDate is not counted (dinner)', ranged.dinner.eatenInCurrentCycle, 1);
  eq('only records inside the range are counted at all', ranged.countedRecords, 2);

  /* ---------------------------------------------------------------- */
  section('6. Home reads this device with no network at all');
  /* ---------------------------------------------------------------- */

  harness.network.reset();

  const empty = await summaryFor(LOCAL_ID, '');

  eq('a brand new member has no record for today', empty.meal, null);
  eq(
    '...which the app shows as NOT RECORDED',
    app.mealStatus.statusLabel(empty.meal ? empty.meal.breakfast : null),
    'NOT RECORDED',
  );
  eq(
    'breakfast starts at cycle 1, 0/30',
    [empty.breakfast.currentCycle, empty.breakfast.eatenInCurrentCycle, empty.breakfast.remaining],
    [1, 0, 30],
  );
  eq(
    'dinner starts at cycle 1, 0/30',
    [empty.dinner.currentCycle, empty.dinner.eatenInCurrentCycle, empty.dinner.remaining],
    [1, 0, 30],
  );
  eq('nothing is waiting to upload', empty.pending, 0);
  eq('opening Home offline made ZERO network calls', harness.network.count(), 0);

  /* ---------------------------------------------------------------- */
  section('7. Marking breakfast and dinner with no network');
  /* ---------------------------------------------------------------- */

  const joinDate = daysAgo(40);

  const firstMark = await mark(LOCAL_ID, today, 'breakfast', 'eaten', joinDate);
  eq('an offline tap is written to the device', firstMark.meal.breakfast, 'eaten');
  eq('an offline tap is queued for upload', firstMark.queued, true);
  eq('an offline tap reports "not synced yet"', firstMark.synced, false);
  eq('an offline tap is not an error', firstMark.message, null);
  eq('an offline tap never even attempts the upload', harness.network.calls().length, 0);

  const afterBreakfast = await summaryFor(LOCAL_ID, joinDate);
  eq('Home shows breakfast EATEN', app.mealStatus.statusLabel(afterBreakfast.meal.breakfast), 'EATEN');
  eq(
    'dinner is still NOT RECORDED',
    app.mealStatus.statusLabel(afterBreakfast.meal.dinner),
    'NOT RECORDED',
  );
  eq('the breakfast cycle counts it', afterBreakfast.breakfast.eatenInCurrentCycle, 1);
  eq('the dinner cycle is untouched', afterBreakfast.dinner.eatenInCurrentCycle, 0);
  eq('the change is waiting to upload', afterBreakfast.pending, 1);
  eq('and Home knows it is today that is waiting', afterBreakfast.pendingToday, true);

  await mark(LOCAL_ID, today, 'dinner', 'eaten', joinDate);
  const afterDinner = await summaryFor(LOCAL_ID, joinDate);

  eq('marking dinner does NOT reset breakfast', afterDinner.meal.breakfast, 'eaten');
  eq('dinner is now EATEN as well', afterDinner.meal.dinner, 'eaten');
  eq(
    'the two cycles move independently',
    [afterDinner.breakfast.eatenInCurrentCycle, afterDinner.dinner.eatenInCurrentCycle],
    [1, 1],
  );
  eq('one day is still one queued item', afterDinner.pending, 1);

  await mark(LOCAL_ID, today, 'breakfast', 'not_eaten', joinDate);
  const changed = await summaryFor(LOCAL_ID, joinDate);

  eq('breakfast can be changed to NOT EATEN', app.mealStatus.statusLabel(changed.meal.breakfast), 'NOT EATEN');
  eq('changing breakfast does NOT reset dinner', changed.meal.dinner, 'eaten');
  eq('NOT EATEN stops counting towards breakfast', changed.breakfast.eatenInCurrentCycle, 0);
  eq('the dinner count is unaffected', changed.dinner.eatenInCurrentCycle, 1);
  eq('one day is still one stored record', changed.records, 1);

  /* ---------------------------------------------------------------- */
  section('8. A real 30-meal breakfast cycle, and the one after it');
  /* ---------------------------------------------------------------- */

  const CYCLE_USER = '65f10000000000000000cc02';
  const cycleJoin = daysAgo(70);

  const cycleDays = [];
  for (let back = 30; back >= 0; back -= 1) cycleDays.push(daysAgo(back)); // 31 days, ending today

  let at29 = null;
  let at30 = null;
  let at31 = null;

  for (let index = 0; index < cycleDays.length; index += 1) {
    await mark(CYCLE_USER, cycleDays[index], 'breakfast', 'eaten', cycleJoin);

    if (index === 28) at29 = await summaryFor(CYCLE_USER, cycleJoin);
    if (index === 29) at30 = await summaryFor(CYCLE_USER, cycleJoin);
    if (index === 30) at31 = await summaryFor(CYCLE_USER, cycleJoin);
  }

  eq(
    '29 eaten -> cycle 1, 29/30',
    [at29.breakfast.currentCycle, at29.breakfast.eatenInCurrentCycle, at29.breakfast.remaining],
    [1, 29, 1],
  );
  eq(
    '30 eaten -> cycle 2, 0/30',
    [at30.breakfast.currentCycle, at30.breakfast.eatenInCurrentCycle, at30.breakfast.remaining],
    [2, 0, 30],
  );
  eq('30 eaten means cycle 1 is complete', [at30.breakfast.cycleComplete, at30.breakfast.completedCycles], [true, 1]);
  eq(
    '31 eaten -> cycle 2, 1/30',
    [at31.breakfast.currentCycle, at31.breakfast.eatenInCurrentCycle],
    [2, 1],
  );
  eq(
    'the dinner cycle never moved',
    [at31.dinner.currentCycle, at31.dinner.eatenInCurrentCycle],
    [1, 0],
  );
  eq('no record was deleted when the cycle completed', (await app.storage.getLocalMeals(CYCLE_USER)).length, 31);
  eq('the whole history is still counted', at31.breakfast.totalEaten, 31);
  eq('every day is still on the device', at31.records, 31);

  // 60 eaten -> cycle 3, 0/30, through the very same code path Home uses.
  const sixtyDays = [];
  for (let back = 59; back >= 0; back -= 1) sixtyDays.push({ date: daysAgo(back), breakfast: 'eaten' });
  await app.storage.mergeLocalMeals(CYCLE_USER, sixtyDays);

  const at60 = await summaryFor(CYCLE_USER, cycleJoin);
  eq(
    '60 eaten -> cycle 3, 0/30',
    [at60.breakfast.currentCycle, at60.breakfast.eatenInCurrentCycle, at60.breakfast.remaining],
    [3, 0, 30],
  );
  eq('60 eaten means two cycles are complete', at60.breakfast.completedCycles, 2);
  eq('60 days are stored', at60.records, 60);

  await mark(CYCLE_USER, daysAgo(60), 'breakfast', 'eaten', cycleJoin);
  const at61 = await summaryFor(CYCLE_USER, cycleJoin);

  eq(
    '61 eaten -> cycle 3, 1/30',
    [at61.breakfast.currentCycle, at61.breakfast.eatenInCurrentCycle],
    [3, 1],
  );
  eq('61 days are stored - nothing was ever deleted', at61.records, 61);
  eq('the dinner cycle is STILL 0/30', at61.dinner.eatenInCurrentCycle, 0);

  /* ---------------------------------------------------------------- */
  section('9. Broken data, joinDate changes and logout');
  /* ---------------------------------------------------------------- */

  const BROKEN_ID = '65f10000000000000000cc03';
  const JUNK_ID = '65f10000000000000000cc04';

  device.writeRaw(app.storage.STORAGE_KEYS.mealsFor(BROKEN_ID), '{ this is not json');
  const broken = await summaryFor(BROKEN_ID, '');

  eq('unreadable local data does not throw', broken.meal, null);
  eq(
    '...and reads as 0/30 instead of crashing the screen',
    [broken.breakfast.eatenInCurrentCycle, broken.dinner.eatenInCurrentCycle],
    [0, 0],
  );
  check(
    'the unreadable value was not wiped',
    device.keys().includes(app.storage.STORAGE_KEYS.mealsFor(BROKEN_ID)),
  );

  device.writeRaw(
    app.storage.STORAGE_KEYS.mealsFor(JUNK_ID),
    JSON.stringify([
      null,
      'x',
      42,
      { date: 'nope' },
      { date: today, breakfast: 'eaten', dinner: 'not_eaten' },
    ]),
  );

  const junk = await summaryFor(JUNK_ID, '');
  eq(
    'junk entries are ignored and the real one is kept',
    [junk.records, junk.breakfast.eatenInCurrentCycle, junk.dinner.eatenInCurrentCycle],
    [1, 1, 0],
  );
  eq('and today still reads as EATEN', app.mealStatus.statusLabel(junk.meal.breakfast), 'EATEN');

  /* ---- joinDate is the ONLY tracking boundary ---- */

  // One older tracked day, so "moving joinDate forward" has something real to
  // stop counting: it sits inside the original range (joinDate -> today) and
  // outside the new one. Marking it is allowed while joinDate is daysAgo(40).
  await mark(LOCAL_ID, daysAgo(3), 'breakfast', 'eaten', joinDate);

  const storedBefore = await app.storage.getLocalMeals(LOCAL_ID);
  const movedJoin = await summaryFor(LOCAL_ID, today);

  eq(
    'moving joinDate forward deletes nothing',
    (await app.storage.getLocalMeals(LOCAL_ID)).length,
    storedBefore.length,
  );
  eq(
    'and does not rewrite the record either',
    (await app.storage.getLocalMeal(LOCAL_ID, today)).dinner,
    'eaten',
  );
  check('older days simply stop counting', movedJoin.countedRecords < storedBefore.length);

  let refused = null;
  try {
    await mark(LOCAL_ID, daysAgo(3), 'breakfast', 'eaten', today);
  } catch (error) {
    refused = error.message;
  }
  check(
    'marking a day before the joinDate is refused',
    typeof refused === 'string' && refused.includes('join date'),
    String(refused),
  );
  eq(
    'the refused mark created nothing',
    (await app.storage.getLocalMeals(LOCAL_ID)).length,
    storedBefore.length,
  );

  /* ---- logout ---- */

  await app.storage.saveLocalUser({
    id: LOCAL_ID,
    username: 'Sahil Dubey',
    email: 'sahil@example.com',
    joinDate: '2026-09-01',
    password: 'hunter2-must-never-be-stored',
    token: 'must-never-be-stored-either',
  });

  const sessionRaw = device.entries().find(([key]) => key === app.storage.STORAGE_KEYS.user)[1];

  eq('only the four session fields are written to the device', JSON.parse(sessionRaw), {
    id: LOCAL_ID,
    username: 'Sahil Dubey',
    email: 'sahil@example.com',
    joinDate: '2026-09-01',
  });
  check('no password or token text is on the device', !/(password|hunter2|token)/i.test(sessionRaw));

  await app.storage.clearLocalUser();
  eq('logout removes the session', await app.storage.getLocalUser(), null);
  eq(
    'logout keeps the meal records',
    (await app.storage.getLocalMeals(LOCAL_ID)).length,
    storedBefore.length,
  );

  const afterLogout = await summaryFor(LOCAL_ID, joinDate);
  eq('and Home still opens for that user afterwards', afterLogout.records, storedBefore.length);

  /* ---------------------------------------------------------------- */
  section('10. Nothing in Phase 3 needs the internet');
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

