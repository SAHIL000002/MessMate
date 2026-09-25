/**
 * MessMate - local storage (AsyncStorage only).
 *
 * OFFLINE-FIRST: everything the app needs in order to keep working without
 * internet lives in these three keys. No SQLite, no Realm, no WatermelonDB -
 * three keys are plenty for a 5-6 person mess tracker.
 *
 *   messmate_user                    signed-in identity { id, username, email, joinDate }
 *   messmate_meals_<userId>          that user's meal records, ONE per date
 *   messmate_pending_sync_<userId>   local changes not uploaded yet
 *
 * There is NO password, token, cookie or secret in any key - the backend has
 * no JWT, so there is nothing of that kind to store.
 *
 * LOCAL MEAL RECORD
 *   { _id, userId, date, breakfast, dinner }
 *
 * breakfast / dinner are 'eaten' or 'not_eaten'. A MISSING record means
 * "NOT RECORDED" - the string 'not_recorded' is never written anywhere.
 *
 * A day only stores the meals the member actually decided, so a brand new day
 * that was marked for breakfast alone carries just `breakfast`. The untouched
 * meal stays absent, which is how it reads as NOT RECORDED; `getLocalMeal()`
 * fills that side with the backend default for callers that need a complete
 * day, without ever rewriting what is stored.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import { isRealDateString } from '../utils/date';

export const MEAL_STATUS = { EATEN: 'eaten', NOT_EATEN: 'not_eaten' };

export const MEAL_TYPES = { BREAKFAST: 'breakfast', DINNER: 'dinner' };

const MEALS_PREFIX = 'messmate_meals_';
const PENDING_PREFIX = 'messmate_pending_sync_';

export const STORAGE_KEYS = {
  user: 'messmate_user',
  mealsFor: (userId) => `${MEALS_PREFIX}${userId}`,
  pendingFor: (userId) => `${PENDING_PREFIX}${userId}`,
};

/* ------------------------------------------------------------------ */
/* Raw JSON helpers                                                    */
/* ------------------------------------------------------------------ */

async function readJSON(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null || raw === undefined || raw === '') return fallback;

    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch (error) {
    // Corrupt or unreadable value: fall back instead of crashing the app.
    console.warn(`[storage] could not read "${key}": ${error?.message}`);
    return fallback;
  }
}

async function writeJSON(key, value) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

