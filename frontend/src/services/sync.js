/**
 * MessMate - sync / download service.
 *
 * WHAT THIS IS
 * ------------
 * Local storage is what the app runs on. The server is a backup that keeps
 * other devices in step. This file moves data between the two and does
 * nothing else - no conflict engine, no background worker, no queue library.
 *
 * THE RULE
 * --------
 *   - A locally made change is QUEUED until the server has accepted it.
 *   - Upload the queue FIRST, then download.
 *   - A date whose upload failed keeps its local value, so a failed upload
 *     can never lose the user's change.
 *   - Same userId + date is the same meal record, always.
 *   - Nothing is ever deleted, locally or remotely.
 */

import * as api from './api';
import * as storage from './storage';

// `isOnline()` probes /api/health. A healthy answer is cached for a few
// seconds so one user action does not fire the same probe three times.
// An OFFLINE answer is never cached: `markMeal()` and the background sync
// both check the network first, and caching "you are in a tunnel" would turn
// one dead probe into a whole batch of silent skips.
let probe = { at: 0, online: false };
const PROBE_CACHE_MS = 5000;

// A probe that SUCCEEDED is remembered much longer than the probe cache
// itself. That memory is what lets a meal tap upload straight away without
// firing a health probe of its own - and it is why a tap on a phone that has
// never had an answer (or whose last upload failed) is written locally and
// queued instead of spending a request that cannot arrive.
const REACHABLE_MEMORY_MS = 5 * 60 * 1000;

/** Remember that this phone really did reach the server just now. */
function rememberReachable() {
  probe = { at: Date.now(), online: true };
}

/* ------------------------------------------------------------------ */
/* Connectivity                                                        */
/* ------------------------------------------------------------------ */

/**
 * Is the backend reachable right now?
 *
 * There is no NetInfo dependency on purpose: "can I actually talk to the
 * server?" is the only question this app needs answered, and a failed
 * request is the honest answer to it.
 */
export async function isOnline() {
  const now = Date.now();
  if (probe.at && now - probe.at < PROBE_CACHE_MS) return probe.online;

  try {
    const health = await api.checkHealth();

    if (health?.ok) {
      rememberReachable();
    } else {
      // The server answered but is not healthy: cache nothing.
      forgetOnlineState();
    }
  } catch (error) {
    // Offline, wrong Wi-Fi, backend not running - all the same to the app.
    // An OFFLINE answer is never cached, so the next check probes again.
    forgetOnlineState();
  }

  return probe.online;
}

/** Throw away the cached answer (used after a deliberate retry). */
export function forgetOnlineState() {
  probe = { at: 0, online: false };
}

/**
 * Has this phone reached the server recently - WITHOUT asking it again?
 *
 * `markMeal()` uses this instead of a live probe, so tapping a meal on a
 * phone that has no recent proof the server is there never fires a request
 * that would just fail: the change is written locally and queued, and the
 * next sync (app open, login, SYNC RECORDS) uploads it. Nothing is lost, and
 * nothing is blocked.
 */
export function isServerKnownReachable() {
  return probe.online && probe.at > 0 && Date.now() - probe.at < REACHABLE_MEMORY_MS;
}

/* ------------------------------------------------------------------ */
/* Upload                                                              */
/* ------------------------------------------------------------------ */

/**
 * Push every queued change to the server.
 *
 * The WHOLE local day is sent, not just the meal the user touched, and the
 * backend is field-selective, so "breakfast = eaten, dinner = not_eaten"
 * can never be flattened back to a default by a partial update.
 */
