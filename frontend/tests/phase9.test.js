/**
 * MessMate - PHASE 9 tests: production networking + the app icon.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * A freshly installed APK reported "You are offline" when signing up, and then
 * worked about 20 seconds later. The API is hosted on a free tier that sleeps
 * when idle: the first request has to wait for the instance to boot (~23s
 * measured against the live deployment), which is far longer than the 4s probe
 * and 10s request budgets the app used to allow.
 *
 * These tests pin the fix, with a synthetic server whose answers this file
 * controls - no real backend, no sleeps longer than a few milliseconds:
 *
 *   1. the production API URL comes from EXPO_PUBLIC_API_URL;
 *   2. a SLOW server is waited for, and is not called offline early;
 *   3. a phone with NO connection is still answered immediately;
 *   4. signup/login are only retried when the server was actually waking;
 *   5. offline-first behaviour (local meal + queue) is untouched;
 *   6. icon.png is the only icon the app is built from.
 */

'use strict';

const fs = require('fs');
const Module = require('module');
const path = require('path');

const harness = require('./harness');

const ROOT = harness.ROOT;
const BUILD_DIR = path.join(ROOT, '.phase9-build');

const PRODUCTION_URL = 'https://messmate-lz32.onrender.com/api';

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

harness.compile(SOURCES, BUILD_DIR);

/* ------------------------------------------------------------------ */
/* 1. A synthetic server: answers, slowness and silence are controlled */
/* ------------------------------------------------------------------ */

const USER_ID = 'phase9-user';

const server = {
  offline: false, // nothing answers at all (airplane mode)
  slowRequests: 0, // how many of the NEXT requests time out (cold start)
  slowDelayMs: 15,
  registerStatus: 201,
  log: [],
};

function resetServer() {
  server.offline = false;
  server.slowRequests = 0;
  server.registerStatus = 201;
  server.log = [];
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Shaped exactly like axios: no `.response`, so it reads as a network error. */
function networkError(code, message) {
  const error = new Error(message);
  error.code = code;
  error.request = {};
  return error;
}

const silentNetworkError = () => networkError('ERR_NETWORK', 'Network Error');
const timeoutError = () => networkError('ECONNABORTED', 'timeout of 30000ms exceeded');

function httpError(status, message) {
  const error = new Error(message);
  error.response = { status, data: { message } };
  return error;
}

function createAxiosStub() {
  async function answer(method, url, body, config) {
    server.log.push({ method, url: String(url), timeout: config?.timeout });

    if (server.offline) throw silentNetworkError();

    // A server that is still booting: the request fails with a timeout.
    if (server.slowRequests > 0) {
      server.slowRequests -= 1;
      await wait(server.slowDelayMs);
      throw timeoutError();
    }

    await wait(1);

    if (url === '/health') {
      return {
        data: {
          ok: true,
          service: 'MessMate API',
          phase: 1,
          database: 'connected',
          time: new Date().toISOString(),
        },
      };
    }

    if (url === '/auth/register') {
      if (server.registerStatus !== 201) {
        throw httpError(server.registerStatus, 'That email is already registered.');
      }
      return {
        data: {
          id: 'server-user-1',
          username: body?.username,
          email: body?.email,
          joinDate: body?.joinDate,
        },
      };
    }

    if (url === '/auth/login') return { data: { id: 'server-user-1', username: 'ali' } };
    if (String(url).startsWith('/meals/')) {
      return { data: { userId: USER_ID, joinDate: '', today: '', meals: [] } };
    }
    if (url === '/meals') return { data: { id: 'server-meal-1', ...(body || {}) } };

    throw httpError(404, 'Not found.');
  }

  return {
    create: () => ({
      defaults: {},
      interceptors: {},
      get: (url, config) => answer('get', url, undefined, config),
      post: (url, body, config) => answer('post', url, body, config),
      patch: (url, body, config) => answer('patch', url, body, config),
    }),
  };
}

const axiosStub = createAxiosStub();
const constantsStub = { expoConfig: null, expoGoConfig: null, manifest2: null };

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

  return {
    storage: {
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
    },
  };
}

/** Fresh modules on the same device (and on the current env vars). */
function launch(device) {
  currentDevice = device;

  const app = {};
  for (const relative of SOURCES) {
    const target = path.join(BUILD_DIR, relative);
    delete require.cache[require.resolve(target)];
    app[path.basename(relative, '.js')] = require(target);
  }
  return app;
}

const reporter = harness.createReporter('PHASE 9 TESTS');
const { check, eq, section } = reporter;

/* ------------------------------------------------------------------ */
/* The tests                                                           */
/* ------------------------------------------------------------------ */

