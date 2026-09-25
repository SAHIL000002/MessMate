/**
 * MessMate - auth controller.
 *
 * No tokens, no sessions, no middleware. Login simply compares the stored
 * plain-text password and returns the user. That is all this project needs.
 */

const mongoose = require('mongoose');

const User = require('../models/User');
const { isRealDateString, todayString } = require('../utils/mealStats');

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** The only shape a user is ever sent to the app. Never includes password. */
function publicUser(user) {
  return {
    id: user._id.toString(),
    username: user.username,
    email: user.email,
    joinDate: user.joinDate,
  };
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** Passwords are never trimmed - they are compared exactly as typed. */
function rawPassword(value) {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : String(value);
}

function firstValidationMessage(error) {
  const errors = error?.errors;
  if (errors) {
    const first = Object.values(errors)[0];
    if (first?.message) return first.message;
  }
  return 'The submitted data is not valid.';
}

/** Turn a duplicate-key index error into a message a person can act on. */
function duplicateMessage(error) {
  const field = Object.keys(error?.keyPattern || {})[0];
  if (field === 'email') return 'That email is already registered.';
  if (field === 'username') return 'That username is already taken.';
  return 'That username or email is already registered.';
}

/* ------------------------------------------------------------------ */
/* POST /api/auth/register                                             */
/* ------------------------------------------------------------------ */

async function register(req, res, next) {
  try {
    const body = req.body || {};

    const username = text(body.username);
    const email = text(body.email).toLowerCase();
    const password = rawPassword(body.password);
    const joinDate = text(body.joinDate);

    if (!username) return res.status(400).json({ message: 'Username is required.' });
    if (!email) return res.status(400).json({ message: 'Email is required.' });
    if (!password) return res.status(400).json({ message: 'Password is required.' });
    if (!joinDate) return res.status(400).json({ message: 'Join date is required.' });

    if (!isRealDateString(joinDate)) {
      return res
        .status(400)
        .json({ message: 'Join date must be a real date in YYYY-MM-DD format.' });
    }
    if (joinDate > todayString()) {
      return res.status(400).json({ message: 'Join date cannot be in the future.' });
    }

    // Check for duplicates first so the error message names the actual problem.
    const usernameTaken = await User.findOne({ username });
    if (usernameTaken) {
      return res.status(409).json({ message: 'That username is already taken.' });
    }

    const emailTaken = await User.findOne({ email });
    if (emailTaken) {
      return res.status(409).json({ message: 'That email is already registered.' });
    }

    const user = await User.create({ username, email, password, joinDate });

    return res.status(201).json(publicUser(user));
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ message: duplicateMessage(error) });
    }
    if (error?.name === 'ValidationError') {
      return res.status(400).json({ message: firstValidationMessage(error) });
    }
    return next(error);
  }
}

/* ------------------------------------------------------------------ */
/* POST /api/auth/login                                                */
/* ------------------------------------------------------------------ */

async function login(req, res, next) {
  try {
    const body = req.body || {};

    const identifier = text(body.identifier);
    const password = rawPassword(body.password);

    if (!identifier) {
      return res.status(400).json({ message: 'Username or email is required.' });
    }
    if (!password) {
      return res.status(400).json({ message: 'Password is required.' });
    }

    // Login with EITHER the username or the email address.
    const user = await User.findOne({
      $or: [{ username: identifier }, { email: identifier.toLowerCase() }],
    });

    // Same message either way, so we never reveal which part was wrong.
    if (!user || user.password !== password) {
      return res.status(401).json({ message: 'Incorrect username/email or password.' });
    }

    return res.json(publicUser(user));
  } catch (error) {
    return next(error);
  }
}

/* ------------------------------------------------------------------ */
/* GET /api/auth/user/:id                                              */
/* ------------------------------------------------------------------ */

async function getUser(req, res, next) {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid user id.' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    return res.json(publicUser(user));
  } catch (error) {
    return next(error);
  }
}

module.exports = { register, login, getUser };
