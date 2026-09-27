/**
 * MessMate - MongoDB connection.
 *
 * Kept deliberately small: read the connection string from the environment,
 * connect with Mongoose, and expose helpers so routes can tell whether the
 * database is actually reachable.
 *
 * PRODUCTION NOTES
 * ----------------
 * The connection string is read from MONGO_URI. Because hosting panels very
 * often store the same value under the name MONGODB_URI, that name (and two
 * other common ones) is accepted as an alias - a mismatch between the name in
 * the code and the name in the hosting panel is exactly what leaves a deployed
 * server permanently disconnected. The list is checked in order.
 *
 * A connection that failed at boot is NOT fatal: `ensureDBConnection()` lets
 * any incoming request try once more (with a cooldown), so a database that was
 * asleep, or an instance that booted before Atlas was reachable, heals itself
 * without a redeploy.
 *
 * SECURITY: a connection string contains the database password. It is never
 * logged and never returned by an endpoint. Everything that is logged or
 * exposed goes through `sanitize()` / `describeUri()` first.
 */

const mongoose = require('mongoose');

// Fail fast instead of hanging for the driver default (30s).
const SERVER_SELECTION_TIMEOUT_MS = 10000;

// A retry triggered by an incoming request uses a shorter budget.
const RETRY_TIMEOUT_MS = 8000;

// Never hammer a database that is down: at most one retry per few seconds.
const RETRY_COOLDOWN_MS = 5000;

/**
 * The names this project accepts, in priority order.
 * MONGO_URI is the original name used by this codebase and by backend/.env.
 */
const URI_VARIABLE_NAMES = ['MONGO_URI', 'MONGODB_URI', 'MONGO_URL', 'DATABASE_URL'];

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

let lastError = null;
let lastAttemptAt = 0;
let attempts = 0;
let inFlight = null;
let uriVariableName = null;

/* ------------------------------------------------------------------ */
/* Reading + describing the target                                     */
/* ------------------------------------------------------------------ */

/** The first accepted environment variable that actually has a value. */
function getMongoUri() {
  for (const name of URI_VARIABLE_NAMES) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim()) {
      return { name, uri: value.trim() };
    }
  }
  return { name: null, uri: null };
}

/**
 * Strip anything that could carry a credential out of a string.
 * Used on every error message before it is logged or returned.
 */
function sanitize(text) {
  return String(text ?? '')
    .replace(/mongodb(\+srv)?:\/\/[^\s'"]*/gi, 'mongodb://<redacted>')
    .replace(/(password|pwd)=[^&\s'"]*/gi, '$1=<redacted>');
}

/**
 * A credential-free description of the connection target, for diagnostics:
 * which scheme, which cluster host(s) and which database name.
 * The user name and the password are never included.
 */
function describeUri(uri) {
  if (!uri) return null;

  let scheme = 'unknown';
  if (uri.startsWith('mongodb+srv://')) scheme = 'mongodb+srv';
  else if (uri.startsWith('mongodb://')) scheme = 'mongodb';

  const withoutScheme = uri.replace(/^mongodb(\+srv)?:\/\//, '');
  const at = withoutScheme.indexOf('@');
  const hasCredentials = at >= 0;
  const hostAndRest = hasCredentials ? withoutScheme.slice(at + 1) : withoutScheme;
  const hostAndDb = hostAndRest.split('?')[0];
  const slash = hostAndDb.indexOf('/');

  return {
    scheme,
    hosts: slash >= 0 ? hostAndDb.slice(0, slash) : hostAndDb,
    database: slash >= 0 ? hostAndDb.slice(slash + 1) : null,
    hasCredentials,
  };
}

/* ------------------------------------------------------------------ */
/* Connecting                                                          */
/* ------------------------------------------------------------------ */

/**
 * Connect to MongoDB.
 * Resolves with the mongoose connection, or rejects with a readable,
 * sanitized error message.
 */
async function connectDB({ timeoutMS = SERVER_SELECTION_TIMEOUT_MS } = {}) {
  const { name, uri } = getMongoUri();

  uriVariableName = name;
  attempts += 1;
  lastAttemptAt = Date.now();

  if (!uri) {
    lastError = `No MongoDB connection string is set. Set one of: ${URI_VARIABLE_NAMES.join(', ')}.`;
    throw new Error(lastError);
  }

  // Drop unknown query fields instead of passing them to the driver.
  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: timeoutMS });
  } catch (error) {
    lastError = `${error?.name || 'Error'}: ${sanitize(error?.message)}`;
    throw new Error(lastError);
  }

  lastError = null;

  const { host, name: dbName } = mongoose.connection;
  console.log(`MongoDB connected: ${host}/${dbName}`);
  return mongoose.connection;
}

/**
 * Make sure there is a live connection, retrying if there is not.
 *
 * Returns true when the database is reachable, false when it is not - it never
 * throws, because it is called while handling a request. A failed attempt is
 * remembered for RETRY_COOLDOWN_MS so a burst of requests cannot turn into a
 * burst of connection attempts.
 */
async function ensureDBConnection() {
  if (isDBConnected()) return true;

  if (lastAttemptAt && Date.now() - lastAttemptAt < RETRY_COOLDOWN_MS) return false;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      await connectDB({ timeoutMS: RETRY_TIMEOUT_MS });
      return true;
    } catch (error) {
      console.warn(`[db] MongoDB still unavailable: ${sanitize(error?.message)}`);
      return false;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** true while the driver reports a live connection (readyState === 1). */
function isDBConnected() {
  return mongoose.connection.readyState === 1;
}

/**
 * Credential-free status of the database layer, for /api/health.
 * Answers "is it connected, which variable was found, and what went wrong".
 */
function getDbStatus() {
  const { name, uri } = getMongoUri();
  const target = describeUri(uri);

  return {
    connected: isDBConnected(),
    uriConfigured: Boolean(uri),
    uriVariable: name,
    acceptedVariables: URI_VARIABLE_NAMES,
    scheme: target?.scheme ?? null,
    hosts: target?.hosts ?? null,
    database: target?.database ?? null,
    readyState: mongoose.connection.readyState,
    attempts,
    lastAttemptAt: lastAttemptAt ? new Date(lastAttemptAt).toISOString() : null,
    error: lastError,
  };
}

/** Close the connection (used by scripts and graceful shutdown). */
async function disconnectDB() {
  await mongoose.disconnect();
}

/* ------------------------------------------------------------------ */
/* Connection events - logged without ever printing the URI            */
/* ------------------------------------------------------------------ */

mongoose.connection.on('disconnected', () => {
  console.warn('[db] MongoDB connection lost. The next request will try to reconnect.');
});

mongoose.connection.on('error', (error) => {
  console.warn(`[db] MongoDB error: ${sanitize(error?.message)}`);
});

module.exports = {
  URI_VARIABLE_NAMES,
  connectDB,
  disconnectDB,
  ensureDBConnection,
  getDbStatus,
  getMongoUri,
  isDBConnected,
  sanitize,
};
