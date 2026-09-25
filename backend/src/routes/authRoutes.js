/**
 * MessMate - auth routes.
 *
 *   POST /api/auth/register      create a user
 *   POST /api/auth/login         username OR email + password
 *   GET  /api/auth/user/:id      one user (used by Home / Profile)
 */

const express = require("express");

const { register, login, getUser } = require("../controllers/authController");

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/user/:id", getUser);

module.exports = router;