export async function uploadPendingChanges(userId) {
  const pending = await storage.getPendingSync(userId);

  let uploaded = 0;
  const failed = [];

  for (const change of pending) {
    const local = await storage.getLocalMeal(userId, change.date);

    // The day was removed locally after it was queued - nothing to send.
    if (!local) {
      await storage.clearPendingSync(userId, change.date);
      continue;
    }

    try {
      const saved = await api.saveMealRecord({
        userId,
        date: change.date,
        breakfast: local.breakfast,
        dinner: local.dinner,
      });

      // Keep the server id so a later phase can PATCH this exact record.
      await storage.saveLocalMeal({ ...saved, userId });
      await storage.clearPendingSync(userId, change.date);
      rememberReachable();
      uploaded += 1;
    } catch (error) {
      const status = error?.response?.status;

      failed.push({
        date: change.date,
        message: api.getErrorMessage(error),
        // 4xx means the server will never accept this row, so the user has
        // to look at it. 5xx / network problems just need another try.
        permanent: Boolean(status && status >= 400 && status < 500),
      });
    }
  }

  return { uploaded, failed, remaining: failed.length };
}

/* ------------------------------------------------------------------ */
/* Download                                                            */
/* ------------------------------------------------------------------ */

/**
 * Pull the server's records into local storage.
 *
 * A date that still has a queued change is SKIPPED, because the local value
 * there is the user's newest intent and the server would overwrite it with
 * an older one. Everything else is merged in; local days the server does not
 * know about are left alone.
 */
export async function downloadUserMeals(userId) {
  const remote = await api.fetchMealRecords(userId);
  rememberReachable();

  const pending = await storage.getPendingSync(userId);
  const protectedDates = new Set(pending.map((item) => item.date));

  const safeToMerge = remote.meals.filter((meal) => !protectedDates.has(meal.date));
  const merged = await storage.mergeLocalMeals(userId, safeToMerge);

  return {
    downloaded: remote.meals.length,
    added: merged.added,
    updated: merged.updated,
    keptLocal: remote.meals.length - safeToMerge.length,
    joinDate: remote.joinDate,
    today: remote.today,
  };
}

/* ------------------------------------------------------------------ */
/* The one function screens and the future Profile button call         */
/* ------------------------------------------------------------------ */

function describe({ uploaded, downloaded, remaining }) {
  const parts = [];

  if (uploaded) parts.push(`${uploaded} change${uploaded === 1 ? '' : 's'} uploaded`);
  if (downloaded) parts.push(`${downloaded} record${downloaded === 1 ? '' : 's'} downloaded`);
  if (remaining) parts.push(`${remaining} still waiting to upload`);

  return parts.length ? `${parts.join(', ')}.` : 'Everything is up to date.';
}

/**
 * Upload local changes, then download the latest server records.
 *
 * NEVER THROWS. Every outcome - including "you are offline" - comes back as
 * a plain result object, so a screen can always stop spinning and say
 * something useful.
 *
 * future Profile screen -> "Download / Sync Records" button
 */
export async function syncUserData(userId) {
  if (!userId) {
    return {
      ok: false,
      online: false,
      uploaded: 0,
      downloaded: 0,
      pending: 0,
      failed: [],
      message: 'No signed-in user to sync.',
    };
  }

  if (!(await isOnline())) {
    return {
      ok: false,
      online: false,
      uploaded: 0,
      downloaded: 0,
      pending: await storage.countPendingSync(userId),
      failed: [],
      message:
        'Offline. Your records are safe on this device and will sync when you are back online.',
    };
  }

  try {
    const upload = await uploadPendingChanges(userId);
    const download = await downloadUserMeals(userId);

    return {
      ok: true,
      online: true,
      uploaded: upload.uploaded,
      downloaded: download.downloaded,
      added: download.added,
      updated: download.updated,
      keptLocal: download.keptLocal,
      pending: upload.remaining,
      failed: upload.failed,
      joinDate: download.joinDate,
      today: download.today,
      syncedAt: new Date().toISOString(),
      message: describe({
        uploaded: upload.uploaded,
        downloaded: download.downloaded,
        remaining: upload.remaining,
      }),
    };
  } catch (error) {
    // Reached the server but the request failed: say why, do not crash.
    return {
      ok: false,
      online: true,
      uploaded: 0,
      downloaded: 0,
      pending: await storage.countPendingSync(userId),
      failed: [],
      message: api.getErrorMessage(error),
    };
  }
}

