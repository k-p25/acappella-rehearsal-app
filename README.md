# A Cappella Rehearsal App — Phase 1 MVP

A lightweight web app for coordinating rehearsals: see the group calendar, and mark yourself absent from a specific rehearsal (with an optional reason) so the whole group knows.

## What's included (Phase 1 scope)

- **Auth** — register/login with JWT. The first person to register becomes an admin automatically; everyone after that is a member.
- **Rehearsal calendar** — list of upcoming rehearsals (date, time, location, notes). Admins can create and delete rehearsals.
- **Absence tracking** — any member can mark "I can't make it" on a rehearsal, optionally with a reason, and un-mark it later. Everyone can see who's out for a given rehearsal.
- **19 passing backend integration tests** covering auth, rehearsal permissions, and absence logic.

Not included yet (future phases, discussed separately): gig management, financial tracking, notifications/integrations, analytics.

## Stack

- **Backend:** Node.js + Express, SQLite (via `better-sqlite3`) for zero-setup local dev, JWT auth, Zod validation
- **Frontend:** React + Vite + Tailwind CSS v4, React Router

SQLite is a drop-in stand-in for local development — the schema is simple enough that migrating to Postgres (e.g. Supabase) for production is a small, mechanical change to `backend/src/db/index.js` when you're ready to deploy.

## Running it locally

### Backend

```bash
cd backend
npm install
npm run dev        # starts on http://localhost:3001
```

Run the test suite any time with:

```bash
npm test
```

### Frontend

```bash
cd frontend
npm install
npm run dev         # starts on http://localhost:5173, proxies /api to the backend
```

Open `http://localhost:5173`, register an account (you'll be the admin), create a rehearsal, and try marking yourself absent.

## Project structure

```
backend/
  src/
    app.js            # Express app factory (used by both server + tests)
    index.js          # server entry point
    db/index.js        # SQLite connection + schema
    middleware/auth.js  # JWT auth + admin-check middleware
    routes/             # auth, rehearsals, absences
    tests/               # integration tests (node:test + supertest)

frontend/
  src/
    api/client.js        # axios instance with auth token interceptor
    context/AuthContext.jsx
    components/           # Navbar, RehearsalCard, ProtectedRoute
    pages/                  # LoginPage, DashboardPage, RehearsalDetailPage
```

## Notes for next steps

- Swap SQLite → Postgres (Supabase) before deploying for real use with your group
- Deploy backend to Railway/Render, frontend to Vercel/Netlify
- See our earlier conversation for the phased roadmap (gig management, analytics, integrations, etc.)
