/**
 * MessMate - PHASE 9 API tests: the deployed-database layer.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The deployed API answered every data route with 503 "The database is not
 * connected" because the connection string it looked for was not there under
 * that name. These tests pin the fixes:
 *
 *   1. the connection string is found under MONGO_URI *or* MONGODB_URI;
 *   2. /api/health explains the database state without credentials;
 *   3. a missing database never stops the API from answering;
 *   4. nothing (log, health, error) ever leaks the password.
 *
 * SAFETY: the real Atlas database is never touched.
 *   - Part 1 connects to a throwaway LOCAL database.
 *   - Parts 2 and 3 start the server from a temporary working directory, where
 *     there is no .env file, so backend/.env (the real credentials) is not read.
 *
 * Run with:  node tests/phase9.test.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const BACKEND_DIR = path.join(__dirname, '..');
const SERVER_JS = path.join(BACKEND_DIR, 'server.js');

const TEST_DB_NAME = 'messmate_phase9_test';
const TEST_MONGO_URI = `mongodb://127.0.0.1:27017/${TEST_DB_NAME}`;

// A password that must never appear in any output.
const SECRET = 'super-secret-pw-1234';

/* ------------------------------------------------------------------ */
/* Tiny test harness                                                   */
/* ------------------------------------------------------------------ */

let passed = 0;
const failures = [];

function section(title) {
  console.log(`\n--- ${title} ---`);
}

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? `\n          got: ${detail}` : ''}`);
  }
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const pad = (n) => String(n).padStart(2, '0');

function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function request(method, url, body) {
  const options = { method, headers: {} };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, body: json };
}

/**
 * Start server.js with a clean, fully controlled environment.
 * MONGO_* variables are removed first, so an inherited value can never decide
 * what the child connects to.
 */
function startServer({ port, vars, cwd }) {
  const env = { ...process.env };
  for (const name of ['MONGO_URI', 'MONGODB_URI', 'MONGO_URL', 'DATABASE_URL', 'DOTENV_CONFIG_PATH']) {
    delete env[name];
  }
  Object.assign(env, { PORT: String(port), HOST: '127.0.0.1' }, vars);

  return spawn(process.execPath, [SERVER_JS], {
    cwd: cwd || BACKEND_DIR,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function collectLog(child) {
  const state = { text: '' };
  child.stdout.on('data', (c) => {
    state.text += c.toString();
  });
  child.stderr.on('data', (c) => {
    state.text += c.toString();
  });
  return state;
}

async function waitForServer(base, timeoutMs = 30000, log) {
  const started = Date.now();

  for (;;) {
    try {
      const res = await fetch(`${base}/health`);
      if (res.status === 200) return true;
    } catch {
      // not listening yet
    }

    if (Date.now() - started > timeoutMs) {
      throw new Error(`Server did not start within ${timeoutMs}ms.\n${log ? log.text : ''}`);
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

/* ------------------------------------------------------------------ */
/* Part 1 - the connection string is found under either name           */
/* ------------------------------------------------------------------ */

async function part1() {
  section('1. Connection string resolution (in process)');

  const dbPath = path.join(BACKEND_DIR, 'src', 'config', 'db.js');
  delete require.cache[require.resolve(dbPath)];

  // MONGODB_URI only: the name a hosting panel usually uses.
  delete process.env.MONGO_URI;
  process.env.MONGODB_URI = TEST_MONGO_URI;

  const db = require(dbPath);

  const resolved = db.getMongoUri();
  check('MONGODB_URI is accepted when MONGO_URI is absent', resolved.name === 'MONGODB_URI', String(resolved.name));
  check('the connection string is picked up', resolved.uri === TEST_MONGO_URI);

  // MONGO_URI keeps priority when both are set.
  process.env.MONGO_URI = TEST_MONGO_URI;
  check('MONGO_URI keeps priority when both are set', db.getMongoUri().name === 'MONGO_URI');

  await db.connectDB({ timeoutMS: 15000 });
  check('connectDB() connects using the aliased variable', db.isDBConnected());

  const status = db.getDbStatus();
  check('status names the variable it used', status.uriVariable === 'MONGO_URI', String(status.uriVariable));
  check('status reports the database name', status.database === TEST_DB_NAME, String(status.database));
  check('status reports connected', status.connected === true);
  check('status carries no credentials', JSON.stringify(status).includes('@') === false, JSON.stringify(status));

  await db.disconnectDB();

  // Nothing that leaves this process may carry a password.
  const secretUri = `mongodb+srv://user:${SECRET}@cluster0.example.mongodb.net/MessMate`;
  const cleaned = db.sanitize(`cannot reach ${secretUri} (password=${SECRET})`);
  check('sanitize() strips the connection string', cleaned.includes(SECRET) === false, cleaned);
  check('sanitize() strips password= values', cleaned.includes('password=<redacted>'), cleaned);
}

/* ------------------------------------------------------------------ */
/* Part 2 - a deployment that only defines MONGODB_URI                 */
/* ------------------------------------------------------------------ */

