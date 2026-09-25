/**
 * MessMate - Meal model.
 *
 * ONE document per user per day, holding that day's breakfast and dinner.
 *
 * Breakfast and dinner are independent:
 *   - 'eaten'      counts towards the 30-meal cycle
 *   - 'not_eaten'  does not count
 *
 * A date with NO document at all is what the app shows as "NOT RECORDED".
 * Fake 'not_recorded' documents are never stored.
 *
 * Every date is a plain YYYY-MM-DD string (no timezone logic).
 */

const mongoose = require('mongoose');

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// ONLY these two values are stored. "NOT RECORDED" is the absence of a record.
const MEAL_STATUSES = ['eaten', 'not_eaten'];

const mealSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'userId is required.'],
      index: true,
    },
    date: {
      type: String,
      required: [true, 'Date is required.'],
      match: [DATE_PATTERN, 'Date must use the YYYY-MM-DD format.'],
    },
    breakfast: {
      type: String,
      enum: { values: MEAL_STATUSES, message: 'Breakfast must be "eaten" or "not_eaten".' },
      default: 'not_eaten',
    },
    dinner: {
      type: String,
      enum: { values: MEAL_STATUSES, message: 'Dinner must be "eaten" or "not_eaten".' },
      default: 'not_eaten',
    },
  },
  { versionKey: false },
);

/**
 * At most ONE Meal document per userId + date.
 * The unique compound index is what makes duplicate records impossible;
 * saving the same date again updates the existing document instead.
 */
mealSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Meal', mealSchema);
module.exports.MEAL_STATUSES = MEAL_STATUSES;
module.exports.DATE_PATTERN = DATE_PATTERN;
