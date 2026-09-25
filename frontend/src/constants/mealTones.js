/**
 * MessMate - the ONE place a meal status gets its colours.
 *
 * Used by Home (the status pill on a meal card), by the Meals editor and by
 * the Meals history chips, so the same status can never look different on two
 * screens.
 *
 *   EATEN         emerald  - a positive, confirmed meal
 *   NOT EATEN     gold     - a normal answer, NOT a mistake and never alarming
 *   NOT RECORDED  muted    - no record exists for that date at all
 *
 * `solid` / `onSolid` paint a selected control, `soft` / `border` / `text`
 * paint a small status pill or chip.
 */

import { colors } from './theme';
import { MEAL_STATUS } from '../services/storage';

export const NOT_RECORDED = 'not_recorded';

export const MEAL_TONES = {
  [MEAL_STATUS.EATEN]: {
    solid: colors.primaryContainer,
    onSolid: colors.onPrimaryContainer,
    soft: colors.primaryFixed,
    border: colors.primaryContainer,
    text: colors.onPrimaryFixedVariant,
  },
  [MEAL_STATUS.NOT_EATEN]: {
    solid: colors.secondaryContainer,
    onSolid: colors.onSecondaryFixed,
    soft: colors.secondaryFixed,
    border: colors.secondaryContainer,
    text: colors.onSecondaryFixedVariant,
  },
  [NOT_RECORDED]: {
    solid: colors.surfaceVariant,
    onSolid: colors.onSurfaceVariant,
    soft: colors.surfaceContainer,
    border: colors.outlineVariant,
    text: colors.onSurfaceVariant,
  },
};

/** Tone for a stored value. Nothing stored / anything unknown = NOT RECORDED. */
export function toneFor(status) {
  return MEAL_TONES[status] || MEAL_TONES[NOT_RECORDED];
}

export default { MEAL_TONES, NOT_RECORDED, toneFor };