function sortByDate(list) {
  return [...list].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function isStatus(value) {
  return value === MEAL_STATUS.EATEN || value === MEAL_STATUS.NOT_EATEN;
}

/* ------------------------------------------------------------------ */
/* Change notification                                                 */
/* ------------------------------------------------------------------ */
/*
 * ONE tiny subscription list, and the reason Home and Meals can never
 * disagree.
 *
 * Every write to a local meal record - or to the pending queue - ends with
 * `notifyMealsChanged(userId)`. Anything that DISPLAYS meal data subscribes
 * here, so a tap on one screen reaches the other screen immediately instead of
 * waiting for a remount, a pull-to-refresh or an app restart.
 *
 * Deliberately not an event library: one Set, two functions, no dependency.
 * Synchronous by design, so a subscriber knows a change happened by the time
 * the write promise resolves.
 */
const mealListeners = new Set();

/**
 * Listen for local meal changes. Returns the unsubscribe function, so it can
 * be used directly as a `useEffect` cleanup.
 */
export function subscribeToMealChanges(listener) {
  if (typeof listener !== 'function') return () => {};

  mealListeners.add(listener);
  return () => {
    mealListeners.delete(listener);
  };
}

/** Tell every subscriber that this user's meal data changed. */
export function notifyMealsChanged(userId) {
  for (const listener of [...mealListeners]) {
    try {
      listener(userId || null);
    } catch (error) {
      // A broken listener must never break the write that triggered it.
      console.warn(`[storage] a meal-change listener failed: ${error?.message}`);
    }
  }
}

/**
 * Decide the stored value of one meal field.
 *
 * - the update mentions a valid status  -> use it
 * - the update says nothing about it    -> KEEP exactly what is stored
 * - nothing is stored for it yet        -> stay absent ("NOT RECORDED")
 *
 * The middle rule is what stops a dinner change from wiping breakfast: a day
 * only ever carries the meals the member actually decided, so the untouched
 * meal keeps its own value instead of being rewritten to a default.
 */
function resolveStatus(incoming, current) {
  // This write says nothing about the meal: keep what the day already has.
  // A brand new day therefore stores only the decided meal(s); the untouched
  // side stays absent, and an absent meal IS "NOT RECORDED".
  if (incoming === undefined || incoming === null) {
    return isStatus(current) ? current : undefined;
  }

  if (!isStatus(incoming)) {
    throw new Error(
      `Invalid meal status "${incoming}". Use "${MEAL_STATUS.EATEN}" or "${MEAL_STATUS.NOT_EATEN}".`,
    );
  }

  return incoming;
}

function mentions(value) {
  return value !== undefined && value !== null;
}

/* ------------------------------------------------------------------ */
/* Session identity                                                    */
/* ------------------------------------------------------------------ */

/**
 * The ONLY four fields ever written for a session.
 *
 * Whitelisting here means that even if a caller passes a whole axios
 * response straight in, a password (or anything else the server adds later)
 * can never reach the device.
 */
function sessionShape(user) {
  return {
    id: String(user?.id ?? user?._id ?? ''),
    username: String(user?.username ?? ''),
    email: String(user?.email ?? ''),
    joinDate: String(user?.joinDate ?? ''),
  };
}

/** Save the signed-in identity. Returns exactly what was written. */
export async function saveLocalUser(user) {
  const session = sessionShape(user);

  if (!session.id) {
    throw new Error('Cannot save a session without a user id.');
  }

  await writeJSON(STORAGE_KEYS.user, session);
  return session;
}

/** The saved identity, or null when nobody is signed in on this device. */
export function getLocalUser() {
  return readJSON(STORAGE_KEYS.user, null);
}

/**
 * Forget the session. Meal records are deliberately left untouched, so the
 * same user can sign in again later and still have their history.
 */
export async function clearLocalUser() {
  await AsyncStorage.removeItem(STORAGE_KEYS.user);
}

/** userIds that have meal records saved on this device (offline hint). */
export async function getLocalMealStoreUserIds() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    return keys
      .filter((key) => typeof key === 'string' && key.startsWith(MEALS_PREFIX))
      .map((key) => key.slice(MEALS_PREFIX.length));
  } catch (error) {
    console.warn(`[storage] could not list keys: ${error?.message}`);
    return [];
  }
}

/* ------------------------------------------------------------------ */
/* Local meal records                                                  */
/* ------------------------------------------------------------------ */

/** Every saved record for one user, oldest first. Never throws. */
export async function getLocalMeals(userId) {
  if (!userId) return [];

  const stored = await readJSON(STORAGE_KEYS.mealsFor(userId), []);
  if (!Array.isArray(stored)) return [];

  return sortByDate(
    stored.filter((meal) => meal && typeof meal === 'object' && isRealDateString(meal.date)),
  );
}

/**
 * One saved record, or null when that day is NOT RECORDED on this device.
 *
 * A stored day is SPARSE: it only carries the meals the member decided, and
 * an untouched meal means NOT RECORDED. Callers that need a complete,
 * backend-shaped day - the shape `POST /api/meals` speaks and the Phase 2
 * storage contract promises - get the missing side filled with the backend
 * default, 'not_eaten'.
 *
 * Reading never rewrites the stored value: nothing is written back here.
 */
export async function getLocalMeal(userId, date) {
  if (!userId || !isRealDateString(date)) return null;

  const meals = await getLocalMeals(userId);
  const found = meals.find((meal) => meal.date === date);
  if (!found) return null;

  return {
    ...found,
    breakfast: isStatus(found.breakfast) ? found.breakfast : MEAL_STATUS.NOT_EATEN,
    dinner: isStatus(found.dinner) ? found.dinner : MEAL_STATUS.NOT_EATEN,
  };
}

