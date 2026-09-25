/**
 * MessMate - meal routes.
 *
 *   GET   /api/meals/stats/:userId   breakfast + dinner cycle information
 *   GET   /api/meals/:userId         that user's saved records, by date
 *   POST  /api/meals                 create OR update one day (upsert)
 *   PATCH /api/meals/:id             change breakfast / dinner only
 *
 * Declared before '/:userId' so the literal 'stats' path always wins.
 */

const express = require("express");

const {
  listMeals,
  saveMeal,
  updateMeal,
  getStats,
} = require("../controllers/mealController");

const router = express.Router();

router.get("/stats/:userId", getStats);
router.get("/:userId", listMeals);
router.post("/", saveMeal);
router.patch("/:id", updateMeal);

module.exports = router;
