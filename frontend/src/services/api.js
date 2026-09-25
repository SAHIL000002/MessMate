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

/** POST /api/auth/register -> { id, username, email, joinDate } */
export async function registerUser({ username, email, password, joinDate }) {
  const { data } = await api.post('/auth/register', {
    username,
    email,
    password,
    joinDate,
  });
  return data;
}

/** POST /api/auth/login -> { id, username, email, joinDate } (no token exists) */
export async function loginUser({ identifier, password }) {
  const { data } = await api.post('/auth/login', { identifier, password });
  return data;
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

/** GET /api/health - also used as the "is the server reachable?" probe. */
export async function checkHealth() {
  const { data } = await api.get('/health', { timeout: PROBE_TIMEOUT });
  return data;
}

export default api;


