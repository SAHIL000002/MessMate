/**
 * MessMate - one short, honest sync sentence for the Home chip.
 *
 * Offline is a normal state for this app, so nothing here is ever phrased as
 * a failure the user has to act on. The chip answers two questions and
 * nothing more:
 *
 *   - is anything still waiting to upload?
 *   - when did the last upload/download go out?
 *
 * Pure and dependency-free, so it can be unit tested without a device.
 */

export const SYNC_TONES = { OK: 'ok', MUTED: 'muted', PENDING: 'pending' };

function waitingLabel(pending) {
  return pending === 1 ? '1 change to sync' : `${pending} changes to sync`;
}

/**
 * @param {object} state
 * @param {number} state.pending   days still queued for upload on this device
 * @param {object|null} state.lastSync  last result from syncUserData(), or null
 * @returns {{ icon: string, label: string, tone: string }}
 */
export function syncState({ pending = 0, lastSync = null } = {}) {
  const waiting = Math.max(0, Math.floor(Number(pending) || 0));

  // 1. Something is queued. Say so first - this is the only thing the user
  //    might want to know about, and it is never lost either way.
  if (waiting > 0) {
    return {
      icon: lastSync?.online ? 'cloud-upload-outline' : 'cloud-off-outline',
      label: waitingLabel(waiting),
      tone: SYNC_TONES.PENDING,
    };
  }

  // 2. Nothing queued and nothing has been tried yet.
  if (!lastSync) {
    return { icon: 'cloud-outline', label: 'Not synced yet', tone: SYNC_TONES.MUTED };
  }

  // 3. Nothing queued, and the last attempt did not reach the server.
  if (!lastSync.online) {
    return { icon: 'cloud-off-outline', label: 'Offline', tone: SYNC_TONES.MUTED };
  }

  // 4. Reached the server but the request itself failed.
  if (!lastSync.ok) {
    return { icon: 'cloud-alert-outline', label: 'Sync will retry', tone: SYNC_TONES.MUTED };
  }

  // 5. Everything is up to date.
  return { icon: 'cloud-check-outline', label: 'All synced', tone: SYNC_TONES.OK };
}

export default { syncState, SYNC_TONES };
