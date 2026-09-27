/**
 * MessMate API - entry point.
 *
 * PHASE 0: server boot.
 * PHASE 1: MongoDB connection, User + Meal models, auth / meal / stats routes.
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');

const {
  connectDB,
  ensureDBConnection,
  getDbStatus,
  isDBConnected,
} = require('./src/config/db');
const authRoutes = require('./src/routes/authRoutes');
const mealRoutes = require('./src/routes/mealRoutes');

const app = express();

/* ------------------------------------------------------------------ */
/* Middleware                                                          */
/* ------------------------------------------------------------------ */

// The phone app talks to this API directly, so keep CORS open.
app.use(cors());
app.use(express.json());

/**
 * Data routes need a live database. Health must keep working without one,
 * so the app can still tell you what is wrong from the phone.
 *
 * A request that arrives while the database is down - or while a freshly woken
 * instance is still connecting - gets one retry before the 503, so a temporary
 * outage never needs a redeploy. The response shape is unchanged.
 */
async function requireDB(req, res, next) {
  if (isDBConnected()) return next();

  // One chance to connect, for a database (or an instance) that was asleep.
  if (await ensureDBConnection()) return next();

  return res.status(503).json({
    message: 'The database is not connected. Check MONGO_URI in backend/.env.',
    hint: 'The API is running but cannot reach MongoDB. Open /api/health to see why.',
  });
}

/* ------------------------------------------------------------------ */
/* Routes                                                              */
/* ------------------------------------------------------------------ */

// Simple liveness check so the mobile app (and you) can verify the
// phone can actually reach this machine over the LAN.
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'MessMate API',
    phase: 1,
    database: isDBConnected() ? 'connected' : 'disconnected',
    time: new Date().toISOString(),
    // Credential-free detail, so a deployment problem can be diagnosed from a
    // browser instead of from the hosting panel's logs.
    databaseInfo: getDbStatus(),
  });
});

app.use('/api/auth', requireDB, authRoutes);
app.use('/api/meals', requireDB, mealRoutes);

/* ------------------------------------------------------------------ */
/* Fallbacks                                                           */
/* ------------------------------------------------------------------ */

app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err);
  res.status(500).json({ message: 'Something went wrong on the server.' });
});

/* ------------------------------------------------------------------ */
/* Start                                                               */
/* ------------------------------------------------------------------ */

const PORT = Number(process.env.PORT) || 5000;
const HOST = process.env.HOST || '0.0.0.0';

// A database that was not reachable at boot is retried a few times, then left
// to the per-request retry in requireDB(). Deliberately not an aggressive poll.
const RECONNECT_DELAYS_MS = [5000, 15000, 45000];

function scheduleBackgroundReconnect() {
  RECONNECT_DELAYS_MS.forEach((delay, index) => {
    const timer = setTimeout(async () => {
      if (isDBConnected()) return;

      const connected = await ensureDBConnection();

      if (connected) {
        console.log('[db] MongoDB connection established after startup.');
      } else if (index === RECONNECT_DELAYS_MS.length - 1) {
        console.warn('[db] Background reconnects finished. Every request now retries once.');
      }
    }, delay);

    // A retry must never keep the process alive on its own.
    if (typeof timer.unref === 'function') timer.unref();
  });
}

async function start() {
  // Connect before listening, but never let a database problem stop
  // /api/health from answering - that is how the problem gets diagnosed.
  try {
    await connectDB();
  } catch (error) {
    console.error('');
    console.error('!! Could not connect to MongoDB: ' + error.message);
    console.error('!! Set the connection string in THIS environment (MONGO_URI, or');
    console.error('!! MONGODB_URI) and check that the database allows this host.');
    console.error('!! The API will start anyway; data routes return 503 and retry.');
    console.error('!! Details (no credentials): GET /api/health -> databaseInfo');
    console.error('');
  }

  app.listen(PORT, HOST, () => {
    console.log(`MessMate API listening on http://${HOST}:${PORT}`);
    console.log(`Local check:  http://localhost:${PORT}/api/health`);
    console.log('Phone check:  http://<YOUR-LAN-IP>:' + PORT + '/api/health');
  });

  // Only when the first attempt failed: keep trying in the background.
  if (!isDBConnected()) scheduleBackgroundReconnect();
}

start();
