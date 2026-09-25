/**
 * MessMate - PHASE 2 tests (offline-first services + real API round trips).
 *
 * HOW THIS RUNS
 * -------------
 * The frontend is an Expo app, so its source is ESM. To exercise the SERVICE
 * layer in plain Node, this file compiles only `src/services` + `src/utils`
 * to CommonJS using the Babel that Expo already ships, then loads them with
 * exactly two stand-ins:
 *
 *   - an in-memory AsyncStorage, so a fake "device" can be created and later
 *     RESTARTED (a fresh module registry on the same storage) to prove that
 *     the session survives an app restart;
 *   - a pass-through axios whose network can be switched OFF on demand, so
 *     the same code path can be tested online and offline.
 *
 * Nothing else is faked. While "online" these tests talk to the REAL backend
 * on http://127.0.0.1:5000/api, which is how signup, login, upload and
 * download are verified end to end.
 *
 * Run:  node tests/phase2.test.js
 *       (start the backend first - see the root README)
 */

'use strict';

const fs = require('fs');
const Module = require('module');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BUILD_DIR = path.join(ROOT, '.phase2-build');
const API_URL = process.env.PHASE2_API_URL || 'http://127.0.0.1:5000/api';

process.env.EXPO_PUBLIC_API_URL = API_URL;

/* ------------------------------------------------------------------ */
/* 1. Compile the services to CommonJS                                 */
/* ------------------------------------------------------------------ */

const babel = require('@babel/core');
const cjsPlugin = require.resolve('@babel/plugin-transform-modules-commonjs');

const SOURCES = [
  'src/utils/date.js',
  'src/utils/cycle.js',
  // Added in Phase 4: `services/meals.js` now also builds the Meals history,
  // so its pure builder has to be compiled alongside it. Nothing this suite
  // asserts changed - this list only says WHAT gets compiled.
  'src/utils/mealHistory.js',
  'src/services/api.js',
  'src/services/storage.js',
  'src/services/sync.js',
  'src/services/meals.js',
];

function buildSources() {
  fs.rmSync(BUILD_DIR, { recursive: true, force: true });

  for (const relative of SOURCES) {
    const output = path.join(BUILD_DIR, relative);
    fs.mkdirSync(path.dirname(output), { recursive: true });

    const result = babel.transformFileSync(path.join(ROOT, relative), {
      cwd: ROOT,
      root: ROOT,
      plugins: [cjsPlugin],
      babelrc: false,
      configFile: false,
    });

    fs.writeFileSync(output, result.code, 'utf8');
  }
}

/* ------------------------------------------------------------------ */
/* 2. Stand-ins: AsyncStorage, axios, expo-constants                   */
/* ------------------------------------------------------------------ */

/** The network can be switched off, to simulate being on a train. */
let OFFLINE = false;
let networkCalls = [];

function createAxiosStub() {
  const realAxios = require('axios');

  function create(config) {
    const instance = realAxios.create(config);

    const wrap = (method) => async (...args) => {
      networkCalls.push({ method, url: String(args[0]) });

      if (OFFLINE) {
        // Shaped like a real axios network failure: there is no `.response`.
        const error = new Error('Network Error');
        error.code = 'ERR_NETWORK';
        error.request = {};
        throw error;
      }

      return instance[method](...args);
    };

    return {
      defaults: instance.defaults,
      interceptors: instance.interceptors,
      get: wrap('get'),
      post: wrap('post'),
      patch: wrap('patch'),
    };
  }

  return { ...realAxios, create };
}

const axiosStub = createAxiosStub();
const constantsStub = { expoConfig: null, expoGoConfig: null, manifest2: null };

/** One fake phone: its disk survives an app restart, its RAM does not. */
let currentDevice = null;

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === '@react-native-async-storage/async-storage') return currentDevice.storage;
  if (request === 'axios') return axiosStub;
  if (request === 'expo-constants') return constantsStub;
  return originalLoad.call(this, request, parent, isMain);
};

