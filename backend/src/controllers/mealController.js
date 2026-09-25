/**
 * MessMate - meal controller.
 *
 * RULES ENFORCED HERE
 * -------------------
 * - at most ONE document per userId + date (saving the same day updates it)
 * - joinDate <= date <= today, and nothing outside that window
 * - every read and write is filtered by userId, so one member can never see
 *   or change another member's records
 *
 * "NOT RECORDED" is never stored. It is simply the absence of a document,
 * which the app works out by comparing the saved dates with the calendar.
 */

const mongoose = require('mongoose');

const Meal = require('../models/Meal');
const { MEAL_STATUSES } = require('../models/Meal');
const User = require('../models/User');
const { buildUserStats, isRealDateString, todayString } = require('../utils/mealStats');

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function publicMeal(meal) {
  return {
    id: meal._id.toString(),
    userId: meal.userId.toString(),
    date: meal.date,
    breakfast: meal.breakfast,
    dinner: meal.dinner,
  };
}

function isValidStatus(value) {
  return MEAL_STATUSES.includes(value);
}

/**
 * Load the user a request refers to. Sends the matching error and returns
 * null when the id is missing, malformed or unknown.
 */
async function loadUserOrRespond(userId, res) {
  if (!userId || !mongoose.Types.ObjectId.isValid(String(userId))) {
    res.status(400).json({ message: 'A valid userId is required.' });
    return null;
  }

  const user = await User.findById(userId);
  if (!user) {
    res.status(404).json({ message: 'User not found.' });
    return null;
  }

  return user;
}

/* ------------------------------------------------------------------ */
/* GET /api/meals/stats/:userId                                        */
/* ------------------------------------------------------------------ */

async function getStats(req, res, next) {
  try {
    const user = await loadUserOrRespond(req.params.userId, res);
    if (!user) return undefined;

    // Data isolation: only this user's records are counted.
    const meals = await Meal.find({ userId: user._id }).sort({ date: 1 });

    return res.json({
      userId: user._id.toString(),
      joinDate: user.joinDate,
      today: todayString(),
      ...buildUserStats(meals),
    });
  } catch (error) {
    return next(error);
  }
}

/* ------------------------------------------------------------------ */
/* GET /api/meals/:userId                                              */
/* ------------------------------------------------------------------ */

async function listMeals(req, res, next) {
  try {
    const user = await loadUserOrRespond(req.params.userId, res);
    if (!user) return undefined;

    // Data isolation: the userId filter makes User B's records unreachable.
    const meals = await Meal.find({ userId: user._id }).sort({ date: 1 });

    return res.json({
      userId: user._id.toString(),
      joinDate: user.joinDate,
      // Handy for the calendar screen: anything before joinDate or after
      // today is out of range and must render as NOT RECORDED.
      today: todayString(),
      count: meals.length,
      meals: meals.map(publicMeal),
    });
  } catch (error) {
    return next(error);
  }
}

/* ------------------------------------------------------------------ */
/* POST /api/meals                                                     */
/* ------------------------------------------------------------------ */

