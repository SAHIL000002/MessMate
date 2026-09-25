/**
 * MessMate - shared frontend test harness.
 *
 * The frontend is an Expo app, so its source is ESM. To exercise the SERVICE
 * and UTILITY layer in plain Node, this harness compiles those files to
 * CommonJS using the Babel that Expo already ships, then loads them with
 * exactly two stand-ins:
 *
 *   - an in-memory AsyncStorage, so a fake "device" can be created and later
 *     RESTARTED (a fresh module registry on the same storage) to prove that
 *     what was written survives;
 *   - a pass-through axios whose network can be switched OFF on demand.
 *
 * Nothing else is faked. While "online" the compiled code talks to the real
 * backend on http://127.0.0.1:5000/api.
 *
 * Used by tests/phase3.test.js. tests/phase2.test.js keeps its own inline
 * copy of the same idea on purpose: Phase 2 was written and verified first,
 * and it must stay untouched by anything a later phase does.
 */

'use strict';

const fs = require('fs');
const Module = require('module');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BUILD_DIR = path.join(ROOT, '.phase3-build');

/* ------------------------------------------------------------------ */
/* 1. Compile the sources to CommonJS                                  */
/* ------------------------------------------------------------------ */

function compile(sources, buildDir = BUILD_DIR) {
  fs.rmSync(buildDir, { recursive: true, force: true });

  const babel = require('@babel/core');
  const cjsPlugin = require.resolve('@babel/plugin-transform-modules-commonjs');

  for (const relative of sources) {
    const output = path.join(buildDir, relative);
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

  return buildDir;
}

/* ------------------------------------------------------------------ */
/* 2. Stand-ins: AsyncStorage, axios, expo-constants                   */
/* ------------------------------------------------------------------ */

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

// api.js auto-detects a LAN host from these; null keeps it on localhost.
const constantsStub = { expoConfig: null, expoGoConfig: null, manifest2: null };

// report.js is PURE except for its share half (expo-print / expo-sharing /
// expo-file-system), which cannot load in plain Node. These stubs keep the
// compiled import working so the PURE builders under test load; the real PDF
// path runs on the device, where those modules exist.
const expoPrintStub = { printToFileAsync: async () => { throw new Error('PDF needs a device.'); } };
const expoSharingStub = { isAvailableAsync: async () => false, shareAsync: async () => ({}) };
const expoFileStub = { File: class File { constructor(uri) { this.uri = uri; } rename() {} } };

/** One fake phone: its disk survives an app restart, its RAM does not. */
let currentDevice = null;

let stubsInstalled = false;

function installStubs() {
  if (stubsInstalled) return;
  stubsInstalled = true;

  const originalLoad = Module._load;

  Module._load = function patchedLoad(request, parent, isMain) {
    if (request === '@react-native-async-storage/async-storage') return currentDevice.storage;
    if (request === 'axios') return axiosStub;
    if (request === 'expo-constants') return constantsStub;
    if (request === 'expo-print') return expoPrintStub;
    if (request === 'expo-sharing') return expoSharingStub;
    if (request === 'expo-file-system') return expoFileStub;
    return originalLoad.call(this, request, parent, isMain);
  };
}

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

  return {
    storage,
    entries: () => [...store.entries()],
    keys: () => [...store.keys()],
    /** Corrupt a key on purpose, to test that a screen survives it. */
    writeRaw: (key, raw) => store.set(key, raw),
  };
}

/* ------------------------------------------------------------------ */
/* 3. Load the compiled sources as one "app"                           */
/* ------------------------------------------------------------------ */

/** `src/utils/cycle.js` -> `cycle` */
function moduleKey(relative) {
  const base = path.basename(relative, '.js');
  const parent = path.basename(path.dirname(relative));
  return parent === 'services' || parent === 'utils' ? base : `${parent}_${base}`;
}

/**
 * Calling this twice on the same device === closing and reopening the app:
 * the modules are re-required (fresh memory) on the same storage.
 */
function launch(device, sources, buildDir = BUILD_DIR) {
  currentDevice = device;
  installStubs();

  const app = {};

  for (const relative of sources) {
    const target = path.join(buildDir, relative);
    delete require.cache[require.resolve(target)];
    app[moduleKey(relative)] = require(target);
  }

  return app;
}

/* ------------------------------------------------------------------ */
/* 4. Network switch                                                   */
/* ------------------------------------------------------------------ */

const network = {
  /** "On a train": every request fails as a plain network error. */
  goOffline() {
    OFFLINE = true;
  },
  goOnline() {
    OFFLINE = false;
  },
  isOffline: () => OFFLINE,
  calls: () => networkCalls,
  count: () => networkCalls.length,
  reset() {
    networkCalls = [];
  },
};

/* ------------------------------------------------------------------ */
/* 5. Tiny test reporter                                               */
/* ------------------------------------------------------------------ */

function createReporter(title) {
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

  function section(name) {
    console.log(`\n${name}`);
  }

  function finish(buildDir = BUILD_DIR) {
    console.log('\n------------------------------------------------------------');

    if (failures.length > 0) {
      console.log(`${title}: ${passed} passed, ${failures.length} FAILED`);
      for (const name of failures) console.log(`  - ${name}`);
    } else {
      console.log(`${title}: ${passed} passed, 0 failed`);
    }

    console.log('------------------------------------------------------------');

    fs.rmSync(buildDir, { recursive: true, force: true });
    return failures.length;
  }

  return {
    check,
    eq,
    section,
    finish,
    title,
    get passed() {
      return passed;
    },
    failures,
  };
}

/* ------------------------------------------------------------------ */
/* 6. Reading project files                                            */
/* ------------------------------------------------------------------ */

const readSource = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const readJSON = (relative) => JSON.parse(readSource(relative));
const exists = (relative) => fs.existsSync(path.join(ROOT, relative));

module.exports = {
  ROOT,
  BUILD_DIR,
  compile,
  createDevice,
  createReporter,
  exists,
  launch,
  network,
  readJSON,
  readSource,
};

