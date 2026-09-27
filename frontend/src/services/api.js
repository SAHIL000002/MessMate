/**
 * MessMate API configuration - the ONE place the backend URL is defined.
 *
 * Never hardcode an IP anywhere else in the app. A physical Android or
 * iPhone cannot reach `localhost` / `127.0.0.1`, so the base URL is
 * resolved in this order:
 *
 *   1. EXPO_PUBLIC_API_URL from frontend/.env  (explicit override)
 *   2. The LAN host of the running Expo dev server (auto-detect)
 *   3. http://localhost:5000/api               (web / simulator fallback)
 *
 * The backend listens on 0.0.0.0:5000 and its routes are prefixed `/api`.
 */

import axios from 'axios';
import Constants from 'expo-constants';

const API_PORT = 5000;

function detectDevHost() {
  // e.g. "192.168.1.50:8081" while `expo start` is running on the LAN.
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.debuggerHost ||
    Constants.manifest2?.extra?.expoGo?.debuggerHost;

  if (!hostUri) return null;

  const host = String(hostUri).split(':')[0];
  if (!host || host === 'localhost' || host === '127.0.0.1') return null;

  return `http://${host}:${API_PORT}/api`;
}

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL || detectDevHost() || `http://localhost:${API_PORT}/api`;

// Explained to the user whenever a request fails, so they can fix it themselves.
export const API_HELP_TEXT =
  'Could not reach the MessMate server.\n\n' +
  'Check that the backend is running (npm run dev inside backend/) ' +
  'and that your phone is on the same Wi-Fi as this computer.\n\n' +
  `Trying: ${API_BASE_URL}`;

// Shown when the phone is clearly offline. Short, because being offline is a
// normal state for this app - not an error the user has to panic about.
export const OFFLINE_MESSAGE =
  'You are offline. MessMate keeps working on this device and will sync later.';

// Health probe is deliberately impatient: waiting 15s to discover there is no
// network would make the app feel broken.
const PROBE_TIMEOUT = 4000;

// Sync/download requests are bounded so a bad Wi-Fi connection can never
// leave the user staring at a spinner forever.
const SYNC_TIMEOUT = 10000;

// Sign in and sign up are the only calls that MUST reach the server, and the
// free hosting tier sleeps when it is not used: the first request of the day
// can take ~25 seconds to answer because the instance is still booting. Being
// told "you are offline" after 10s - and then seeing it work 10s later - is a
// bug, not a state. These calls therefore get a cold-start-sized budget.
const AUTH_TIMEOUT = 30000;

// Waiting for a sleeping server must not turn into waiting forever, and it
// must never delay a phone that simply has no connection. The ladder keeps the
// old impatient 4s first probe; only a SLOW answer escalates, because only a
// slow answer means "the server is there, it is just starting".
const COLD_START_TIMEOUTS = [4000, 12000, 20000];
const COLD_START_DELAYS = [500, 1500];

// One extra try after a request that failed instantly (a DNS blip, a Wi-Fi
// handover). Short on purpose: time cannot fix a phone in airplane mode.
const QUICK_RETRY_DELAY = 300;

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: SYNC_TIMEOUT,
  headers: { 'Content-Type': 'application/json' },
});

/** True when the request never reached the server (offline, timeout, DNS). */
export function isNetworkError(error) {
  if (error?.response) return false; // the server answered - not a network problem
  return true;
}

/** True when the server exists but did not answer inside its budget. */
export function isTimeoutError(error) {
  if (error?.response) return false; // the server answered - not a timeout
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') return true;
  return /timeout/i.test(String(error?.message || ''));
}

