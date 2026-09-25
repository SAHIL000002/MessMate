# MessMate

A small personal mess meal tracker for 5-6 known users. Tracks daily
**breakfast** and **dinner** attendance against a rolling **30-meal cycle**.

- **Frontend:** React Native + Expo SDK 57 (JavaScript)
- **Backend:** Node.js + Express + MongoDB (Mongoose)

---

## Status: PHASE 4 complete (Home + Meals, emerald/gold, offline-first)

Phase 0 built the Expo project, Phase 1 built the backend, Phase 2 added the
**Login** and **Signup** screens, the join-date picker and the **offline-first
local session** with its local meal storage + sync foundation. Phase 3 added the
real **Home** dashboard and the three-tab bar (**HOME | MEALS | PROFILE**).
Phase 4 adds the real **Meals** screen: date navigation inside
`joinDate -> today`, a calendar picker, the breakfast/dinner editor for the
selected date and the complete date-wise **history** (newest first, every date
in the range, missing dates read as NOT RECORDED).

The app opens on the Login screen, or straight into **Home** when a session is
already saved on the device - **with or without internet**.

Home shows who is signed in, today's local date, today's **breakfast** and
**dinner** (EATEN / NOT EATEN / NOT RECORDED, each with its own MARK buttons)
and the two independent **30-meal cycles**. Meals picks one date, marks that
day's breakfast / dinner independently and lists the whole history below.
Every number and every row on both screens is read from the device, so opening
either screen makes no network request at all. PROFILE keeps only identity +
LOGOUT (Phase 5); the PDF report is not built yet. See "Development phases"
below.

### What works offline

| Action | Needs internet? |
| --- | --- |
| Open the app after signing in once | no |
| Stay signed in across restarts | no |
| Read locally stored meal records | no |
| Mark breakfast / dinner eaten or not eaten | no (uploads later) |
| Update a meal record | no (uploads later) |
| Browse the full meal history (Meals) | no |
| Pick a date with PREV / NEXT / calendar (Meals) | no |
| Mark any date between joinDate and today (Meals) | no (uploads later) |
| First signup | **yes** |
| First login on a device | **yes** |
| Upload changes / download server records | **yes** |

### Session rules

- Saved locally: `{ id, username, email, joinDate }` - **nothing else**.
- Never saved: password, token, refresh token, cookie or any other secret.
  There is no JWT and no session cookie anywhere in this project.
- Logout removes **only** the session. Meal records and any queued changes stay
  on the device, so the same user can sign back in and still have their history.


---

## Layout

```
MessMate/
├── frontend/                          Expo app
│   ├── src/
│   │   ├── components/                AppTextField, PrimaryButton, MessageBanner,
│   │   │                              AuthScaffold, JoinDateField, MessMateLogo, MealStatusCard, CycleCard,
│   │   │                              DateNavigator, MealEditorCard, MealHistoryList, PlaceholderScreen
│   │   ├── screens/                   LoginScreen, SignupScreen,
│   │   │                              HomeScreen, MealsScreen, ProfilePlaceholderScreen
│   │   ├── navigation/                AuthNavigator, AppNavigator, MainTabs (HOME | MEALS | PROFILE)
│   │   ├── context/AuthContext.js     the signed-in session (login/signup/logout/sync)
│   │   ├── services/api.js            the ONE API config + axios + endpoint calls
│   │   ├── services/storage.js        AsyncStorage: session, meals, pending sync
│   │   ├── services/meals.js          local-first meal reads/writes (markMeal, getMealHistory)
│   │   ├── services/sync.js           isOnline / upload / download (syncUserData)
│   │   ├── constants/theme.js         design tokens from DESIGN.md
│   │   ├── constants/mealTones.js     the ONE place a meal status gets its colours
│   │   └── utils/: date.js, cycle.js, mealHistory.js, mealStatus.js, syncStatus.js, user.js
│   ├── tests/: phase2 + phase3 + phase4.test.js, plus the shared harness.js
│   ├── App.js                         root: fonts -> session -> navigation
│   ├── index.js
│   ├── app.json
│   └── assets/
├── backend/                           Express API
│   ├── src/
│   │   ├── config/db.js               Mongoose connection (MONGO_URI)
│   │   ├── models/User.js             username, email, password, joinDate
│   │   ├── models/Meal.js             userId, date, breakfast, dinner
│   │   ├── controllers/               authController, mealController
│   │   ├── routes/                    authRoutes, mealRoutes
│   │   └── utils/mealStats.js         30-meal cycle maths + date helpers
│   ├── tests/phase1.test.js           API test suite (npm test)
│   ├── server.js                      boots Express + mounts the API
│   └── .env
└── stitch_messmate_meal_tracker/      PROVIDED DESIGN - source of truth
```

