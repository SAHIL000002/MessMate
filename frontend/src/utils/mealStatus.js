/**
 * MessMate - how a meal status is written for a person.
 *
 * Only three states exist, ever:
 *
 *   EATEN         stored as "eaten"
 *   NOT EATEN     stored as "not_eaten"
 *   NOT RECORDED  there is no record for that date at all
 *
 * 'NOT RECORDED' is a DISPLAY state only. The string 'not_recorded' is never
 * written to the device or to the database - a missing record is the state.
 */

import { MEAL_STATUS } from '../services/storage';

export const STATUS_LABELS = {
  EATEN: 'EATEN',
  NOT_EATEN: 'NOT EATEN',
  NOT_RECORDED: 'NOT RECORDED',
};

/** Any stored value (including null / undefined / junk) -> a display label. */
export function statusLabel(status) {
  if (status === MEAL_STATUS.EATEN) return STATUS_LABELS.EATEN;
  if (status === MEAL_STATUS.NOT_EATEN) return STATUS_LABELS.NOT_EATEN;
  return STATUS_LABELS.NOT_RECORDED;
}

/** True only for a real, stored 'eaten' value. Missing records are not eaten. */
export function isEaten(status) {
  return status === MEAL_STATUS.EATEN;
}

/** The status a mark action is asking for, as a word for feedback text. */
export function statusPhrase(status) {
  return status === MEAL_STATUS.EATEN ? 'eaten' : 'not eaten';
}

export default { STATUS_LABELS, statusLabel, isEaten, statusPhrase };