async function part2() {
  section('2. Start with only MONGODB_URI set (no .env in the folder)');

  const port = 5097;
  const base = `http://127.0.0.1:${port}/api`;
  const child = startServer({ port, vars: { MONGODB_URI: TEST_MONGO_URI }, cwd: os.tmpdir() });
  const log = collectLog(child);

  try {
    await waitForServer(base, 30000, log);

    const health = await request('GET', `${base}/health`);
    check('GET /api/health returns 200', health.status === 200, `status ${health.status}`);
    check('health reports the database as connected', health.body?.database === 'connected', String(health.body?.database));
    check('health names the variable it found', health.body?.databaseInfo?.uriVariable === 'MONGODB_URI', String(health.body?.databaseInfo?.uriVariable));
    check('the run used the throwaway database, not Atlas', log.text.includes(TEST_DB_NAME));

    const stamp = Date.now();
    const reg = await request('POST', `${base}/auth/register`, {
      username: `phase9_${stamp}`,
      email: `phase9_${stamp}@example.com`,
      password: SECRET,
      joinDate: dateOffset(-30),
    });
    check('POST /api/auth/register returns 201', reg.status === 201, `status ${reg.status} :: ${JSON.stringify(reg.body)}`);
    check(
      'signup returns the shape the app stores',
      typeof reg.body?.id === 'string' && !!reg.body?.username && !!reg.body?.joinDate,
      JSON.stringify(reg.body),
    );
    check('signup never returns the password', JSON.stringify(reg.body || {}).includes(SECRET) === false);
    check('the password never reaches the server log', log.text.includes(SECRET) === false);
  } finally {
    child.kill();
  }
}

/* ------------------------------------------------------------------ */
/* Part 3 - nothing configured at all                                  */
/* ------------------------------------------------------------------ */

async function part3() {
  section('3. Start with no connection string at all');

  const port = 5098;
  const base = `http://127.0.0.1:${port}/api`;
  const child = startServer({ port, vars: {}, cwd: os.tmpdir() });
  const log = collectLog(child);

  try {
    await waitForServer(base, 30000, log);

    const health = await request('GET', `${base}/health`);
    check('the API still answers when the database is down', health.status === 200, `status ${health.status}`);
    check('health says disconnected', health.body?.database === 'disconnected', String(health.body?.database));
    check('health says no connection string was found', health.body?.databaseInfo?.uriConfigured === false);
    check(
      'health lists the variable names it accepts',
      Array.isArray(health.body?.databaseInfo?.acceptedVariables) &&
        health.body.databaseInfo.acceptedVariables.includes('MONGO_URI'),
      JSON.stringify(health.body?.databaseInfo?.acceptedVariables),
    );
    check(
      'health explains the failure, credential-free',
      typeof health.body?.databaseInfo?.error === 'string' &&
        health.body.databaseInfo.error.includes('MONGO_URI'),
      String(health.body?.databaseInfo?.error),
    );

    const reg = await request('POST', `${base}/auth/register`, {
      username: 'phase9_offline',
      email: 'phase9_offline@example.com',
      password: 'x',
      joinDate: dateOffset(-1),
    });
    check('a data route still answers 503, as the app expects', reg.status === 503, `status ${reg.status}`);
    check(
      'the 503 message the app matches on is unchanged',
      reg.body?.message === 'The database is not connected. Check MONGO_URI in backend/.env.',
      String(reg.body?.message),
    );
    check('the 503 points at /api/health', String(reg.body?.hint || '').includes('/api/health'));

    const payload = `${JSON.stringify(health.body)}${JSON.stringify(reg.body)}`;
    check('no credentials in any response payload', /:\/\/[^@"\s]*@/.test(payload) === false, payload);
  } finally {
    child.kill();
  }
}

/* ------------------------------------------------------------------ */
/* Reporting + shutdown                                                */
/* ------------------------------------------------------------------ */

async function dropTestDatabase() {
  const mongoose = require(path.join(BACKEND_DIR, 'node_modules', 'mongoose'));
  await mongoose.connect(TEST_MONGO_URI, { serverSelectionTimeoutMS: 15000 });
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

let finished = false;

async function finish() {
  if (finished) return;
  finished = true;

  console.log('\n==================================================');
  console.log(`  PHASE 9 API TESTS: ${passed} passed, ${failures.length} failed`);
  console.log('==================================================');

  if (failures.length) {
    console.log('\nFailed checks:');
    failures.forEach((name) => console.log(`  - ${name}`));
  }

  process.exit(failures.length ? 1 : 0);
}

async function main() {
  await part1();
  await part2();
  await part3();
  await dropTestDatabase();
  console.log(`\nThe throwaway database "${TEST_DB_NAME}" was dropped.`);
}

main()
  .then(finish)
  .catch(async (error) => {
    console.error('\n!! The test run crashed before finishing:');
    console.error(error);
    await finish();
  });