function createDevice() {
  const store = new Map();

  const storage = {
    async getItem(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async setItem(key, value) {
      store.set(key, String(value));
    },
    async removeItem(key) {
      store.delete(key);
    },
    async getAllKeys() {
      return [...store.keys()];
    },
    async clear() {
      store.clear();
    },
  };

  return { storage, entries: () => [...store.entries()], keys: () => [...store.keys()] };
}

/**
 * Load the compiled services as a fresh app instance.
 * Calling this twice on the same device === closing and reopening the app.
 */
function launch(device) {
  currentDevice = device;

  for (const relative of SOURCES) {
    delete require.cache[require.resolve(path.join(BUILD_DIR, relative))];
  }

  return {
    date: require(path.join(BUILD_DIR, 'src/utils/date.js')),
    api: require(path.join(BUILD_DIR, 'src/services/api.js')),
    storage: require(path.join(BUILD_DIR, 'src/services/storage.js')),
    sync: require(path.join(BUILD_DIR, 'src/services/sync.js')),
    meals: require(path.join(BUILD_DIR, 'src/services/meals.js')),
  };
}

/* ------------------------------------------------------------------ */
/* 3. Tiny test reporter                                               */
/* ------------------------------------------------------------------ */

let passed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ok    ${name}`);
    return true;
  }

  failures.push(name);
  console.log(`  FAIL  ${name}${detail ? ` -> ${detail}` : ''}`);
  return false;
}

function eq(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  return check(name, a === e, `expected ${e}, got ${a}`);
}

function section(title) {
  console.log(`\n${title}`);
}

function goOffline(app) {
  OFFLINE = true;
  app.sync.forgetOnlineState();
}

function goOnline(app) {
  OFFLINE = false;
  app.sync.forgetOnlineState();
}

function resetNetworkLog() {
  networkCalls = [];
}

/* ------------------------------------------------------------------ */
/* 4. Tests                                                            */
/* ------------------------------------------------------------------ */

// Accounts created by the online tests carry this suffix, exactly like the
// Phase 1 backend tests, so they are obvious and easy to remove.
const TEST_SUFFIX = '_phase2test';

const LOCAL_ID = '65f00000000000000000aa01';
const LOCAL_ID_2 = '65f00000000000000000aa02';

let app = null;
let device = null;

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return app.date.toDateString(date);
}

async function main() {
  console.log('PHASE 2 FRONTEND TESTS');
  console.log('======================');
  console.log(`API under test : ${API_URL}`);
  console.log('NOTE: the online tests below CREATE throwaway users whose names end');
  console.log(`      with "${TEST_SUFFIX}". Point the backend at a TEST database.`);

  buildSources();

  device = createDevice();
  app = launch(device);

  /* ---------------------------------------------------------------- */
  section('1. Files and dependencies present');
  /* ---------------------------------------------------------------- */

  const EXPECTED_FILES = [
    'App.js',
    'src/utils/date.js',
    'src/services/api.js',
    'src/services/storage.js',
    'src/services/sync.js',
    'src/services/meals.js',
    'src/context/AuthContext.js',
    'src/components/AppTextField.js',
    'src/components/PrimaryButton.js',
    'src/components/MessageBanner.js',
    'src/components/AuthScaffold.js',
    'src/components/JoinDateField.js',
    'src/navigation/AuthNavigator.js',
    'src/navigation/AppNavigator.js',
    'src/screens/LoginScreen.js',
    'src/screens/SignupScreen.js',
    'src/screens/HomeScreen.js',
  ];

  for (const relative of EXPECTED_FILES) {
    check(`exists: ${relative}`, fs.existsSync(path.join(ROOT, relative)));
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const deps = pkg.dependencies || {};

  for (const name of [
    'expo',
    'react-native',
    'react',
    '@react-navigation/native',
    '@react-navigation/native-stack',
    '@react-native-async-storage/async-storage',
    '@react-native-community/datetimepicker',
    'axios',
  ]) {
    check(`dependency declared: ${name}`, Boolean(deps[name]));
  }

  check('no banned state library was added', !deps['redux'] && !deps['@reduxjs/toolkit']);
  check('no database library was added', !deps['realm'] && !deps['@nozbe/watermelondb']);
  check('no netinfo package was added', !deps['@react-native-community/netinfo']);
  check('expo-constants is still available for api.js', Boolean(deps['expo-constants']));

  /* ---------------------------------------------------------------- */
  section('2. Date helpers match the backend contract');
  /* ---------------------------------------------------------------- */

  const today = app.date.todayString();
  check('todayString is YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(today), today);
  check('todayString uses LOCAL calendar parts', today === daysAgo(0), today);

  check('accepts a real date', app.date.isRealDateString('2026-09-23'));
  check('rejects 2026-02-31', !app.date.isRealDateString('2026-02-31'));
  check('rejects 2026-2-5', !app.date.isRealDateString('2026-2-5'));
  check('rejects a Date object', !app.date.isRealDateString(new Date()));
  check('rejects garbage', !app.date.isRealDateString('yesterday'));

  eq(
    'a picker round trip never shifts the day (timezone safety)',
    app.date.toDateString(app.date.toDateObject('2026-09-05')),
    '2026-09-05',
  );
  eq('display format matches the designs', app.date.formatDisplayDate('2026-09-05'), '05 September 2026');
  check('today is not a future date', !app.date.isFutureDateString(today));
  check('past dates are not future', !app.date.isFutureDateString(daysAgo(1)));

  /* ---------------------------------------------------------------- */
  section('3. Local session storage (no secrets)');
  /* ---------------------------------------------------------------- */

  const serverUser = {
    id: LOCAL_ID,
    username: 'localuser',
    email: 'local@example.com',
    joinDate: '2026-09-01',
    password: 'SuperSecret123', // deliberately present - must never be stored
    token: 'should-never-be-stored',
  };

  const saved = await app.storage.saveLocalUser(serverUser);
  eq('only the four session fields are kept', Object.keys(saved).sort(), [
    'email',
    'id',
    'joinDate',
    'username',
  ]);

  const rawSession = JSON.stringify(device.entries());
  check('the password never reaches the device', !rawSession.includes('SuperSecret123'));
  check('the word "password" never appears in storage', !rawSession.includes('password'));
  check('no token is stored', !rawSession.includes('should-never-be-stored'));

  const restoredUser = await app.storage.getLocalUser();
  eq('the session can be read back', restoredUser.id, LOCAL_ID);
  eq('joinDate is part of the session', restoredUser.joinDate, '2026-09-01');

  /* ---------------------------------------------------------------- */
  section('4. Local meal store - one record per userId + date');
  /* ---------------------------------------------------------------- */

  const D1 = '2026-09-23';
  const D2 = '2026-09-22';
  const D3 = '2026-09-21';

  await app.storage.saveLocalMeal({ userId: LOCAL_ID, date: D1, breakfast: 'eaten' });

  let day = await app.storage.getLocalMeal(LOCAL_ID, D1);
  eq('the meal that was set is stored', day.breakfast, 'eaten');
  eq('a brand new day defaults the other meal like the backend', day.dinner, 'not_eaten');
  eq('_id stays null until the server has seen the day', day._id, null);
  eq('a day that was never recorded returns null', await app.storage.getLocalMeal(LOCAL_ID, '2020-01-01'), null);

  // THE SYNC SAFETY RULE: changing one meal must never reset the other.
  await app.storage.updateLocalMeal(LOCAL_ID, D1, { dinner: 'eaten' });

  const afterDinner = await app.storage.getLocalMeals(LOCAL_ID);
  eq('still exactly one record for the day', afterDinner.length, 1);
  eq('breakfast survived the dinner change', afterDinner[0].breakfast, 'eaten');
  eq('dinner changed', afterDinner[0].dinner, 'eaten');

  await app.storage.updateLocalMeal(LOCAL_ID, D1, { breakfast: 'not_eaten' });
  const afterBreakfast = await app.storage.getLocalMeal(LOCAL_ID, D1);
  eq('dinner survived the breakfast change', afterBreakfast.dinner, 'eaten');
  eq('breakfast changed', afterBreakfast.breakfast, 'not_eaten');

  for (const value of ['eaten', 'not_eaten', 'eaten', 'eaten']) {
    await app.storage.updateLocalMeal(LOCAL_ID, D1, { breakfast: value });
  }
  eq('repeated writes never duplicate the day', (await app.storage.getLocalMeals(LOCAL_ID)).length, 1);

  let rejected = false;
  try {
    await app.storage.saveLocalMeal({ userId: LOCAL_ID, date: '2026-09-19', breakfast: 'not_recorded' });
  } catch (error) {
    rejected = true;
  }
  check('"not_recorded" is rejected - a missing record means NOT RECORDED', rejected);

  let emptyRejected = false;
  try {
    await app.storage.saveLocalMeal({ userId: LOCAL_ID, date: '2026-09-19' });
  } catch (error) {
    emptyRejected = true;
  }
  check('a day with no meal decision is rejected', emptyRejected);

  await app.storage.saveLocalMeal({ userId: LOCAL_ID, date: D2, dinner: 'eaten' });
  await app.storage.saveLocalMeal({ userId: LOCAL_ID_2, date: D1, breakfast: 'eaten' });

  eq(
    'records are kept per user and never mixed',
    (await app.storage.getLocalMeals(LOCAL_ID)).length,
    2,
  );
  eq(
    'the other user has their own single record',
    (await app.storage.getLocalMeals(LOCAL_ID_2)).length,
    1,
  );

  const beforeMerge = (await app.storage.getLocalMeals(LOCAL_ID)).length;
  await app.storage.mergeLocalMeals(LOCAL_ID, [
    { _id: 'srv-9', date: D3, breakfast: 'not_eaten', dinner: 'eaten' },
    { _id: 'srv-1', date: D1, breakfast: 'eaten', dinner: 'eaten' },
  ]);

  const afterMerge = await app.storage.getLocalMeals(LOCAL_ID);
  eq('a download adds the day it knows about', afterMerge.length, beforeMerge + 1);
  check('a download never deletes days it did not send', afterMerge.length === beforeMerge + 1);
  eq('the merge stored the server id', afterMerge.find((m) => m.date === D1)._id, 'srv-1');
  eq('records come back oldest first', afterMerge.map((m) => m.date), [D3, D2, D1].sort());

  /* ---------------------------------------------------------------- */
  section('5. Pending sync queue - one item per date');
  /* ---------------------------------------------------------------- */

  await app.storage.savePendingSync(LOCAL_ID, { date: D1, breakfast: 'eaten' });
  await app.storage.savePendingSync(LOCAL_ID, { date: D1, dinner: 'eaten' });

  const queue = await app.storage.getPendingSync(LOCAL_ID);
  eq('two changes on one date = one queued item', queue.length, 1);
  eq('both meals are inside that single item', [queue[0].breakfast, queue[0].dinner], [
    'eaten',
    'eaten',
  ]);
  check('a queued item records when it was queued', typeof queue[0].at === 'string');

  await app.storage.savePendingSync(LOCAL_ID, { date: D2, breakfast: 'not_eaten' });
  eq('a second date adds a second item', (await app.storage.getPendingSync(LOCAL_ID)).length, 2);

  await app.storage.clearPendingSync(LOCAL_ID, D1);
  const afterClearOne = await app.storage.getPendingSync(LOCAL_ID);
  eq('clearing one date leaves the other', afterClearOne.map((item) => item.date), [D2]);

  await app.storage.clearPendingSync(LOCAL_ID);
  eq('clearing everything empties the queue', (await app.storage.getPendingSync(LOCAL_ID)).length, 0);

  /* ---------------------------------------------------------------- */
  section('6. Offline behaviour - meals saved with no internet');
  /* ---------------------------------------------------------------- */

  goOffline(app);
  resetNetworkLog();

  eq('isOnline() reports false when nothing can be reached', await app.sync.isOnline(), false);

  const OFFLINE_DAY = daysAgo(2);

  const offlineMark = await app.meals.markMeal({
    userId: LOCAL_ID,
    date: OFFLINE_DAY,
    meal: 'breakfast',
    status: 'eaten',
    joinDate: '2026-09-01',
  });

  eq('the tap is saved on the device even offline', offlineMark.meal.breakfast, 'eaten');
  check('an offline change is queued for upload', offlineMark.queued === true);
  check('an offline change is not pretended to be synced', offlineMark.synced === false);
  eq(
    'the offline day is stored locally',
    (await app.storage.getLocalMeal(LOCAL_ID, OFFLINE_DAY)).breakfast,
    'eaten',
  );
  eq('the offline day is queued once', (await app.storage.getPendingSync(LOCAL_ID)).length, 1);

  // Second meal, same day, still offline.
  await app.meals.markMeal({
    userId: LOCAL_ID,
    date: OFFLINE_DAY,
    meal: 'dinner',
    status: 'eaten',
    joinDate: '2026-09-01',
  });

  const offlineDay = await app.storage.getLocalMeal(LOCAL_ID, OFFLINE_DAY);
  eq('the offline dinner did not reset breakfast', offlineDay.breakfast, 'eaten');
  eq('the offline dinner was saved', offlineDay.dinner, 'eaten');

  const queueItem = (await app.storage.getPendingSync(LOCAL_ID))[0];
  eq('both offline meals share one queued item', (await app.storage.getPendingSync(LOCAL_ID)).length, 1);
  eq('the queued item carries both meals', [queueItem.breakfast, queueItem.dinner], ['eaten', 'eaten']);

  // Reading local data must never touch the network.
  resetNetworkLog();
  const offlineRead = await app.meals.getMeals(LOCAL_ID);
  const offlineQueue = await app.storage.getPendingSync(LOCAL_ID);
  check('reading local meals makes zero network calls', networkCalls.length === 0, JSON.stringify(networkCalls));
  check('local meals are readable offline', offlineRead.length >= 3, String(offlineRead.length));
  eq('the queue is readable offline', offlineQueue.length, 1);

  // Refused before anything is written.
  let futureRefused = false;
  try {
    await app.meals.markMeal({
      userId: LOCAL_ID,
      date: daysAgo(-1),
      meal: 'breakfast',
      status: 'eaten',
    });
  } catch (error) {
    futureRefused = true;
  }
  check('a future date is refused', futureRefused);

  let beforeJoinRefused = false;
  try {
    await app.meals.markMeal({
      userId: LOCAL_ID,
      date: '2026-08-01',
      meal: 'breakfast',
      status: 'eaten',
      joinDate: '2026-09-01',
    });
  } catch (error) {
    beforeJoinRefused = true;
  }
  check('a date before the join date is refused', beforeJoinRefused);

  let badStatusRefused = false;
  try {
    await app.meals.markMeal({
      userId: LOCAL_ID,
      date: OFFLINE_DAY,
      meal: 'lunch',
      status: 'eaten',
    });
  } catch (error) {
    badStatusRefused = true;
  }
  check('an unknown meal type is refused', badStatusRefused);

  // A sync attempted offline must be honest, quick and harmless.
  const offlineSync = await app.sync.syncUserData(LOCAL_ID);
  check('an offline sync does not claim success', offlineSync.ok === false && offlineSync.online === false);
  check('an offline sync explains itself', typeof offlineSync.message === 'string' && offlineSync.message.length > 0, offlineSync.message);
  eq('an offline sync leaves the queue untouched', (await app.storage.getPendingSync(LOCAL_ID)).length, 1);

  /* ---------------------------------------------------------------- */
  section('7. App restart - session and meals survive');
  /* ---------------------------------------------------------------- */

  resetNetworkLog();

  // Closing and reopening the app: same device, brand new module registry.
  app = launch(device);

  const restoredSession = await app.storage.getLocalUser();
  eq('the session is restored from the device', restoredSession?.id, LOCAL_ID);
  check('meal records survived the restart', (await app.storage.getLocalMeals(LOCAL_ID)).length >= 3);
  eq('queued changes survived the restart', (await app.storage.getPendingSync(LOCAL_ID)).length, 1);
  check('restoring the session needed no network at all', networkCalls.length === 0, JSON.stringify(networkCalls));
  check('a restored session is enough to enter the app', Boolean(restoredSession?.id && restoredSession?.username));

  /* ---------------------------------------------------------------- */
  section('8. Online round trip - signup, login, upload, download');
  /* ---------------------------------------------------------------- */

  goOnline(app);

  const backendUp = await app.sync.isOnline();
  check(`the backend is reachable at ${API_URL}`, backendUp);

  if (!backendUp) {
    console.log('\n!! The MessMate API could not be reached.');
    console.log('!! Start the backend (pointed at a TEST database), then re-run.');
    console.log('!! The online sections were skipped.');
    return; // finish() still runs once, from .then() below
  }

  const stamp = Date.now();
  const username = `phase2${stamp}${TEST_SUFFIX}`;
  const email = `phase2${stamp}${TEST_SUFFIX}@example.com`;
  const password = 'plaintext-by-design';
  const joinDate = daysAgo(40);

  const created = await app.api.registerUser({ username, email, password, joinDate });
  check('signup returns a new user id', typeof created.id === 'string' && created.id.length > 0);
  eq('signup returns the username', created.username, username);
  eq('signup returns the email', created.email, email);
  eq('signup returns the join date', created.joinDate, joinDate);
  check('signup never returns the password', created.password === undefined);

  const storedSession = await app.storage.saveLocalUser(created);
  eq('the new session is stored on the device', (await app.storage.getLocalUser()).id, created.id);
  eq('the stored session has exactly four fields', Object.keys(storedSession).sort(), [
    'email',
    'id',
    'joinDate',
    'username',
  ]);

  const byUsername = await app.api.loginUser({ identifier: username, password });
  eq('login with the username works', byUsername.id, created.id);
  const byEmail = await app.api.loginUser({ identifier: email, password });
  eq('login with the email works', byEmail.id, created.id);

  let wrongPassword = null;
  try {
    await app.api.loginUser({ identifier: username, password: 'definitely-wrong' });
  } catch (error) {
    wrongPassword = error;
  }
  eq('a wrong password is a 401', wrongPassword?.response?.status, 401);
  eq(
    'a wrong password shows a friendly message',
    app.api.getErrorMessage(wrongPassword),
    'Incorrect username/email or password.',
  );
  check(
    'a rejected login is not mistaken for being offline',
    app.api.isNetworkError(wrongPassword) === false,
  );

  let duplicateUsername = null;
  try {
    await app.api.registerUser({
      username,
      email: `other${stamp}@example.com`,
      password,
      joinDate,
    });
  } catch (error) {
    duplicateUsername = error;
  }
  eq('a duplicate username is a 409', duplicateUsername?.response?.status, 409);
  eq(
    'a duplicate username says so',
    app.api.getErrorMessage(duplicateUsername),
    'That username is already taken.',
  );

  let duplicateEmail = null;
  try {
    await app.api.registerUser({ username: `${username}x`, email, password, joinDate });
  } catch (error) {
    duplicateEmail = error;
  }
  eq('a duplicate email is a 409', duplicateEmail?.response?.status, 409);
  eq(
    'a duplicate email says so',
    app.api.getErrorMessage(duplicateEmail),
    'That email is already registered.',
  );

  let futureJoin = null;
  try {
    await app.api.registerUser({
      username: `future${stamp}${TEST_SUFFIX}`,
      email: `future${stamp}@example.com`,
      password,
      joinDate: daysAgo(-5),
    });
  } catch (error) {
    futureJoin = error;
  }
  eq('a future join date is refused by the server', futureJoin?.response?.status, 400);

  /* ---- upload a day while online ---- */

  const realId = created.id;
  const uploadDay = daysAgo(3);

  const onlineMark = await app.meals.markMeal({
    userId: realId,
    date: uploadDay,
    meal: 'breakfast',
    status: 'eaten',
    joinDate,
  });
  check('an online tap uploads immediately', onlineMark.synced === true);
  eq('nothing is left queued after an online tap', (await app.storage.getPendingSync(realId)).length, 0);

  const remoteOne = await app.api.fetchMealRecords(realId);
  eq('the server holds the day', remoteOne.count, 1);
  eq('the server stored breakfast', remoteOne.meals[0].breakfast, 'eaten');
  eq('the server stored the untouched meal too', remoteOne.meals[0].dinner, 'not_eaten');
  eq('the server record is tagged with the user', remoteOne.meals[0].userId, realId);
  eq('the join date comes back with the records', remoteOne.joinDate, joinDate);
  eq(
    'the server id was written into local storage',
    (await app.storage.getLocalMeal(realId, uploadDay))._id,
    remoteOne.meals[0]._id,
  );

  /* ---- the headline safety rule, online ---- */

  await app.meals.markMeal({
    userId: realId,
    date: uploadDay,
    meal: 'dinner',
    status: 'eaten',
    joinDate,
  });

  const localBoth = await app.storage.getLocalMeal(realId, uploadDay);
  eq('breakfast survived the dinner change on the device', localBoth.breakfast, 'eaten');
  eq('dinner was updated on the device', localBoth.dinner, 'eaten');

  const remoteBoth = await app.api.fetchMealRecords(realId);
  eq('breakfast survived the dinner change on the server', remoteBoth.meals[0].breakfast, 'eaten');
  eq('dinner was updated on the server', remoteBoth.meals[0].dinner, 'eaten');
  eq('the server still has exactly one record for that day', remoteBoth.count, 1);

  let beforeJoinOnServer = null;
  try {
    await app.api.saveMealRecord({ userId: realId, date: '2000-01-01', breakfast: 'eaten' });
  } catch (error) {
    beforeJoinOnServer = error;
  }
  eq('the server refuses a date before the join date', beforeJoinOnServer?.response?.status, 400);

  /* ---- queue changes offline, then sync when back online ---- */

  goOffline(app);
  const syncDayA = daysAgo(4);
  const syncDayB = daysAgo(5);

  await app.meals.markMeal({ userId: realId, date: syncDayA, meal: 'breakfast', status: 'eaten', joinDate });
  await app.meals.markMeal({ userId: realId, date: syncDayB, meal: 'dinner', status: 'eaten', joinDate });
  eq('two offline changes are queued', (await app.storage.getPendingSync(realId)).length, 2);

  goOnline(app);

  const syncResult = await app.sync.syncUserData(realId);
  check('syncUserData reports success while online', syncResult.ok === true, JSON.stringify(syncResult));
  eq('sync uploaded both queued days', syncResult.uploaded, 2);
  eq('sync left nothing queued', syncResult.pending, 0);
  eq('the queue really is empty', (await app.storage.getPendingSync(realId)).length, 0);

  const remoteAll = await app.api.fetchMealRecords(realId);
  eq('the server now holds every day', remoteAll.count, 3);

  /* ---- a second device downloads the same history ---- */

  const secondDevice = createDevice();
  const secondApp = launch(secondDevice);
  goOnline(secondApp);

  await secondApp.storage.saveLocalUser(created);
  eq('the second device starts with nothing', (await secondApp.storage.getLocalMeals(realId)).length, 0);

  const download = await secondApp.sync.downloadUserMeals(realId);
  const downloaded = await secondApp.storage.getLocalMeals(realId);
  eq('the second device downloaded every day', downloaded.length, 3);
  check('the download reported what it did', download.downloaded === 3 && download.added === 3, JSON.stringify(download));
  eq(
    'the downloaded day kept both meals',
    downloaded.find((meal) => meal.date === uploadDay).dinner,
    'eaten',
  );

  await secondApp.sync.downloadUserMeals(realId);
  eq(
    'downloading twice does not duplicate anything',
    (await secondApp.storage.getLocalMeals(realId)).length,
    3,
  );

  /* ---- a queued change must NOT be overwritten by a download ---- */

  await secondApp.storage.updateLocalMeal(realId, uploadDay, { breakfast: 'not_eaten' });
  await secondApp.storage.savePendingSync(realId, { date: uploadDay, breakfast: 'not_eaten' });

  const protectedDownload = await secondApp.sync.downloadUserMeals(realId);
  eq(
    'the queued day was NOT overwritten by the download',
    (await secondApp.storage.getLocalMeal(realId, uploadDay)).breakfast,
    'not_eaten',
  );
  eq('the download reported the day it protected', protectedDownload.keptLocal, 1);

  const recovered = await secondApp.sync.syncUserData(realId);
  check(
    'the queued change uploads on the next sync',
    recovered.ok === true && recovered.uploaded === 1,
    JSON.stringify(recovered),
  );
  eq(
    'the server accepted the queued value',
    (await secondApp.api.fetchMealRecords(realId)).meals.find((meal) => meal.date === uploadDay).breakfast,
    'not_eaten',
  );

  /* ---------------------------------------------------------------- */
  section('9. Logout keeps the meal history');
  /* ---------------------------------------------------------------- */

  const mealsBeforeLogout = (await app.storage.getLocalMeals(realId)).length;
  await app.storage.clearLocalUser();

  eq('the session is gone after logout', await app.storage.getLocalUser(), null);
  eq('meal records survive logout', (await app.storage.getLocalMeals(realId)).length, mealsBeforeLogout);
  check(
    'the meal key is still on the device',
    device.keys().includes(`messmate_meals_${realId}`),
    device.keys().join(', '),
  );
  check('the session key is gone', !device.keys().includes('messmate_user'));
}

/* ------------------------------------------------------------------ */
/* 5. Summary                                                          */
/* ------------------------------------------------------------------ */

function finish() {
  console.log('\n------------------------------------------------------------');

  if (failures.length > 0) {
    console.log(`PHASE 2 TESTS: ${passed} passed, ${failures.length} FAILED`);
    for (const name of failures) console.log(`  - ${name}`);
  } else {
    console.log(`PHASE 2 TESTS: ${passed} passed, 0 failed`);
  }

  console.log('------------------------------------------------------------');

  fs.rmSync(BUILD_DIR, { recursive: true, force: true });
  process.exit(failures.length > 0 ? 1 : 0);
}

main()
  .then(finish)
  .catch((error) => {
    console.error('\n!! The test runner itself crashed:');
    console.error(error);
    failures.push(`test runner crashed: ${error.message}`);
    finish();
  });
