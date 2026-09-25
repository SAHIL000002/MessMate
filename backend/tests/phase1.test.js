/**
 * MessMate - PHASE 1 API tests.
 *
 * Boots the real server (server.js) on a spare port and drives it over real
 * HTTP, so nothing here is mocked.
 *
 * SAFETY: the child process is given MONGO_URI=mongodb://127.0.0.1:27017/
 * messmate_phase1_test. dotenv never overwrites a variable that is already
 * set, so your real database (the Atlas one in backend/.env) is never
 * touched, and the test database is dropped when the run finishes.
 *
 * Run with:  node tests/phase1.test.js
 */

const path = require('path');
const { spawn } = require('child_process');
const mongoose = require('mongoose');

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */

const PORT = 5099;
const BASE = `http://127.0.0.1:${PORT}/api`;
const TEST_DB_NAME = 'messmate_phase1_test';
const TEST_MONGO_URI = `mongodb://127.0.0.1:27017/${TEST_DB_NAME}`;

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
/* Date + HTTP helpers                                                 */
/* ------------------------------------------------------------------ */

const pad = (n) => String(n).padStart(2, '0');

/** Offset from today, 0 = today, negative = the past. Returns YYYY-MM-DD. */
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

const get = (url) => request('GET', url);
const post = (url, body) => request('POST', url, body);
const patch = (url, body) => request('PATCH', url, body);

