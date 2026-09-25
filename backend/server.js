/**
 * MessMate API - entry point.
 *
 * PHASE 0: server boot.
 * PHASE 1: MongoDB connection, User + Meal models, auth / meal / stats routes.
 */

require('dotenv').config();

const express = require('express');
const cors = require('cors');

const { connectDB, isDBConnected } = require('./src/config/db');
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
 */
function requireDB(req, res, next) {
  if (isDBConnected()) return next();
  return res.status(503).json({
    message: 'The database is not connected. Check MONGO_URI in backend/.env.',
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

async function start() {
  // Connect before listening, but never let a database problem stop
  // /api/health from answering - that is how the problem gets diagnosed.
  try {
    await connectDB();
  } catch (error) {
    console.error('');
    console.error('!! Could not connect to MongoDB: ' + error.message);
    console.error('!! Check MONGO_URI in backend/.env and that MongoDB is running.');
    console.error('!! The API will start anyway; data routes will return 503.');
    console.error('');
  }

  app.listen(PORT, HOST, () => {
    console.log(`MessMate API listening on http://${HOST}:${PORT}`);
    console.log(`Local check:  http://localhost:${PORT}/api/health`);
    console.log('Phone check:  http://<YOUR-LAN-IP>:' + PORT + '/api/health');
  });
}

start();
