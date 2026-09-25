/**
 * MessMate - MongoDB connection.
 *
 * Kept deliberately small: read MONGO_URI from backend/.env, connect with
 * Mongoose, and expose a helper so routes can tell whether the database is
 * actually reachable.
 */

const mongoose = require('mongoose');

// Fail fast instead of hanging for the driver default (30s).
const SERVER_SELECTION_TIMEOUT_MS = 10000;

/**
 * Connect to MongoDB using MONGO_URI.
 * Resolves with the mongoose connection, or rejects with a readable error.
 */
async function connectDB() {
  const uri = process.env.MONGO_URI;

  if (!uri) {
    throw new Error('MONGO_URI is missing. Add it to backend/.env (see .env.example).');
  }

  // Drop unknown query fields instead of passing them to the driver.
  mongoose.set('strictQuery', true);

  await mongoose.connect(uri, { serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS });

  const { host, name } = mongoose.connection;
  console.log(`MongoDB connected: ${host}/${name}`);
  return mongoose.connection;
}

/** true while the driver reports a live connection (readyState === 1). */
function isDBConnected() {
  return mongoose.connection.readyState === 1;
}

/** Close the connection (used by scripts and graceful shutdown). */
async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = { connectDB, disconnectDB, isDBConnected };