/** How many days are saved locally (missing days are NOT RECORDED). */
export async function countLocalMeals(userId) {
  const meals = await getLocalMeals(userId);
  return meals.length;
}

/**
 * Insert or update ONE day for ONE user.
 *
 * This is the ONLY place a local meal record is written, and it is keyed on
 * `userId + date`, so a duplicate for the same day is impossible. When the
 * day already exists, any field the caller does not mention keeps its stored
 * value - changing dinner can never reset breakfast.
 *
 * `_id` is the server id once known; it stays null for a day that has only
 * ever existed on this device.
 */
export async function saveLocalMeal(meal) {
  const userId = meal?.userId;

  if (!userId) {
    throw new Error('saveLocalMeal needs a userId.');
  }
  if (!isRealDateString(meal?.date)) {
    throw new Error(
      `saveLocalMeal needs a real YYYY-MM-DD date (received "${meal?.date}").`,
    );
  }

  const changesBreakfast = mentions(meal.breakfast);
  const changesDinner = mentions(meal.dinner);

  // Same rule as the backend: a day has to carry at least one decision.
  if (!changesBreakfast && !changesDinner) {
    throw new Error('A meal update must change breakfast, dinner, or both.');
  }

  const meals = await getLocalMeals(userId);
  const index = meals.findIndex((item) => item.date === meal.date);
  const existing = index >= 0 ? meals[index] : null;

  const next = {
    _id: mentions(meal._id) ? String(meal._id) : (existing?._id ?? null),
    userId: String(userId),
    date: meal.date,
    breakfast: resolveStatus(meal.breakfast, existing?.breakfast),
    dinner: resolveStatus(meal.dinner, existing?.dinner),
  };

  if (existing) {
    meals[index] = next;
  } else {
    meals.push(next);
  }

  await writeJSON(STORAGE_KEYS.mealsFor(userId), sortByDate(meals));

  // The ONE write path for a local meal record just finished. Tell anything
  // that displays meal data (Home, Meals, a future report screen) so they all
  // show the same value without a remount.
  notifyMealsChanged(userId);

  return next;
}

/**
 * Change the day that already exists (or create it).
 * Only breakfast / dinner / _id can be changed - never the user or the date.
 */
export async function updateLocalMeal(userId, date, changes = {}) {
  return saveLocalMeal({
    userId,
    date,
    _id: changes._id,
    breakfast: changes.breakfast,
    dinner: changes.dinner,
  });
}

/**
 * Bulk insert-or-update, used by the download/sync step.
 *
 * Records for dates that are NOT in `incoming` are left completely alone -
 * a download can add and refresh, but it can never delete anything here.
 * Returns { added, updated } for reporting.
 */
export async function mergeLocalMeals(userId, incoming) {
  if (!userId) return { added: 0, updated: 0 };

  const list = Array.isArray(incoming) ? incoming : [];
  const meals = await getLocalMeals(userId);
  const byDate = new Map(meals.map((meal) => [meal.date, meal]));

  let added = 0;
  let updated = 0;

  for (const record of list) {
    if (!record || !isRealDateString(record.date)) continue;

    const existing = byDate.get(record.date);

    byDate.set(record.date, {
      _id: mentions(record._id) ? String(record._id) : (existing?._id ?? null),
      userId: String(userId),
      date: record.date,
      breakfast: resolveStatus(record.breakfast, existing?.breakfast),
      dinner: resolveStatus(record.dinner, existing?.dinner),
    });

    if (existing) {
      updated += 1;
    } else {
      added += 1;
    }
  }

  await writeJSON(STORAGE_KEYS.mealsFor(userId), sortByDate([...byDate.values()]));

  // Only speak up when something actually moved - a download that changed
  // nothing must not make every screen re-read.
  if (added > 0 || updated > 0) notifyMealsChanged(userId);

  return { added, updated };
}