async function saveMeal(req, res, next) {
  try {
    const body = req.body || {};
    const { breakfast, dinner } = body;
    const date = typeof body.date === 'string' ? body.date.trim() : '';

    // A day must carry at least one decision, otherwise we would be storing
    // an empty record - which is exactly what "NOT RECORDED" means.
    if (breakfast === undefined && dinner === undefined) {
      return res
        .status(400)
        .json({ message: 'At least one of breakfast or dinner is required.' });
    }
    if (breakfast !== undefined && !isValidStatus(breakfast)) {
      return res.status(400).json({ message: 'Breakfast must be "eaten" or "not_eaten".' });
    }
    if (dinner !== undefined && !isValidStatus(dinner)) {
      return res.status(400).json({ message: 'Dinner must be "eaten" or "not_eaten".' });
    }
    if (!isRealDateString(date)) {
      return res
        .status(400)
        .json({ message: 'Date must be a real date in YYYY-MM-DD format.' });
    }

    const user = await loadUserOrRespond(body.userId, res);
    if (!user) return undefined;

    const today = todayString();
    if (date > today) {
      return res.status(400).json({ message: 'Date cannot be in the future.' });
    }
    if (date < user.joinDate) {
      return res
        .status(400)
        .json({ message: `Date cannot be before the join date (${user.joinDate}).` });
    }

    // ---- Upsert: update the existing day, or create it exactly once ----
    let meal = await Meal.findOne({ userId: user._id, date });
    let created = false;

    if (meal) {
      if (breakfast !== undefined) meal.breakfast = breakfast;
      if (dinner !== undefined) meal.dinner = dinner;
      await meal.save();
    } else {
      try {
        meal = await Meal.create({
          userId: user._id,
          date,
          ...(breakfast !== undefined ? { breakfast } : {}),
          ...(dinner !== undefined ? { dinner } : {}),
        });
        created = true;
      } catch (error) {
        // Two saves for the same day at the same instant. The unique
        // userId+date index rejects the loser; treat it as an update.
        if (error?.code !== 11000) throw error;

        meal = await Meal.findOne({ userId: user._id, date });
        if (breakfast !== undefined) meal.breakfast = breakfast;
        if (dinner !== undefined) meal.dinner = dinner;
        await meal.save();
      }
    }

    return res.status(created ? 201 : 200).json(publicMeal(meal));
  } catch (error) {
    if (error?.name === 'ValidationError') {
      return res.status(400).json({ message: 'The submitted meal data is not valid.' });
    }
    return next(error);
  }
}

/* ------------------------------------------------------------------ */
/* PATCH /api/meals/:id                                                */
/* ------------------------------------------------------------------ */

async function updateMeal(req, res, next) {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const { breakfast, dinner } = body;

    if (!mongoose.Types.ObjectId.isValid(String(id))) {
      return res.status(400).json({ message: 'Invalid meal id.' });
    }
    if (breakfast === undefined && dinner === undefined) {
      return res
        .status(400)
        .json({ message: 'At least one of breakfast or dinner is required.' });
    }
    if (breakfast !== undefined && !isValidStatus(breakfast)) {
      return res.status(400).json({ message: 'Breakfast must be "eaten" or "not_eaten".' });
    }
    if (dinner !== undefined && !isValidStatus(dinner)) {
      return res.status(400).json({ message: 'Dinner must be "eaten" or "not_eaten".' });
    }

    const meal = await Meal.findById(id);
    if (!meal) {
      return res.status(404).json({ message: 'Meal record not found.' });
    }

    // Data isolation: if the caller says which user owns the record, it has
    // to be the real owner. This is also what stops userId being changed.
    const claimedUserId = body.userId !== undefined ? body.userId : req.query.userId;
    if (claimedUserId !== undefined && String(claimedUserId) !== meal.userId.toString()) {
      return res.status(403).json({ message: 'That meal record belongs to a different user.' });
    }

    // A record keeps its date - it cannot be relocated to another day.
    if (body.date !== undefined && body.date !== meal.date) {
      return res
        .status(400)
        .json({ message: 'A meal record cannot be moved to a different date.' });
    }

    // Re-check the date boundaries against the owner of the record.
    const owner = await User.findById(meal.userId);
    if (!owner) {
      return res.status(404).json({ message: 'The owner of this meal record no longer exists.' });
    }

    const today = todayString();
    if (meal.date > today) {
      return res.status(400).json({ message: 'Date cannot be in the future.' });
    }
    if (meal.date < owner.joinDate) {
      return res
        .status(400)
        .json({ message: `Date cannot be before the join date (${owner.joinDate}).` });
    }

    if (breakfast !== undefined) meal.breakfast = breakfast;
    if (dinner !== undefined) meal.dinner = dinner;
    await meal.save();

    return res.json(publicMeal(meal));
  } catch (error) {
    if (error?.name === 'ValidationError') {
      return res.status(400).json({ message: 'The submitted meal data is not valid.' });
    }
    return next(error);
  }
}

module.exports = { getStats, listMeals, saveMeal, updateMeal };