function isSortedAscending(values) {
  for (let i = 1; i < values.length; i += 1) {
    if (values[i - 1] > values[i]) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Start the API against the throwaway database                        */
/* ------------------------------------------------------------------ */

const server = spawn(process.execPath, ['server.js'], {
  cwd: path.join(__dirname, '..'),
  env: { ...process.env, MONGO_URI: TEST_MONGO_URI, PORT: String(PORT), HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverLog = '';
server.stdout.on('data', (c) => {
  serverLog += c.toString();
});
server.stderr.on('data', (c) => {
  serverLog += c.toString();
});

function waitForServer(timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    let done = false;

    const timer = setInterval(async () => {
      if (done) return;
      try {
        const res = await fetch(`${BASE}/health`);
        if (res.status === 200) {
          done = true;
          clearInterval(timer);
          resolve();
          return;
        }
      } catch {
        // not listening yet
      }
      if (Date.now() - started > timeoutMs) {
        done = true;
        clearInterval(timer);
        reject(new Error(`Server did not start within ${timeoutMs}ms.\n${serverLog}`));
      }
    }, 250);
  });
}

/* ------------------------------------------------------------------ */
/* The tests                                                           */
/* ------------------------------------------------------------------ */

async function main() {
  await waitForServer();

  const today = dateOffset(0);
  const tomorrow = dateOffset(1);
  const JOIN_DAYS_AGO = 200;
  const joinDate = dateOffset(-JOIN_DAYS_AGO);
  const beforeJoin = dateOffset(-(JOIN_DAYS_AGO + 1));

  /* ================= 1. HEALTH ================= */
  section('1. Health');
  const health = await get(`${BASE}/health`);
  check('GET /api/health returns 200', health.status === 200, `status ${health.status}`);
  check('health.ok is true', health.body?.ok === true);
  check(
    'health reports the database as connected',
    health.body?.database === 'connected',
    String(health.body?.database),
  );
  check(
    'the run uses the throwaway test database, not the real one',
    serverLog.includes(TEST_DB_NAME),
    serverLog.trim(),
  );

  /* ================= 2. SIGNUP ================= */
  section('2. Signup');
  const regA = await post(`${BASE}/auth/register`, {
    username: 'ali_test',
    email: 'ali_test@example.com',
    password: 'passA',
    joinDate,
  });
  check(
    'POST /api/auth/register returns 201',
    regA.status === 201,
    `status ${regA.status} :: ${JSON.stringify(regA.body)}`,
  );

  const A = regA.body || {};
  check('register returns an id', typeof A.id === 'string' && A.id.length === 24, String(A.id));
  check('register returns username', A.username === 'ali_test', String(A.username));
  check('register returns email', A.email === 'ali_test@example.com', String(A.email));
  check('register returns joinDate', A.joinDate === joinDate, String(A.joinDate));
  check('register does NOT return the password', !('password' in A), JSON.stringify(A));

  const missingFields = await post(`${BASE}/auth/register`, { username: 'incomplete_test' });
  check(
    'register rejects missing fields with 400',
    missingFields.status === 400,
    `status ${missingFields.status}`,
  );

  const impossibleJoin = await post(`${BASE}/auth/register`, {
    username: 'bad_join_test',
    email: 'bad_join_test@example.com',
    password: 'p',
    joinDate: '2026-02-31',
  });
  check(
    'register rejects an impossible joinDate (2026-02-31) with 400',
    impossibleJoin.status === 400,
    `status ${impossibleJoin.status}`,
  );

  const futureJoin = await post(`${BASE}/auth/register`, {
    username: 'future_join_test',
    email: 'future_join_test@example.com',
    password: 'p',
    joinDate: tomorrow,
  });
  check(
    'register rejects a future joinDate with 400',
    futureJoin.status === 400,
    `status ${futureJoin.status}`,
  );

  /* ================= 3. DUPLICATE USERNAME ================= */
  section('3. Duplicate username');
  const dupUsername = await post(`${BASE}/auth/register`, {
    username: 'ali_test',
    email: 'someone_else_test@example.com',
    password: 'p',
    joinDate,
  });
  check(
    'a second user with the same username is rejected with 409',
    dupUsername.status === 409,
    `status ${dupUsername.status} :: ${JSON.stringify(dupUsername.body)}`,
  );

  /* ================= 4. DUPLICATE EMAIL ================= */
  section('4. Duplicate email');
  const dupEmail = await post(`${BASE}/auth/register`, {
    username: 'someone_else_test',
    email: 'ali_test@example.com',
    password: 'p',
    joinDate,
  });
  check(
    'a second user with the same email is rejected with 409',
    dupEmail.status === 409,
    `status ${dupEmail.status} :: ${JSON.stringify(dupEmail.body)}`,
  );

  const dupEmailCase = await post(`${BASE}/auth/register`, {
    username: 'someone_else_two_test',
    email: 'ALI_TEST@EXAMPLE.COM',
    password: 'p',
    joinDate,
  });
  check(
    'the same email in different case is also rejected with 409',
    dupEmailCase.status === 409,
    `status ${dupEmailCase.status}`,
  );

  /* ================= 5. LOGIN WITH USERNAME ================= */
  section('5. Login with username');
  const loginByUsername = await post(`${BASE}/auth/login`, {
    identifier: 'ali_test',
    password: 'passA',
  });
  check(
    'login by username returns 200',
    loginByUsername.status === 200,
    `status ${loginByUsername.status} :: ${JSON.stringify(loginByUsername.body)}`,
  );
  check('login returns the right id', loginByUsername.body?.id === A.id);
  check('login returns joinDate', loginByUsername.body?.joinDate === joinDate);
  check('login does NOT return the password', !('password' in (loginByUsername.body || {})));
  check('login returns no token (no JWT by design)', !('token' in (loginByUsername.body || {})));

  /* ================= 6. LOGIN WITH EMAIL ================= */
  section('6. Login with email');
  const loginByEmail = await post(`${BASE}/auth/login`, {
    identifier: 'ali_test@example.com',
    password: 'passA',
  });
  check(
    'login by email returns 200',
    loginByEmail.status === 200,
    `status ${loginByEmail.status} :: ${JSON.stringify(loginByEmail.body)}`,
  );
  check('login by email returns the same id', loginByEmail.body?.id === A.id);

  /* ================= 7. WRONG PASSWORD ================= */
  section('7. Wrong password');
  const wrongPassword = await post(`${BASE}/auth/login`, {
    identifier: 'ali_test',
    password: 'definitely-wrong',
  });
  check(
    'a wrong password returns 401',
    wrongPassword.status === 401,
    `status ${wrongPassword.status}`,
  );

  const unknownUser = await post(`${BASE}/auth/login`, {
    identifier: 'nobody_test',
    password: 'passA',
  });
  check(
    'an unknown identifier returns 401',
    unknownUser.status === 401,
    `status ${unknownUser.status}`,
  );

  const noPassword = await post(`${BASE}/auth/login`, { identifier: 'ali_test' });
  check(
    'login without a password returns 400',
    noPassword.status === 400,
    `status ${noPassword.status}`,
  );

  /* ================= 8. GET USER ================= */
  section('8. Get user');
  const getUserA = await get(`${BASE}/auth/user/${A.id}`);
  check('GET /api/auth/user/:id returns 200', getUserA.status === 200, `status ${getUserA.status}`);
  check(
    'get user returns id, username, email and joinDate',
    getUserA.body?.id === A.id &&
      getUserA.body?.username === 'ali_test' &&
      getUserA.body?.email === 'ali_test@example.com' &&
      getUserA.body?.joinDate === joinDate,
    JSON.stringify(getUserA.body),
  );
  check('get user does NOT return the password', !('password' in (getUserA.body || {})));

  const unknownUserId = await get(`${BASE}/auth/user/000000000000000000000000`);
  check(
    'an unknown user id returns 404',
    unknownUserId.status === 404,
    `status ${unknownUserId.status}`,
  );

  const malformedUserId = await get(`${BASE}/auth/user/not-an-id`);
  check(
    'a malformed user id returns 400',
    malformedUserId.status === 400,
    `status ${malformedUserId.status}`,
  );

  /* ================= 9. CREATE TODAY'S BREAKFAST ================= */
  section("9. Create today's breakfast");
  const makeBreakfast = await post(`${BASE}/meals`, {
    userId: A.id,
    date: today,
    breakfast: 'eaten',
  });
  check(
    'POST /api/meals returns 201 for a new date',
    makeBreakfast.status === 201,
    `status ${makeBreakfast.status} :: ${JSON.stringify(makeBreakfast.body)}`,
  );
  check('breakfast is saved as eaten', makeBreakfast.body?.breakfast === 'eaten');
  check(
    'dinner defaults to not_eaten',
    makeBreakfast.body?.dinner === 'not_eaten',
    String(makeBreakfast.body?.dinner),
  );
  check(
    'the record carries the right userId and date',
    makeBreakfast.body?.userId === A.id && makeBreakfast.body?.date === today,
    `${makeBreakfast.body?.userId} / ${makeBreakfast.body?.date}`,
  );
  const todayMealId = makeBreakfast.body?.id;

  /* ================= 10. CREATE TODAY'S DINNER ================= */
  section("10. Create today's dinner");
  const makeDinner = await post(`${BASE}/meals`, {
    userId: A.id,
    date: today,
    dinner: 'eaten',
  });
  check(
    'saving the same date again returns 200 (updated, not created)',
    makeDinner.status === 200,
    `status ${makeDinner.status}`,
  );
  check('dinner is now eaten', makeDinner.body?.dinner === 'eaten', String(makeDinner.body?.dinner));
  check(
    'breakfast was left untouched by a dinner-only save',
    makeDinner.body?.breakfast === 'eaten',
    String(makeDinner.body?.breakfast),
  );
  check(
    'the record kept the same id - no second document was created',
    makeDinner.body?.id === todayMealId,
    `${makeDinner.body?.id} vs ${todayMealId}`,
  );

  /* ================= 11. UPDATE SAME DATE ================= */
  section('11. Update the same date');
  const updateSameDate = await post(`${BASE}/meals`, {
    userId: A.id,
    date: today,
    breakfast: 'not_eaten',
    dinner: 'eaten',
  });
  check('updating an existing date returns 200', updateSameDate.status === 200, `status ${updateSameDate.status}`);
  check(
    'breakfast changed to not_eaten',
    updateSameDate.body?.breakfast === 'not_eaten',
    String(updateSameDate.body?.breakfast),
  );
  check('dinner stayed eaten', updateSameDate.body?.dinner === 'eaten');

  /* ================= 12. ONLY ONE RECORD ================= */
  section('12. Only one record per day');
  const listAfterSaves = await get(`${BASE}/meals/${A.id}`);
  check('GET /api/meals/:userId returns 200', listAfterSaves.status === 200, `status ${listAfterSaves.status}`);
  const todayRecords = (listAfterSaves.body?.meals || []).filter((m) => m.date === today);
  check(
    'exactly one record exists for today after three saves',
    todayRecords.length === 1,
    `found ${todayRecords.length}`,
  );

  const joinDateRecord = await post(`${BASE}/meals`, {
    userId: A.id,
    date: joinDate,
    breakfast: 'eaten',
  });
  check(
    'a date before joinDate is rejected with 400',
    (await post(`${BASE}/meals`, { userId: A.id, date: beforeJoin, breakfast: 'eaten' })).status === 400,
  );
  check(
    'the joinDate itself is allowed (201)',
    joinDateRecord.status === 201,
    `status ${joinDateRecord.status} :: ${JSON.stringify(joinDateRecord.body)}`,
  );

  const listAfterTwoDays = await get(`${BASE}/meals/${A.id}`);
  check(
    'only two documents exist for two distinct days',
    listAfterTwoDays.body?.count === 2,
    `count ${listAfterTwoDays.body?.count}`,
  );

  /* ================= 13. REJECT FUTURE DATE ================= */
  section('13. Reject a future date');
  const futureMeal = await post(`${BASE}/meals`, {
    userId: A.id,
    date: tomorrow,
    breakfast: 'eaten',
  });
  check(
    'a future date returns 400',
    futureMeal.status === 400,
    `status ${futureMeal.status} :: ${JSON.stringify(futureMeal.body)}`,
  );
  check(
    'nothing was saved for the future date',
    ((await get(`${BASE}/meals/${A.id}`)).body?.meals || []).every((m) => m.date !== tomorrow),
  );

  /* ================= 14. REJECT DATE BEFORE joinDate ================= */
  section('14. Reject a date before joinDate');
  const earlyMeal = await post(`${BASE}/meals`, {
    userId: A.id,
    date: beforeJoin,
    breakfast: 'eaten',
  });
  check(
    'a date before joinDate returns 400',
    earlyMeal.status === 400,
    `status ${earlyMeal.status} :: ${JSON.stringify(earlyMeal.body)}`,
  );
  check(
    'nothing was saved before the joinDate',
    ((await get(`${BASE}/meals/${A.id}`)).body?.meals || []).every((m) => m.date !== beforeJoin),
  );
  check('the joinDate itself is allowed (created earlier with 201)', joinDateRecord.status === 201);
  check(
    'a meal cannot be created for a user that does not exist (404)',
    (await post(`${BASE}/meals`, {
      userId: '000000000000000000000000',
      date: today,
      breakfast: 'eaten',
    })).status === 404,
  );

  /* ================= extra validation ================= */
  section('Extra validation');
  check(
    'a day with neither breakfast nor dinner returns 400',
    (await post(`${BASE}/meals`, { userId: A.id, date: today })).status === 400,
  );
  check(
    'a missing userId returns 400',
    (await post(`${BASE}/meals`, { date: today, breakfast: 'eaten' })).status === 400,
  );
  check(
    'an unknown breakfast value returns 400',
    (await post(`${BASE}/meals`, { userId: A.id, date: today, breakfast: 'maybe' })).status === 400,
  );
  check(
    '"pending" is NOT an accepted status',
    (await post(`${BASE}/meals`, { userId: A.id, date: today, breakfast: 'pending' })).status === 400,
  );
  check(
    '"not_recorded" is NOT an accepted status',
    (await post(`${BASE}/meals`, { userId: A.id, date: today, dinner: 'not_recorded' })).status === 400,
  );
  check(
    '"NOT MARKED" is NOT an accepted status',
    (await post(`${BASE}/meals`, { userId: A.id, date: today, dinner: 'NOT MARKED' })).status === 400,
  );
  check(
    'a malformed date returns 400',
    (await post(`${BASE}/meals`, { userId: A.id, date: 'yesterday', breakfast: 'eaten' })).status === 400,
  );
  check(
    'an impossible date (2026-02-31) returns 400',
    (await post(`${BASE}/meals`, { userId: A.id, date: '2026-02-31', breakfast: 'eaten' })).status === 400,
  );

  const goodPatch = await patch(`${BASE}/meals/${todayMealId}`, { dinner: 'not_eaten' });
  check('PATCH can change dinner (200)', goodPatch.status === 200, `status ${goodPatch.status}`);
  check('the PATCHed value was saved', goodPatch.body?.dinner === 'not_eaten', String(goodPatch.body?.dinner));

  const revertPatch = await patch(`${BASE}/meals/${todayMealId}`, { dinner: 'eaten' });
  check('PATCH can change it back', revertPatch.body?.dinner === 'eaten', String(revertPatch.body?.dinner));

  check(
    'PATCH with an unknown value returns 400',
    (await patch(`${BASE}/meals/${todayMealId}`, { dinner: 'maybe' })).status === 400,
  );
  check(
    'PATCH with nothing to change returns 400',
    (await patch(`${BASE}/meals/${todayMealId}`, {})).status === 400,
  );
  check(
    'PATCH cannot move a record to another date (400)',
    (await patch(`${BASE}/meals/${todayMealId}`, { date: dateOffset(-1) })).status === 400,
  );
  check(
    'PATCH cannot change userId (403 when a different user claims it)',
    (await patch(`${BASE}/meals/${todayMealId}`, { userId: '000000000000000000000000', dinner: 'eaten' }))
      .status === 403,
  );
  check(
    'PATCH on an unknown meal id returns 404',
    (await patch(`${BASE}/meals/000000000000000000000000`, { dinner: 'eaten' })).status === 404,
  );
  check(
    'PATCH with a malformed meal id returns 400',
    (await patch(`${BASE}/meals/not-an-id`, { dinner: 'eaten' })).status === 400,
  );
  check(
    'GET /api/meals for an unknown user returns 404',
    (await get(`${BASE}/meals/000000000000000000000000`)).status === 404,
  );
  check(
    'GET /api/meals for a malformed user id returns 400',
    (await get(`${BASE}/meals/not-an-id`)).status === 400,
  );

  /* ================= 15. MEAL HISTORY ================= */
  section('15. Meal history');
  const history = await get(`${BASE}/meals/${A.id}`);
  const historyMeals = history.body?.meals || [];
  check('history returns 200', history.status === 200, `status ${history.status}`);
  check(
    'history is sorted by date ascending',
    isSortedAscending(historyMeals.map((m) => m.date)),
    historyMeals.map((m) => m.date).join(', '),
  );
  check(
    "history contains only this user's records",
    historyMeals.every((m) => m.userId === A.id),
  );
  check('history count matches the number of returned meals', history.body?.count === historyMeals.length);
  check(
    'history returns joinDate and today, so gaps can render as NOT RECORDED',
    history.body?.joinDate === joinDate && history.body?.today === today,
    `${history.body?.joinDate} / ${history.body?.today}`,
  );
  check(
    'history does not invent records for days that were never saved',
    !historyMeals.some((m) => m.date === beforeJoin),
  );

  const statsA = await get(`${BASE}/meals/stats/${A.id}`);
  check('the stats endpoint returns 200', statsA.status === 200, `status ${statsA.status}`);
  check(
    "stats totals match A's records (breakfast 1, dinner 1, total 2)",
    statsA.body?.totalBreakfastEaten === 1 &&
      statsA.body?.totalDinnerEaten === 1 &&
      statsA.body?.totalMealsEaten === 2,
    JSON.stringify({
      b: statsA.body?.totalBreakfastEaten,
      d: statsA.body?.totalDinnerEaten,
      t: statsA.body?.totalMealsEaten,
    }),
  );
  check(
    'not_eaten is excluded from the totals (only 1 of each counts)',
    statsA.body?.breakfast?.totalEaten === 1 && statsA.body?.dinner?.totalEaten === 1,
  );

  /* ================= 16 + 17. CYCLE TESTS ================= */
  const regC = await post(`${BASE}/auth/register`, {
    username: 'cycle_test',
    email: 'cycle_test@example.com',
    password: 'passC',
    joinDate,
  });
  check('the cycle test user was created', regC.status === 201, `status ${regC.status}`);
  const C = regC.body || {};

  const markDay = (offset, payload) =>
    post(`${BASE}/meals`, { userId: C.id, date: dateOffset(offset), ...payload });
  const statsOfC = () => get(`${BASE}/meals/stats/${C.id}`);

  const emptyStats = await statsOfC();
  check(
    'a member with no records is on cycle 1 at 0/30',
    emptyStats.body?.breakfast?.currentCycle === 1 &&
      emptyStats.body?.breakfast?.eatenInCurrentCycle === 0 &&
      emptyStats.body?.breakfast?.remaining === 30 &&
      emptyStats.body?.breakfast?.completedCycles === 0 &&
      emptyStats.body?.breakfast?.cycleComplete === false,
    JSON.stringify(emptyStats.body?.breakfast),
  );
  check('a member with no records has total 0', emptyStats.body?.totalMealsEaten === 0);

  // 5 days where BOTH meals were eaten
  for (let i = 1; i <= 5; i += 1) {
    await markDay(-i, { breakfast: 'eaten', dinner: 'eaten' });
  }

  const afterFive = await statsOfC();

  section('16. Breakfast cycle');
  const b5 = afterFive.body?.breakfast || {};
  check(
    '5 eaten breakfasts -> cycle 1, 5/30, 25 remaining',
    b5.currentCycle === 1 &&
      b5.eatenInCurrentCycle === 5 &&
      b5.remaining === 25 &&
      b5.completedCycles === 0 &&
      b5.cycleComplete === false,
    JSON.stringify(b5),
  );
  check(
    'breakfast counts only breakfast (5), not the 10 meals eaten',
    b5.totalEaten === 5 && afterFive.body?.totalMealsEaten === 10,
    `${b5.totalEaten} / ${afterFive.body?.totalMealsEaten}`,
  );

  section('17. Dinner cycle');
  const d5 = afterFive.body?.dinner || {};
  check(
    '5 eaten dinners -> cycle 1, 5/30, 25 remaining',
    d5.currentCycle === 1 &&
      d5.eatenInCurrentCycle === 5 &&
      d5.remaining === 25 &&
      d5.completedCycles === 0 &&
      d5.cycleComplete === false,
    JSON.stringify(d5),
  );
  check(
    'breakfast and dinner are counted independently',
    b5.totalEaten === 5 && d5.totalEaten === 5,
    `${b5.totalEaten} / ${d5.totalEaten}`,
  );

  // dinner only, 6..30 days ago -> 25 more eaten dinners (total 30)
  for (let i = 6; i <= 30; i += 1) {
    await markDay(-i, { dinner: 'eaten' });
  }

  const at30 = await statsOfC();
  const d30 = at30.body?.dinner || {};

  section('18. 30 eaten meals (cycle 1 complete)');
  check(
    '30 eaten dinners -> completedCycles 1, cycle 1 COMPLETE',
    d30.completedCycles === 1 &&
      d30.currentCycle === 2 &&
      d30.eatenInCurrentCycle === 0 &&
      d30.remaining === 30 &&
      d30.cycleComplete === true,
    JSON.stringify(d30),
  );
  check(
    '25 dinner-only days left breakfast untouched (still 5 on cycle 1)',
    at30.body?.breakfast?.totalEaten === 5 && at30.body?.breakfast?.currentCycle === 1,
    JSON.stringify(at30.body?.breakfast),
  );
  check(
    'totals report 30 dinners + 5 breakfasts = 35',
    at30.body?.totalDinnerEaten === 30 &&
      at30.body?.totalBreakfastEaten === 5 &&
      at30.body?.totalMealsEaten === 35,
    JSON.stringify({
      d: at30.body?.totalDinnerEaten,
      b: at30.body?.totalBreakfastEaten,
      t: at30.body?.totalMealsEaten,
    }),
  );
  check(
    'all 30 records are still stored (nothing is deleted at a cycle boundary)',
    (await get(`${BASE}/meals/${C.id}`)).body?.count === 30,
  );

  await markDay(-31, { dinner: 'eaten' });
  const at31 = await statsOfC();
  const d31 = at31.body?.dinner || {};

  section('19. 31 eaten meals (cycle 2 begins)');
  check(
    '31 eaten dinners -> cycle 2, 1/30',
    d31.currentCycle === 2 &&
      d31.eatenInCurrentCycle === 1 &&
      d31.remaining === 29 &&
      d31.completedCycles === 1 &&
      d31.cycleComplete === false,
    JSON.stringify(d31),
  );
  check('total dinners is now 31', at31.body?.totalDinnerEaten === 31, String(at31.body?.totalDinnerEaten));

  // dinner only, 32..60 days ago -> 29 more eaten dinners (total 60)
  for (let i = 32; i <= 60; i += 1) {
    await markDay(-i, { dinner: 'eaten' });
  }

  const at60 = await statsOfC();
  const d60 = at60.body?.dinner || {};

  section('20. 60 eaten meals (cycle 2 complete)');
  check(
    '60 eaten dinners -> completedCycles 2, cycle 2 COMPLETE',
    d60.completedCycles === 2 &&
      d60.currentCycle === 3 &&
      d60.eatenInCurrentCycle === 0 &&
      d60.remaining === 30 &&
      d60.cycleComplete === true,
    JSON.stringify(d60),
  );
  check('total dinners is now 60', at60.body?.totalDinnerEaten === 60, String(at60.body?.totalDinnerEaten));

  await markDay(-61, { dinner: 'eaten' });
  const at61 = await statsOfC();
  const d61 = at61.body?.dinner || {};

  section('21. 61 eaten meals (cycle 3 begins)');
  check(
    '61 eaten dinners -> cycle 3, 1/30',
    d61.currentCycle === 3 &&
      d61.eatenInCurrentCycle === 1 &&
      d61.remaining === 29 &&
      d61.completedCycles === 2 &&
      d61.cycleComplete === false,
    JSON.stringify(d61),
  );
  check(
    'all 61 dinner days are still stored - history is never deleted',
    (await get(`${BASE}/meals/${C.id}`)).body?.count === 61,
    `count ${(await get(`${BASE}/meals/${C.id}`)).body?.count}`,
  );
  check(
    'breakfast is still independent at 5 for the whole run',
    at61.body?.breakfast?.totalEaten === 5 && at61.body?.breakfast?.currentCycle === 1,
    JSON.stringify(at61.body?.breakfast),
  );

  /* ================= 22. USER DATA ISOLATION ================= */
  section('22. User A cannot reach User B data');
  const regB = await post(`${BASE}/auth/register`, {
    username: 'bob_test',
    email: 'bob_test@example.com',
    password: 'passB',
    joinDate,
  });
  check('user B was created', regB.status === 201, `status ${regB.status}`);
  const B = regB.body || {};

  await post(`${BASE}/meals`, {
    userId: B.id,
    date: dateOffset(-1),
    breakfast: 'eaten',
    dinner: 'eaten',
  });
  await post(`${BASE}/meals`, { userId: B.id, date: dateOffset(-2), breakfast: 'eaten' });

  const listB = await get(`${BASE}/meals/${B.id}`);
  const listA = await get(`${BASE}/meals/${A.id}`);
  const aMealIds = new Set((listA.body?.meals || []).map((m) => m.id));

  check('B history returns 200', listB.status === 200, `status ${listB.status}`);
  check(
    'B history returns only B records',
    (listB.body?.meals || []).every((m) => m.userId === B.id),
  );
  check(
    'B history contains none of A records',
    (listB.body?.meals || []).every((m) => !aMealIds.has(m.id)),
  );
  check('B history has exactly 2 records', listB.body?.count === 2, String(listB.body?.count));
  check(
    'A history returns only A records',
    (listA.body?.meals || []).every((m) => m.userId === A.id),
  );

  const statsB = await get(`${BASE}/meals/stats/${B.id}`);
  check(
    'B stats count only B meals (breakfast 2, dinner 1)',
    statsB.body?.totalBreakfastEaten === 2 &&
      statsB.body?.totalDinnerEaten === 1 &&
      statsB.body?.totalMealsEaten === 3,
    JSON.stringify({
      b: statsB.body?.totalBreakfastEaten,
      d: statsB.body?.totalDinnerEaten,
      t: statsB.body?.totalMealsEaten,
    }),
  );
  check(
    'A stats are completely unaffected by B (breakfast 1, dinner 1)',
    statsA.body?.totalBreakfastEaten === 1 && statsA.body?.totalDinnerEaten === 1,
    JSON.stringify({
      b: statsA.body?.totalBreakfastEaten,
      d: statsA.body?.totalDinnerEaten,
    }),
  );

  const crossPatch = await patch(`${BASE}/meals/${todayMealId}`, {
    userId: B.id,
    dinner: 'not_eaten',
  });
  check(
    'PATCH on an A record while claiming B returns 403',
    crossPatch.status === 403,
    `status ${crossPatch.status} :: ${JSON.stringify(crossPatch.body)}`,
  );

  const crossPatchQuery = await patch(`${BASE}/meals/${todayMealId}?userId=${B.id}`, {
    dinner: 'not_eaten',
  });
  check(
    'the same claim sent as ?userId= is also refused with 403',
    crossPatchQuery.status === 403,
    `status ${crossPatchQuery.status}`,
  );

  const todayAfterCross = ((await get(`${BASE}/meals/${A.id}`)).body?.meals || []).find(
    (m) => m.id === todayMealId,
  );
  check(
    'the refused cross-user PATCH changed nothing',
    todayAfterCross?.dinner === 'eaten',
    String(todayAfterCross?.dinner),
  );
  check(
    'A can still update its own record normally',
    (await patch(`${BASE}/meals/${todayMealId}`, { dinner: 'eaten' })).status === 200,
  );

  /* ================= schema check ================= */
  section('Schema check');
  await mongoose.connect(TEST_MONGO_URI, { serverSelectionTimeoutMS: 15000 });

  const mealIndexes = await mongoose.connection.db.collection('meals').indexes();
  check(
    'a unique compound index on { userId, date } exists',
    mealIndexes.some((ix) => ix.unique === true && ix.key?.userId === 1 && ix.key?.date === 1),
    JSON.stringify(mealIndexes),
  );

  const userIndexes = await mongoose.connection.db.collection('users').indexes();
  check(
    'unique indexes exist on username and on email',
    userIndexes.some((ix) => ix.unique === true && ix.key?.username === 1) &&
      userIndexes.some((ix) => ix.unique === true && ix.key?.email === 1),
    JSON.stringify(userIndexes),
  );

  const storedMeal = await mongoose.connection.db.collection('meals').findOne({});
  check(
    'dates are stored as plain YYYY-MM-DD strings',
    typeof storedMeal?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(storedMeal.date),
    String(storedMeal?.date),
  );

  const notRecorded = await mongoose.connection.db
    .collection('meals')
    .countDocuments({ $or: [{ breakfast: 'not_recorded' }, { dinner: 'not_recorded' }] });
  check('no "not_recorded" documents or values are stored anywhere', notRecorded === 0);

  const storedUser = await mongoose.connection.db
    .collection('users')
    .findOne({ username: 'ali_test' });
  check(
    'a user document has exactly the expected fields (no messNo, no activeMember)',
    JSON.stringify(Object.keys(storedUser || {}).sort()) ===
      JSON.stringify(['_id', 'email', 'joinDate', 'password', 'username']),
    JSON.stringify(Object.keys(storedUser || {}).sort()),
  );

  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  console.log(`\nThe throwaway database "${TEST_DB_NAME}" was dropped.`);
}

/* ------------------------------------------------------------------ */
/* Reporting + shutdown                                                */
/* ------------------------------------------------------------------ */

let finished = false;

async function finish() {
  if (finished) return;
  finished = true;

  console.log('\n==================================================');
  console.log(`  PHASE 1 API TESTS: ${passed} passed, ${failures.length} failed`);
  console.log('==================================================');

  if (failures.length) {
    console.log('\nFailed checks:');
    failures.forEach((name) => console.log(`  - ${name}`));
  }

  server.kill();
  setTimeout(() => process.exit(failures.length ? 1 : 0), 300);
}

main()
  .then(finish)
  .catch(async (error) => {
    console.error('\n!! The test run crashed before finishing:');
    console.error(error);
    console.error('\n--- server output ---');
    console.error(serverLog);
    await finish();
  });
