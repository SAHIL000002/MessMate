/**
 * MessMate - local-first meal operations.
 *
 * These are the functions the Home and Meals screens will call (and that the
 * Phase 2 tests already exercise). The rule is always the same:
 *
 *   1. write to the device FIRST, so the tap is never lost
 *   2. queue the change for upload
 *   3. if the server is reachable, upload now and clear the queue entry
 *   4. if it is not, leave it queued - nothing is lost, nothing blocks
 *
 * Missing record = "NOT RECORDED". The string 'not_recorded' is never used.
 */

import * as api from './api';
import * as storage from './storage';
import { forgetOnlineState, isServerKnownReachable } from './sync';
import { buildUserStats } from '../utils/cycle';
import { buildMealHistory } from '../utils/mealHistory';
import { isFutureDateString, isRealDateString, toDateString, todayString } from '../utils/date';

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

/** Every saved record for this user, oldest first. */
export async function getMeals(userId) {
  return storage.getLocalMeals(userId);
}

/** One saved record, or null when that day is NOT RECORDED. */
export async function getMeal(userId, date) {
  return storage.getLocalMeal(userId, date);
}

/** How many days are saved on this device. */
export async function countMeals(userId) {
  return storage.countLocalMeals(userId);
}

/**
 * Everything the Home screen shows, read ONLY from this device.
 *
 * This is a read: it never writes, never uploads and never deletes anything,
 * so Home can call it with the phone in airplane mode. Nothing here talks to
 * the network - the records and the waits are already on the device.
 *
 * The cycle numbers cover the member's own tracking range, `joinDate -> date`.
 * There is no global start date anywhere: the boundary is always this user's
 * joinDate, and a record outside the range is ignored, never deleted.
 *
 * Returns:
 *   date          the day this summary is for (YYYY-MM-DD, local)
 *   meal          that day's record, or null when it is NOT RECORDED
 *   breakfast     cycle object for breakfast  { currentCycle, eatenInCurrentCycle, remaining, ... }
 *   dinner        cycle object for dinner     (completely independent counter)
 *   records       how many days are stored on this device
 *   pending       days still waiting to upload
 *   pendingToday  true when today's change has not reached the server yet
 */
export async function getTodaySummary(userId, { joinDate = '', date } = {}) {
  const day = isRealDateString(date) ? date : todayString();

  const meals = await storage.getLocalMeals(userId);
  const pending = await storage.getPendingSync(userId);
  const stats = buildUserStats(meals, { joinDate, today: day });

  return {
    date: day,
    meal: meals.find((item) => item.date === day) || null,
    breakfast: stats.breakfast,
    dinner: stats.dinner,
    // The estimated 30-meal completion date for each meal, from that meal's
    // own dates only. `date` is null when there is not enough history yet.
    expected: stats.expected,
    totalEaten: stats.totalEaten,
    records: meals.length,
    countedRecords: stats.countedRecords,
    pending: pending.length,
    // The queue itself, for callers that report on it (the PDF says how many
    // days in the report have not uploaded yet).
    pendingItems: pending,
    pendingToday: pending.some((item) => item.date === day),
  };
}

/**
 * The complete date-wise history the Meals screen shows, read ONLY from this
 * device.
 *
 * Every date in the member's own range, `joinDate -> today`, gets a row -
 * including the dates with no record at all, which read as NOT RECORDED
 * (null breakfast / dinner). Newest date first, like the Stitch Meals table.
 *
 * Exactly like `getTodaySummary()` this is a pure read: no writes, no
 * uploads, no network, so Meals renders the full history in airplane mode.
 */
export async function getMealHistory(userId, { joinDate = '', date } = {}) {
  const day = isRealDateString(date) ? date : todayString();

  const meals = await storage.getLocalMeals(userId);
  const pending = await storage.getPendingSync(userId);

  return buildMealHistory(meals, { joinDate, today: day, pending });
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

function validate({ userId, date, meal, status, joinDate }) {
  if (!userId) throw new Error('A userId is required.');

  if (!isRealDateString(date)) {
    throw new Error('Pick a real date in YYYY-MM-DD format.');
  }
  if (isFutureDateString(date)) {
    throw new Error('You cannot mark a meal in the future.');
  }
  if (joinDate && date < joinDate) {
    throw new Error(`That date is before your mess join date (${joinDate}).`);
  }
  if (meal !== storage.MEAL_TYPES.BREAKFAST && meal !== storage.MEAL_TYPES.DINNER) {
    throw new Error('Meal must be "breakfast" or "dinner".');
  }
  if (status !== storage.MEAL_STATUS.EATEN && status !== storage.MEAL_STATUS.NOT_EATEN) {
    throw new Error('Status must be "eaten" or "not_eaten".');
  }
}

/**
 * Mark ONE meal for ONE day as eaten / not eaten.
 *
 * Only the named meal is sent to the local store, so the other meal of the
 * day keeps whatever it already had:
 *
 *   breakfast = eaten  (the other meal of that day is untouched)
 *   -> markMeal(dinner = eaten)
 *   -> breakfast = eaten, dinner = eaten    (never reset to a default)
 *
 * A day that had never been recorded stores just the meal the member
 * decided, so a meal nobody has touched still reads as NOT RECORDED.
 *
 * Returns { meal, queued, synced, message } and never throws for a network
 * problem - an offline tap is a success that simply has not uploaded yet.
 */
export async function markMeal({ userId, date, meal, status, joinDate }) {
  validate({ userId, date, meal, status, joinDate });

  // 1. Save locally. The untouched meal of the day is preserved.
  let record = await storage.saveLocalMeal({ userId, date, [meal]: status });

  // 2. Queue the change so it survives a restart or a dead battery.
  await storage.savePendingSync(userId, { date, [meal]: status });

  // 3. Upload straight away only when this phone has recently reached the
  //    server. A phone with no such proof (never connected, or the last
  //    upload failed) writes locally and queues instead of firing a request
  //    that cannot arrive, so an offline tap costs zero network calls.
  if (!isServerKnownReachable()) {
    return { meal: record, queued: true, synced: false, message: null };
  }

  try {
    // The complete, backend-shaped day is sent, so the server never has to
    // guess a meal the member has not decided about.
    const local = (await storage.getLocalMeal(userId, date)) || record;

    const saved = await api.saveMealRecord({
      userId,
      date,
      breakfast: local.breakfast,
      dinner: local.dinner,
    });

    // The local day stays sparse - it only carries real decisions - but it
    // keeps the server id so a later phase can PATCH exactly this record.
    record = await storage.saveLocalMeal({ userId, date, _id: saved._id, [meal]: status });
    await storage.clearPendingSync(userId, date);

    return { meal: record, queued: false, synced: true, message: null };
  } catch (error) {
    // The upload did not land after all, so stop trusting that state: the
    // next tap queues quietly until a sync proves the server is back.
    forgetOnlineState();

    return {
      meal: record,
      queued: true,
      synced: false,
      message: api.getErrorMessage(error),
    };
  }
}