// Small budgets keep this file fast; the shape is what the app really uses.
const QUICK = { timeouts: [30, 60, 120], delays: [5, 5] };
const AUTH_OPTIONS = { timeout: 30, wakeUp: QUICK };

async function main() {
  const device = createDevice();
  let app = launch(device);

  /* ================= 1. production API configuration ================= */
  section('1. Production API configuration');

  process.env.EXPO_PUBLIC_API_URL = PRODUCTION_URL;
  app = launch(device);

  eq('EXPO_PUBLIC_API_URL decides the base URL', app.api.API_BASE_URL, PRODUCTION_URL);
  check(
    'the production base URL is the deployed API',
    app.api.API_BASE_URL === 'https://messmate-lz32.onrender.com/api',
    app.api.API_BASE_URL,
  );
  check(
    'no localhost / 127.0.0.1 in the production base URL',
    !/localhost|127\.0\.0\.1/.test(app.api.API_BASE_URL),
    app.api.API_BASE_URL,
  );
  check('the error help shows that same API', app.api.API_HELP_TEXT.includes(PRODUCTION_URL));

  // Development keeps working with no .env at all.
  delete process.env.EXPO_PUBLIC_API_URL;
  app = launch(device);
  eq('development falls back to the local API', app.api.API_BASE_URL, 'http://localhost:5000/api');

  /* ================= 2. waiting for a sleeping server ================= */
  section('2. A slow cold start is waited for, not called offline');

  app = launch(device);

  resetServer();
  let woke = await app.api.wakeUpServer(QUICK);
  check('a server that is already awake answers at once', woke.ok === true && woke.attempts === 1, JSON.stringify(woke));
  check('an awake server is not delayed', woke.waitedMs < 100, `${woke.waitedMs}ms`);

  resetServer();
  server.slowRequests = 2; // two slow answers, then the instance is up
  woke = await app.api.wakeUpServer(QUICK);
  check('a sleeping server is retried until it answers', woke.ok === true && woke.attempts === 3, JSON.stringify(woke));
  check('the health payload arrives on the retry', woke.health?.ok === true, JSON.stringify(woke.health));

  resetServer();
  server.slowRequests = 99; // never wakes
  woke = await app.api.wakeUpServer(QUICK);
  check('unreachable is reported only after the whole ladder', woke.ok === false && woke.attempts === 3, JSON.stringify(woke));

  resetServer();
  server.offline = true; // no connection at all
  woke = await app.api.wakeUpServer(QUICK);
  check(
    'a phone with no connection is told quickly',
    woke.ok === false && woke.attempts <= 2 && woke.waitedMs < 1000,
    JSON.stringify(woke),
  );

  // The original single-probe helper keeps its old behaviour.
  app = launch(device);
  resetServer();
  await app.api.checkHealth();
  eq(
    'checkHealth() still probes once, with the 4s budget',
    server.log.map((entry) => entry.timeout),
    [4000],
  );
  /* ============ 3. signup / login are never falsely offline ============ */
  section('3. Sign up and sign in are not called offline too early');

  process.env.EXPO_PUBLIC_API_URL = PRODUCTION_URL;
  app = launch(device);

  // Cold start: the signup request itself times out once, then the server is up.
  resetServer();
  server.slowRequests = 1;
  const created = await app.api.registerUser(
    { username: 'ali', email: 'ali@example.com', password: 'pw', joinDate: '2026-01-01' },
    AUTH_OPTIONS,
  );
  check('a signup during a cold start still succeeds', created?.id === 'server-user-1', JSON.stringify(created));
  check(
    'the signup was repeated exactly once',
    server.log.filter((entry) => entry.url === '/auth/register').length === 2,
    JSON.stringify(server.log),
  );
  check(
    'it was repeated only after the server answered a probe',
    server.log.some((entry) => entry.url === '/health'),
  );

  // A real answer from the server must never be retried or hidden.
  resetServer();
  server.registerStatus = 409;
  let duplicate = null;
  try {
    await app.api.registerUser(
      { username: 'ali', email: 'ali@example.com', password: 'pw', joinDate: '2026-01-01' },
      AUTH_OPTIONS,
    );
  } catch (error) {
    duplicate = error;
  }
  eq('a duplicate account is reported as an answer', duplicate?.response?.status, 409);
  check('that answer is NOT treated as offline', app.api.isNetworkError(duplicate) === false);
  eq(
    'the server was asked only once',
    server.log.filter((entry) => entry.url === '/auth/register').length,
    1,
  );

  // With no connection at all there is nothing to wait for: fail fast.
  resetServer();
  server.offline = true;
  let offlineError = null;
  const startedAt = Date.now();
  try {
    await app.api.loginUser({ identifier: 'ali', password: 'pw' }, AUTH_OPTIONS);
  } catch (error) {
    offlineError = error;
  }
  const offlineMs = Date.now() - startedAt;
  check('an offline sign-in is still an offline error', app.api.isNetworkError(offlineError) === true);
  check('an offline sign-in does not make the user wait', offlineMs < 1500, `${offlineMs}ms`);

  /* ============ 4. the online check survives a cold start ============ */
  section('4. The online/offline check survives a cold start');

  resetServer();
  server.slowRequests = 1;
  app.sync.forgetOnlineState();
  eq('a cold start is still reported ONLINE', await app.sync.isOnline(), true);
  eq(
    'it took a second probe to find out',
    server.log.filter((entry) => entry.url === '/health').length,
    2,
  );

  /* ============ 5. offline-first behaviour is unchanged ============ */
  section('5. Offline-first behaviour is untouched');

  resetServer();
  server.offline = true;
  app.sync.forgetOnlineState();

  eq('isOnline() is false when nothing answers', await app.sync.isOnline(), false);

  const today = app.date.todayString();
  const marked = await app.meals.markMeal({
    userId: USER_ID,
    date: today,
    meal: app.storage.MEAL_TYPES.BREAKFAST,
    status: app.storage.MEAL_STATUS.EATEN,
    joinDate: '2026-01-01',
  });

  check('an offline tap is saved and queued', marked.queued === true && marked.synced === false, JSON.stringify(marked));
  eq(
    'an offline tap spends no request at all',
    server.log.filter((entry) => entry.url !== '/health').length,
    0,
  );

  const localMeals = await app.meals.getMeals(USER_ID);
  check(
    'the offline meal is readable on the device',
    localMeals.length === 1 && localMeals[0].breakfast === 'eaten',
    JSON.stringify(localMeals),
  );
  eq('the change is queued for upload', (await app.storage.getPendingSync(USER_ID)).length, 1);

  const syncResult = await app.sync.syncUserData(USER_ID);
  check(
    'sync says "offline, your records are safe" instead of failing',
    syncResult.ok === false && syncResult.online === false,
    JSON.stringify(syncResult),
  );

  /* ============ 6. the icon the app is built from ============ */
  section('6. App icon configuration');

  const appJson = harness.readJSON('app.json');
  eq('icon.png is the app icon', appJson.expo.icon, './assets/icon.png');
  eq(
    'icon.png is the Android adaptive foreground',
    appJson.expo.android.adaptiveIcon.foregroundImage,
    './assets/icon.png',
  );
  check('the old adaptive background is gone', appJson.expo.android.adaptiveIcon.backgroundImage === undefined);
  check('the old monochrome icon is gone', appJson.expo.android.adaptiveIcon.monochromeImage === undefined);
  eq('the web favicon uses the same file', appJson.expo.web.favicon, './assets/icon.png');
  check('assets/icon.png exists', harness.exists('assets/icon.png'));

  const REMOVED = [
    'android-icon-background.png',
    'android-icon-foreground.png',
    'android-icon-monochrome.png',
    'favicon.png',
    'splash-icon.png',
  ];

  for (const name of REMOVED) {
    check(`obsolete icon removed: assets/${name}`, !harness.exists(`assets/${name}`));
  }

  // Nothing may still point at a file that is gone.
  const SKIP_DIRS = ['node_modules', '.expo', 'dist', '.phase2-build', '.phase3-build', '.phase9-build', '.git'];
  const stale = [];

  function scan(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.includes(entry.name)) scan(path.join(dir, entry.name));
        continue;
      }

      // This file lists the names on purpose - it is not a reference.
      if (entry.name === 'phase9.test.js') continue;
      if (!/\.(js|json|md)$/.test(entry.name) || entry.name === 'package-lock.json') continue;

      const full = path.join(dir, entry.name);
      const text = fs.readFileSync(full, 'utf8');

      for (const name of REMOVED) {
        if (text.includes(name)) stale.push(`${path.relative(ROOT, full)} -> ${name}`);
      }
    }
  }

  scan(ROOT);
  eq('no file still references a removed icon asset', stale, []);
}

main()
  .then(() => {
    process.exitCode = reporter.finish(BUILD_DIR) === 0 ? 0 : 1;
  })
  .catch((error) => {
    console.error('\n!! The test run crashed before finishing:');
    console.error(error);
    reporter.check('the test run finished', false, error && error.message);
    process.exitCode = reporter.finish(BUILD_DIR) === 0 ? 0 : 1;
  });


