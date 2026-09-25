/**
 * MessMate - User model.
 *
 * Intentionally simple. This is a small private/student project with 5-6
 * known users, so there is no bcrypt, JWT, OAuth, OTP, email verification,
 * roles or permissions. The password is stored as plain text ON PURPOSE.
 */

const mongoose = require('mongoose');

// Every date in MessMate is a plain YYYY-MM-DD string (no timezone logic).
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username is required.'],
      unique: true,
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required.'],
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      // Plain text by design - see the note at the top of this file.
      type: String,
      required: [true, 'Password is required.'],
    },
    // The first day this member is tracked. History starts here.
    joinDate: {
      type: String,
      required: [true, 'Join date is required.'],
      match: [DATE_PATTERN, 'Join date must use the YYYY-MM-DD format.'],
    },
  },
  { versionKey: false },
);

// Never leak the password, even if a document is serialised by accident.
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.password;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
module.exports.DATE_PATTERN = DATE_PATTERN;