/** The hosting edge answered while the instance was still booting. */
function isWakingError(error) {
  const status = error?.response?.status;
  return status === 502 || status === 504;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wait for the server to answer instead of declaring it offline too early.
 *
 * The API runs on a free hosting tier that sleeps when idle, so the first
 * request after that waits for the instance to boot - around 20 seconds, which
 * is far longer than a normal request timeout. This ladder gives it that time:
 *
 *   - a SLOW answer (timeout, or 502/504 from the edge) means "it is starting",
 *     so it is retried with a bigger budget;
 *   - an INSTANT failure (airplane mode, no Wi-Fi, wrong host) is not retried
 *     in a loop, because waiting cannot fix it.
 *
 * Returns { ok, health, error, attempts, waitedMs }. It never throws.
 */
export async function wakeUpServer(options = {}) {
  const timeouts = options.timeouts || COLD_START_TIMEOUTS;
  const delays = options.delays || COLD_START_DELAYS;
  const startedAt = Date.now();

  let attempts = 0;
  let quickRetryUsed = false;
  let lastError = null;

  const result = (ok, health) => ({
    ok,
    health: health || null,
    error: ok ? null : lastError,
    attempts,
    waitedMs: Date.now() - startedAt,
  });

  for (let i = 0; i < timeouts.length; i += 1) {
    attempts += 1;

    try {
      const { data } = await api.get('/health', { timeout: timeouts[i] });
      return result(true, data);
    } catch (error) {
      lastError = error;

      if (!isTimeoutError(error) && !isWakingError(error)) {
        // Waiting cannot fix this one, so only a single quick retry is made.
        if (quickRetryUsed) break;
        quickRetryUsed = true;
        await wait(options.quickRetryDelay ?? QUICK_RETRY_DELAY);
        continue;
      }

      // The server is there but slow: give it more time before trying again.
      if (i < timeouts.length - 1) {
        await wait(delays[i] ?? delays[delays.length - 1] ?? 0);
      }
    }
  }

  return result(false, null);
}

// Turn Axios failures into one short, human-readable message so every
// screen can show the same friendly error + TRY AGAIN. Raw stack traces and
// axios internals are never shown to the user.
export function getErrorMessage(error) {
  // 1. The server sent a message written for a person - use it as-is.
  if (error?.response?.data?.message) return error.response.data.message;

  const status = error?.response?.status;

  // 2. The server answered, but without a usable message.
  if (status === 401) return 'Incorrect username/email or password.';
  if (status === 409) return 'That username or email is already registered.';
  if (status === 502 || status === 504) {
    // The hosting edge answered while the instance was still starting.
    return 'The MessMate server is starting up. Please try again in a few seconds.';
  }
  if (status === 503) {
    return 'The MessMate server cannot reach its database right now. Please try again shortly.';
  }
  if (status) return `Server error (${status}). Please try again.`;

  // 3. No answer at all.
  if (error?.code === 'ECONNABORTED') {
    return 'The server took too long to answer. Check your connection and try again.';
  }
  return API_HELP_TEXT;
}

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

/**
 * Run a sign-in / sign-up call with cold-start protection.
 *
 * The call gets the longer auth budget. If it still fails without an answer,
 * the server is probed until it DOES answer, and the call is then repeated
 * exactly once. A real answer from the server (401, 409, 503...) is never
 * retried - the user has to see it - and the password is never kept anywhere
 * to be replayed later.
 */
async function authWithWakeUp(run, options = {}) {
  const timeout = options.timeout ?? AUTH_TIMEOUT;

  try {
    return await run(timeout);
  } catch (error) {
    // The server answered, or there is no connection at all: do not loop.
    if (!isNetworkError(error)) throw error;
    if (!isTimeoutError(error) && !isWakingError(error)) throw error;

    const woke = await wakeUpServer(options.wakeUp);
    if (!woke.ok) throw error;

    return run(timeout);
  }
}

/** POST /api/auth/register -> { id, username, email, joinDate } */
export async function registerUser({ username, email, password, joinDate }, options) {
  return authWithWakeUp(async (timeout) => {
    const { data } = await api.post(
      '/auth/register',
      { username, email, password, joinDate },
      { timeout },
    );
    return data;
  }, options);
}

/** POST /api/auth/login -> { id, username, email, joinDate } (no token exists) */
export async function loginUser({ identifier, password }, options) {
  return authWithWakeUp(async (timeout) => {
    const { data } = await api.post('/auth/login', { identifier, password }, { timeout });
    return data;
  }, options);
}

/* ------------------------------------------------------------------ */
/* Meals                                                               */
/* ------------------------------------------------------------------ */

/**
 * A meal from the server ({ id, ... }) -> the LOCAL record shape
 * ({ _id, userId, date, breakfast, dinner }).
 */
export function mapServerMeal(meal) {
  return {
    _id: meal?.id ?? meal?._id ?? null,
    userId: meal?.userId,
    date: meal?.date,
    breakfast: meal?.breakfast,
    dinner: meal?.dinner,
  };
}

/** GET /api/meals/:userId - every record the server holds for this user. */
export async function fetchMealRecords(userId) {
  const { data } = await api.get(`/meals/${userId}`, { timeout: SYNC_TIMEOUT });
  const meals = Array.isArray(data?.meals) ? data.meals.map(mapServerMeal) : [];

  return {
    userId: data?.userId,
    joinDate: data?.joinDate,
    today: data?.today,
    count: meals.length,
    meals,
  };
}

/**
 * POST /api/meals - create OR update one day.
 *
 * The backend upserts on userId + date, so sending the same day twice can
 * never create a duplicate row, and omitting a meal leaves it untouched.
 */
export async function saveMealRecord({ userId, date, breakfast, dinner }) {
  const body = { userId, date };
  if (breakfast !== undefined && breakfast !== null) body.breakfast = breakfast;
  if (dinner !== undefined && dinner !== null) body.dinner = dinner;

  const { data } = await api.post('/meals', body, { timeout: SYNC_TIMEOUT });
  return mapServerMeal(data);
}

/* ------------------------------------------------------------------ */
/* Health                                                              */
/* ------------------------------------------------------------------ */

/** GET /api/health - one quick attempt, exactly as before. */
export async function checkHealth() {
  const { data } = await api.get('/health', { timeout: PROBE_TIMEOUT });
  return data;
}

/**
 * GET /api/health, giving a sleeping server time to wake up.
 *
 * Used by the online/offline check, so a slow cold start is not mistaken for
 * "you are offline". Throws only when even the whole ladder got no answer.
 */
export async function checkHealthWithWakeUp(options) {
  const result = await wakeUpServer(options);

  if (!result.ok) {
    throw result.error || new Error('The MessMate server did not answer.');
  }

  return result.health;
}

export default api;


