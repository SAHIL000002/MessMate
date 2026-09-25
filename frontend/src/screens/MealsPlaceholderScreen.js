/**
 * MessMate - MEALS tab (TEMPORARY PLACEHOLDER, PHASE 3).
 *
 * Deliberately empty. This phase builds Home only; the real Meals screen
 * (date-wise history, previous/next day, the full record table) is a later
 * phase. Nothing here reads or writes meals, so this tab can never change a
 * record by accident.
 */

import PlaceholderScreen from '../components/PlaceholderScreen';

export default function MealsPlaceholderScreen() {
  return (
    <PlaceholderScreen
      icon="silverware-fork-knife"
      tag="PHASE 4"
      title="MEALS"
      message="Meals history will be available here."
    />
  );
}