### Design source of truth

`stitch_messmate_meal_tracker/stitch_messmate_meal_tracker/` contains the
finalized designs. Do not redesign these screens.

| Screen | Folder |
| --- | --- |
| Design spec (tokens) | `messmate/DESIGN.md` |
| Home | `messmate_home_emerald_gold/` |
| Meals | `messmate_meals_emerald_gold/` |
| Profile | `messmate_profile_emerald_gold/` |

Every colour, radius, font size and spacing value in `frontend/src/constants/theme.js`
comes from that folder. Do not hardcode styles in screens.

---

## Prerequisites

- Node.js 20+ (built with Node 22)
- MongoDB running locally (`mongodb://127.0.0.1:27017`) or an Atlas URI
- Expo Go on your phone, **or** an Android emulator / iOS simulator

---

## Run the backend

```bash
cd backend
npm install          # already done
npm run dev          # nodemon, or: npm start
```

It listens on `0.0.0.0:5000` so a physical phone on the same Wi-Fi can reach it.

Verify:

```bash
curl http://localhost:5000/api/health
# {"ok":true,"service":"MessMate API","phase":1,"database":"connected",...}
```

Settings live in `backend/.env` (`PORT`, `HOST`, `MONGO_URI`).

Run the API tests. They boot the real server against a **throwaway database**
(`messmate_phase1_test`), so your real data is never touched, and the
throwaway database is dropped when the run finishes:

```bash
npm test
```

---

## API reference (phase 1)

Dates are always plain `YYYY-MM-DD` strings. There are **no tokens and no
sessions**: login returns the user object and the app keeps its `id` locally.

| Method | Endpoint | Body / notes |
| --- | --- | --- |
| GET | `/api/health` | liveness + database status |
| POST | `/api/auth/register` | `{ username, email, password, joinDate }` |
| POST | `/api/auth/login` | `{ identifier, password }` - username **or** email |
| GET | `/api/auth/user/:id` | one user (the password is never returned) |
| GET | `/api/meals/:userId` | that user's saved records, sorted by date |
| POST | `/api/meals` | `{ userId, date, breakfast, dinner }` - creates **or** updates |
| PATCH | `/api/meals/:id` | `{ breakfast, dinner }` only |
| GET | `/api/meals/stats/:userId` | breakfast + dinner cycle information |

### Status vocabulary

Only three states exist, ever:

| Shown in the app | Stored |
| --- | --- |
| EATEN | `"eaten"` |
| NOT EATEN | `"not_eaten"` |
| NOT RECORDED | *no Meal document for that date* |

`PENDING` and `NOT MARKED` are **not** part of this project.

### Data model

- **User** - `username`, `email`, `password`, `joinDate`. Unique indexes on
  `username` and `email`. Passwords are stored as plain text on purpose: this is
  a small private/student project, so there is no bcrypt, JWT, OAuth, OTP or
  role system.
- **Meal** - `userId`, `date`, `breakfast`, `dinner`. A **unique compound index
  on `userId + date`** guarantees one document per member per day, so saving the
  same day again updates it instead of creating a duplicate. Meals can only be
  saved between the member's `joinDate` and today; anything outside that range
  is rejected.

### The 30-meal cycle

Breakfast and dinner are counted **independently**, and only `eaten` counts.
Missing records never count, and old records are never deleted.

| Eaten | Reported |
| --- | --- |
| 0 | cycle 1, 0/30 |
| 29 | cycle 1, 29/30 |
| 30 | cycle 1 **COMPLETE** |
| 31 | cycle 2, 1/30 |
| 60 | cycle 2 **COMPLETE** |
| 61 | cycle 3, 1/30 |

---

## Run the frontend

```bash
cd frontend
npm install          # already done
npx expo start       # then scan the QR code with Expo Go
```

### How the app finds the backend

A physical phone cannot use `localhost` / `127.0.0.1`. `frontend/src/services/api.js`
resolves the base URL in this order:

1. `EXPO_PUBLIC_API_URL` from `frontend/.env` (optional override)
2. **Auto-detected** LAN IP of the running Expo dev server - normally correct
3. `http://localhost:5000/api` (web / simulator fallback)

If the auto-detected IP is wrong, copy `.env.example` to `.env`, set
`EXPO_PUBLIC_API_URL` to your machine's IPv4 address (`ipconfig`) and restart
Expo with a cleared cache:

```bash
npx expo start --clear
```

### Navigation

```
App
 ├── AuthStack     Login  ->  Signup          (nobody signed in)
 └── AppStack       MainTabs                  (a session exists)
                     ├── HOME     HomeScreen
                     ├── MEALS    MealsScreen
                     └── PROFILE  ProfilePlaceholderScreen   (Phase 5)
```

Exactly three tabs. There is no Progress, Records, Settings, Dashboard,
Analytics or Reports tab, and there never will be.

Which stack is shown is decided by `AuthContext`, so no screen ever navigates on
sign-in, sign-up, logout or session restore. A session restored from AsyncStorage
switches stacks without a single network call, which is what makes opening the
app offline work.

### The Meals screen

`src/screens/MealsScreen.js` does two things and nothing else:

**1. Pick one date and mark it.** `DateNavigator` renders
`< PREV   24 Sep 2026   TODAY   NEXT >`; the middle block opens the platform
calendar (`@react-native-community/datetimepicker`) with
`minimumDate = joinDate` and `maximumDate = today`. The reachable window is
always the member's own `joinDate -> today`:

| Selected date | PREV | NEXT |
| --- | --- | --- |
| `joinDate` | disabled | enabled |
| `today` | enabled | disabled |
| `joinDate == today` | disabled | disabled |

`MealEditorCard` then shows **BREAKFAST** and **DINNER** for that date, each with
its own EATEN / NOT EATEN choice. The two rows share nothing: marking one sends
only `{ date, [meal]: status }` to `markMeal()`, which writes the local record
first, queues the change and uploads only when the server is known to be
reachable. Offline the card simply says *"Saved on this device - it uploads when
you are online."*

**2. Show the whole history.** `MealHistoryList` renders every date from
`joinDate` to `today`, newest first, one row per date:

```
DATE       DAY   BREAKFAST     DINNER
24 Sep     Thu   EATEN         NOT RECORDED
23 Sep     Wed   NOT EATEN     EATEN
22 Sep     Tue   NOT RECORDED  NOT RECORDED
```

Dates with no record are **generated** by `utils/mealHistory.js` and read as
`NOT RECORDED`; no document is ever created for them, on the device or on the
server. Tapping a row selects that date in the editor above.

Meals does **not** repeat Home's 30-meal dashboard: Home owns the cycles, Meals
owns date-wise data.

### Screen data flow (both screens)

1. Read the device (`services/meals.js` -> `services/storage.js`) and paint.
2. Marking calls `markMeal()`: local write -> queue -> best-effort upload.
3. `syncUserData()` runs in the background (app open, login, pull-to-refresh).
   It never blocks the UI, and a failed sync leaves the local view untouched.

No screen ever imports `services/api.js` or calls axios directly.

### Local storage (AsyncStorage only)

Three keys. No SQLite, no Realm, no WatermelonDB, no Redux, no sync engine.

| Key | Contents |
| --- | --- |
| `messmate_user` | `{ id, username, email, joinDate }` - the session |
| `messmate_meals_<userId>` | one record per date: `{ _id, userId, date, breakfast, dinner }` |
| `messmate_pending_sync_<userId>` | changes not uploaded yet: `{ userId, date, at, breakfast?, dinner? }` |

- A **missing** meal record means **NOT RECORDED**. The string `not_recorded` is
  never written to the device or the database.
- Records are keyed on `userId + date`, so the same day can never be stored
  twice, and changing one meal never resets the other.
- `messmate_pending_sync_<userId>` holds **at most one item per date**, so
  marking breakfast and then dinner leaves a single queued item.

### How sync works

`syncUserData(userId)` in `frontend/src/services/sync.js`:

1. Probe `GET /api/health` to find out whether the server is reachable.
2. **Upload** every queued change first (`POST /api/meals`, which upserts).
3. **Download** the server's records and merge them in.
4. A date that still has a queued change is **skipped** during the merge, so a
   failed upload can never be overwritten by an older server value.
5. Duplicates are impossible: same `userId + date` is the same record.

Nothing is ever deleted, locally or remotely. `syncUserData` never throws -
being offline comes back as a normal result the screen can display.

Sync runs:

- after a successful login,
- when the authenticated app opens (Home and Meals both re-read the device when
  the sync reports in),
- when the user pulls down to refresh on Meals,
- whenever the user presses a **SYNC RECORDS** button - that button returns with
  the real Profile screen in Phase 5.

A failed or skipped sync is never an error the user has to act on: the local
records stay on screen exactly as they were.