/**
 * LOCAL ONLY - remove one day from this device.
 *
 * No Phase 2 screen calls this, and it deliberately does NOT queue a
 * "pending delete": the backend has no DELETE route and meal history must
 * never be destroyed. A day removed here comes straight back on the next
 * download, so nothing can be lost silently.
 */
export async function deleteLocalMeal(userId, date) {
  if (!userId || !isRealDateString(date)) return false;

  const meals = await getLocalMeals(userId);
  const remaining = meals.filter((meal) => meal.date !== date);

  if (remaining.length === meals.length) return false;

  await writeJSON(STORAGE_KEYS.mealsFor(userId), remaining);
  notifyMealsChanged(userId);
  return true;
}

/* ------------------------------------------------------------------ */
/* Pending sync queue                                                  */
/* ------------------------------------------------------------------ */
/*
 * A pending item is the SMALLEST change that still has to reach the server:
 *
 *   { userId, date, at, breakfast?, dinner? }
 *
 * Only the meal(s) the user actually touched are listed, and there is at
 * most ONE item per date - marking breakfast and then dinner on the same day
 * leaves a single item carrying both fields.
 */

/** Everything queued for this user, oldest first. */
export async function getPendingSync(userId) {
  if (!userId) return [];

  const stored = await readJSON(STORAGE_KEYS.pendingFor(userId), []);
  if (!Array.isArray(stored)) return [];

  return sortByDate(
    stored.filter((item) => item && typeof item === 'object' && isRealDateString(item.date)),
  );
}

/** How many days are still waiting to be uploaded. */
export async function countPendingSync(userId) {
  const items = await getPendingSync(userId);
  return items.length;
}

/**
 * Queue a local change (insert or update - never a second row per date).
 * Fields the change does not mention keep whatever was already queued.
 */
export async function savePendingSync(userId, change) {
  const date = change?.date;

  if (!userId) {
    throw new Error('savePendingSync needs a userId.');
  }
  if (!isRealDateString(date)) {
    throw new Error(
      `savePendingSync needs a real YYYY-MM-DD date (received "${date}").`,
    );
  }
  if (!mentions(change.breakfast) && !mentions(change.dinner)) {
    throw new Error('A pending change must include breakfast, dinner, or both.');
  }

  const items = await getPendingSync(userId);
  const index = items.findIndex((item) => item.date === date);
  const current = index >= 0 ? items[index] : null;

  const breakfast = mentions(change.breakfast) ? change.breakfast : current?.breakfast;
  const dinner = mentions(change.dinner) ? change.dinner : current?.dinner;

  const next = { userId: String(userId), date, at: new Date().toISOString() };
  if (mentions(breakfast)) next.breakfast = breakfast;
  if (mentions(dinner)) next.dinner = dinner;

  if (index >= 0) {
    items[index] = next;
  } else {
    items.push(next);
  }

  await writeJSON(STORAGE_KEYS.pendingFor(userId), sortByDate(items));

  // A queue change is a meal change as far as the screens are concerned: the
  // "waiting to upload" note has to appear (and disappear) at the same moment
  // the meal itself does.
  notifyMealsChanged(userId);

  return next;
}

/**
 * Drop queued changes for one date, or - with no date - the whole queue.
 * Called only after the server has accepted them.
 */
export async function clearPendingSync(userId, date = null) {
  if (!userId) return;

  if (date === null) {
    await AsyncStorage.removeItem(STORAGE_KEYS.pendingFor(userId));
    notifyMealsChanged(userId);
    return;
  }

  const items = await getPendingSync(userId);
  await writeJSON(
    STORAGE_KEYS.pendingFor(userId),
    items.filter((item) => item.date !== date),
  );

  // The change reached the server, so the "waiting to upload" note goes away
  // on every screen at once.
  notifyMealsChanged(userId);
}



