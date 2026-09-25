/**
 * MessMate - safe display helpers for the signed-in session.
 *
 * The session object only ever holds { id, username, email, joinDate }, and
 * every value in it came from a person typing into a form, so these helpers
 * are deliberately forgiving: they never throw, they never render
 * "undefined", and there is no password anywhere near them.
 */

const FALLBACK_NAME = 'MessMate member';
const FALLBACK_INITIALS = 'MM';

/** The name to show in a greeting or header. Never empty. */
export function displayName(user, fallback = FALLBACK_NAME) {
  const username = typeof user?.username === 'string' ? user.username.trim() : '';
  return username || fallback;
}

/**
 * Up to two uppercase initials for the round avatar, taken from the first
 * letters of the first two words:
 *
 *   'Sahil Dubey' -> 'SD'      'sahil' -> 'S'
 *   ''            -> 'MM'
 */
export function initialsFor(user, fallback = FALLBACK_INITIALS) {
  const name = displayName(user, '');

  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

  return initials || fallback;
}

export default { displayName, initialsFor };