### Run the frontend tests

```bash
cd frontend
npm test                 # phase 2 + phase 3 + phase 4 suites, one after the other
npm run test:phase2      # needs the backend running (see below)
npm run test:phase3      # runs fully offline - no backend needed
npm run test:phase4      # runs fully offline - no backend needed
```

All three suites compile `src/services` + `src/utils` to CommonJS with the Babel
that Expo already ships, then run them against an in-memory AsyncStorage and a
switchable network. `tests/phase3.test.js` exercises the whole Phase 3 layer
with the network switched **off**: Home's data, the breakfast/dinner marks, the
independent 30-meal cycles, the three-tab bar, the local logo and the safety
rules. `tests/phase4.test.js` does the same for Meals: the date boundaries
(PREV disabled on `joinDate`, NEXT disabled on `today`, both disabled when
`joinDate == today`), the complete `joinDate -> today` history with its
`NOT RECORDED` gaps, both independence examples from the brief, the
"one record per `userId + date`" rule under repeated taps, the refused
out-of-range dates, and that a failed sync neither errors nor loses a change.
Both suites assert that **no request is ever attempted** while doing so.

The Meals screen and its components are React Native, so they are never
`require`d by the tests. Instead every file under `src/` must **compile** with
Babel (which catches a JSX or syntax mistake), and their source is read and
checked against the rules this project promises (local-first reads,
`markMeal()` for writes, no direct API calls, no `toISOString`, no hardcoded
dates, one logo).

> Phase 4 note: `src/utils/mealHistory.js` was added to the `SOURCES` list of the
> Phase 2 and Phase 3 suites. That list only says **which files get compiled** -
> `services/meals.js` gained one local import, so its new collaborator has to be
> compiled alongside it. No assertion in those suites was changed, and all three
> suites pass.

> Phase 4 note: `src/screens/MealsPlaceholderScreen.js` is still on disk because
> the Phase 3 suite asserts its existence, but **nothing routes to it any more**
> - `MainTabs` points MEALS at the real `MealsScreen`.

**The Phase 2 suite needs the backend**, because its online half talks to the
real API and creates real accounts (named `*_phase2test`). Start it first,
pointed at a throwaway database:

```bash
# backend/.env -> MONGO_URI=mongodb://127.0.0.1:27017/messmate_phase2_test
npm run test:phase2
```

---

## Development phases

| Phase | Scope | State |
| --- | --- | --- |
| 0 | Expo SDK 57 setup, dependencies, folder structure | **DONE** |
| 1 | MongoDB, User model, Meal model, basic API | **DONE** |
| 2 | Login, Signup + joinDate, offline-first session, local meal storage + sync foundation | **DONE** |
| 3 | Home - today's breakfast/dinner, 30-meal cycle, HOME / MEALS / PROFILE bottom tabs | **DONE** |
| 4 | Meals - prev/next + calendar date picking inside joinDate -> today, per-date editor, complete history table | **DONE** |
| 5 | Profile - PDF report, logout | not started |
| 6 | Android + iPhone testing, bug fixes, cleanup | not started |

Each phase stops for review before the next one starts.

### What Phase 4 deliberately does NOT include

- No Profile work: no PDF report, no editing the profile, no new logout UI.
  PROFILE is still the Phase 3 placeholder.
- No change to Home, to the theme, or to the sync architecture.
- No second data store, no SQLite / Realm / Redux, no new package at all.
- No giant progress/cycle panel on Meals - Home keeps the cycle dashboard.
- No new meal state: the vocabulary stays EATEN / NOT EATEN / NOT RECORDED, and
  `not_recorded` is still never written anywhere.

### What Phase 2 deliberately does NOT include

- No Home, Meals or Profile screen, and no bottom tab bar - Phase 3+.
- No dashboard, calendar, history table, cycle UI or PDF report.
- No `not_recorded` value, no extra meal states.
- No Redux / SQLite / Realm / WatermelonDB / Firebase / GraphQL / service
  workers / background-sync package.
- No bcrypt, JWT, OAuth, OTP or role system (the backend has none either).

The signed-in screen after Login used to be a temporary placeholder that showed
the signed-in user, how many records were on the device and how many changes
were waiting to upload, with **SYNC RECORDS** / **LOGOUT** buttons. Phase 3
replaced it with **Home** plus the bottom tabs: **LOGOUT** lives on the PROFILE
placeholder now, and a manual **SYNC RECORDS** button returns with the real
Profile screen in Phase 5 (syncing still runs automatically on app open and
right after login).
