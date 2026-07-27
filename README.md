# A Cappella Rehearsal App — Phase 1 MVP

A lightweight web app for coordinating rehearsals: see the group calendar, and mark yourself absent from a specific rehearsal (with an optional reason) so the whole group knows.

## What's included (Phase 1 scope)

- **Auth** — register/login with JWT. The first person to register becomes an admin automatically; everyone after that is a member.
- **Rehearsal calendar** — list of upcoming rehearsals (date, time, location, notes). Admins can create and delete rehearsals.
- **Absence tracking** — any member can mark "I can't make it" on a rehearsal, optionally with a reason, and un-mark it later. Everyone can see who's out for a given rehearsal.
- **65 passing backend integration tests** covering auth, rehearsal permissions, absence logic, and gigs.

Not included yet (future phases, discussed separately): gig management, financial tracking, notifications/integrations, analytics.

## Stack

- **Backend:** Node.js + Express, Postgres (via `pg`), JWT auth, Zod validation
- **Frontend:** React + Vite + Tailwind CSS v4, React Router

The same Postgres schema runs locally and in production — local dev points at a Homebrew Postgres, production at Supabase. Both are created automatically on startup by `initDb()` in `backend/src/db/index.js`.

## Running it locally

### Postgres (one-time setup)

```bash
brew install postgresql@17
brew services start postgresql@17
createdb acappella_dev
createdb acappella_test
```

### Backend

```bash
cd backend
npm install
cp .env.example .env   # then set JWT_SECRET
npm run dev            # starts on http://localhost:3001
```

Run the test suite any time with:

```bash
npm test
```

Tests run against `acappella_test`, and each test file uses its own Postgres
schema so the files can run in parallel without interfering with each other.

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

## Deployment

- **Frontend:** Vercel (root directory `frontend`), env var `VITE_API_URL`
- **Backend:** Render web service, build `cd backend && npm install`, start `cd backend && npm start`
- **Database:** Supabase Postgres, connection string as `DATABASE_URL`

Backend environment variables: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `NODE_ENV`.
See `backend/.env.example`.

## Notes for next steps

- See our earlier conversation for the phased roadmap (analytics, integrations, etc.)
