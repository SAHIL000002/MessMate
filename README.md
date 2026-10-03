# 🍽️ MessMate

### Offline-First Mess Meal Tracker

MessMate is a full-stack mobile application designed to simplify mess meal tracking by allowing users to independently track breakfast and dinner, maintain complete meal history, manage 30-meal cycles, and continue using the app even when the internet is unavailable.

---

## 📌 Problem

Traditional mess meal tracking often relies on manual records or spreadsheets, making it difficult to:

- Track breakfast and dinner separately
- Maintain complete historical records
- Track independent 30-meal cycles
- Know remaining meals
- Manage records without internet connectivity
- Synchronize local changes with cloud data
- Generate complete meal reports

---

## 💡 Solution

MessMate provides a simple mobile solution where users can:

- 🍳 Track breakfast and dinner independently
- ✅ Mark meals as EATEN, NOT EATEN, or NOT RECORDED
- 📅 Maintain records from their individual joining date
- 🔄 Track independent 30-meal cycles
- 📋 View complete date-wise meal history
- ✏️ Update historical meal records
- 📱 Continue tracking meals offline
- ☁️ Synchronize pending changes when internet returns
- 📄 Generate detailed PDF reports

---

## ✨ Features

### 🍳 Breakfast & Dinner Tracking

Breakfast and dinner are tracked independently.

Each meal can have three states:

- ✅ EATEN
- ❌ NOT EATEN
- — NOT RECORDED

### 🔄 30-Meal Cycle Tracking

MessMate uses an eaten-meal-based cycle rather than a calendar-day-based cycle.

A cycle completes after 30 EATEN meals.

Breakfast and dinner maintain separate cycles with:

- Current cycle progress
- Remaining meals
- Cycle start date
- Calendar duration
- Completed cycle history
- Expected completion date

### 📅 Complete Meal History

Users can view their complete meal history from their mess joining date to today.

Historical records can be added or updated while future dates remain unavailable.

### 📱 Offline-First

MessMate continues working when the internet is unavailable.

Offline functionality includes:

- Local user session
- Local meal records
- Local meal updates
- Pending synchronization queue
- Offline history
- Offline PDF generation

When connectivity returns, pending changes can be synchronized with the cloud backend.

### 📄 PDF Reports

Users can generate detailed reports containing:

- User information
- Report dates
- Breakfast total
- Dinner total
- Complete daily meal history
- Breakfast cycle summary
- Dinner cycle summary
- Completed cycle history
- Current cycle information

---

## 🏗️ Architecture

```text
                 ┌─────────────────────┐
                 │   React Native App  │
                 │       Expo          │
                 └──────────┬──────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
        Offline Mode                 Online Mode
              │                           │
       ┌──────▼──────┐             ┌──────▼──────┐
       │ AsyncStorage│             │ Express API │
       └──────┬──────┘             └──────┬──────┘
              │                           │
       Pending Sync Queue           ┌──────▼──────┐
              │                     │   Mongoose  │
              │                     └──────┬──────┘
              │                            │
              └────────────────────►┌──────▼──────┐
                                    │ MongoDB     │
                                    │ Atlas       │
                                    └─────────────┘

🛠️ Tech Stack

Frontend

* React Native
* Expo SDK 57
* JavaScript
* React Navigation
* Axios
* AsyncStorage
* Expo Print
* Expo Sharing
* Expo File System
* Expo Vector Icons
* Plus Jakarta Sans

Backend

* Node.js
* Express.js
* Mongoose
* MongoDB
* CORS
* dotenv

Database

* MongoDB Atlas

Deployment

* Render
* Expo Application Services (EAS)

Development

* VS Code
* Git
* GitHub
* PowerShell

⸻

📂 Project Structure

MessMate/
│
├── frontend/
│   ├── assets/
│   ├── src/
│   │   ├── components/
│   │   ├── screens/
│   │   ├── navigation/
│   │   ├── services/
│   │   ├── context/
│   │   ├── utils/
│   │   └── constants/
│   │
│   ├── App.js
│   ├── app.json
│   ├── package.json
│   └── eas.json
│
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── models/
│   │   ├── controllers/
│   │   ├── routes/
│   │   └── utils/
│   │
│   ├── server.js
│   ├── package.json
│   └── .env.example
│
└── README.md

🔐 Authentication

MessMate uses a simple user-based authentication architecture designed for this application.

Users can:

* Sign up using username, email, password, and joining date
* Log in using username or email
* Maintain a local session
* Continue using previously authenticated data offline

The local session stores only:
id
username
email
joinDate
Passwords are not stored in AsyncStorage.

⸻

📡 API Endpoints

Health
GET /api/health

Authentication
POST /api/auth/register
POST /api/auth/login
GET /api/auth/user/:id

meals
GET /api/meals/:userId
POST /api/meals
PATCH /api/meals/:id
GET /api/meals/stats/:userId

⚙️ Local Setup

1. Clone Repository
git clone https://github.com/YOUR_USERNAME/MessMate.git
cd MessMate

2. Backend Setup
cd backend
npm install

Create a .env file:
PORT=5000
MONGO_URI=your_mongodb_atlas_connection_string
NODE_ENV=development

Start the backend:
npm start

🎯 Learning Outcomes

Building MessMate provided hands-on experience with:

* React Native mobile development
* Expo
* REST API development
* MongoDB and Mongoose
* Offline-first architecture
* Local data persistence
* Data synchronization
* Date-based business logic
* PDF generation
* Cloud deployment
* Environment variables
* Production debugging
* Automated testing
* Android application builds

⸻

🔮 Future Improvements

Potential future improvements include:

* Push notifications
* Improved synchronization conflict resolution
* Admin/mess-owner dashboard
* Advanced analytics
* Cloud-based report storage
* App Store and Play Store distribution
* Improved account security for larger-scale deployment

⸻

👨‍💻 Author

Sahil

B.Tech | Artificial Intelligence & Machine Learning

⸻

🔗 Project Links

📱 App

PASTE YOUR APP LINK HERE

💻 GitHub

PASTE YOUR GITHUB REPOSITORY LINK HERE

⸻

⭐ Support

If you find MessMate useful or interesting, consider giving the repository a ⭐.
