# CallSync

CallSync is a meeting scheduling product that helps a host connect Google/Outlook calendars, offer available slots, send a booking link, and let an invitee confirm one time.

The production direction is an AI-assisted scheduling assistant: fewer back-and-forth emails, cleaner calendar coordination, and smarter suggestions for when meetings should happen.

## Current Product Scope

- Email/password authentication
- Google Calendar OAuth callback
- Outlook Calendar OAuth callback
- Availability lookup across connected calendars
- Meeting request creation
- Public booking link
- Slot selection and confirmation
- Email notifications through the SendGrid HTTPS API
- Postgres persistence

## Why This Project Matters

Scheduling is a real workflow problem. Teams, students, recruiters, founders, and clients all lose time coordinating meetings. CallSync can become a polished productivity product because the core value is easy to understand:

> Connect calendars, offer times, let the other person choose, and keep everyone in sync.

## Repository Layout

```txt
CallSync/
  Backend/
    migrations/
      001_initial_schema.sql
    src/
      config/
      db/
      middleware/
      routes/
      services/
      utils/
    index.js
    vercel.json
    package.json
  frontend/
    src/
    public/
    package.json
```

## Backend Architecture

The backend has been split away from the original single-file prototype:

- `src/app.js` configures Express, CORS, JSON parsing, routes, and error handling.
- `src/server.js` runs migrations and starts the local/long-running server.
- `index.js` exports the Express app for Vercel's Node backend runtime.
- `src/config/env.js` centralizes environment configuration.
- `src/db/pool.js` owns Postgres connection pooling.
- `src/db/migrate.js` loads SQL migrations.
- `src/routes/*` owns HTTP endpoints.
- `src/services/*` owns calendar, email, and availability logic.
- `src/utils/tokenCrypto.js` encrypts calendar access tokens when `TOKEN_ENCRYPTION_KEY` is configured.

## Verification

Backend:

```bash
cd Backend
npm run check
npm test
```

Database-backed integration tests:

```bash
cd Backend
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/callsync_test npm run test:integration
```

The integration test database is reset with `TRUNCATE ... CASCADE`, so point `TEST_DATABASE_URL` only at a disposable test database.

Frontend:

```bash
cd frontend
npm test -- --watchAll=false --runInBand
npm run build
```

## Local Setup

Backend:

```bash
cd Backend
npm install
cp .env.example .env
npm run dev
```

Frontend:

```bash
cd frontend
npm install
cp .env.example .env
npm start
```

Generate a token encryption key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Run database migrations:

```bash
cd Backend
npm run migrate
```

## Deployment

Production now targets Vercel and Supabase instead of Render.

Supabase:

- Create a Supabase project under the `Sing` organization.
- Use the Supabase pooled Postgres connection string for `DATABASE_URL`.
- The backend can auto-run the SQL in `Backend/migrations` on first request when `AUTO_RUN_MIGRATIONS` is not `false`.
- Keep Supabase service role and secret keys out of the frontend. CallSync only needs the Postgres connection string on the backend.

Backend on Vercel:

- Create a Vercel project named `callsync-backend` with `Backend` as the project root.
- Use Vercel's Node backend support; `Backend/index.js` exports the Express app.
- Set production environment variables in Vercel: `DATABASE_URL`, `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY`, `FRONTEND_URL`, `SENDGRID_API_KEY`, `EMAIL_FROM`, Google OAuth credentials, and Outlook OAuth credentials.
- Set `AUTO_RUN_MIGRATIONS=true` for the first production deploy. After the schema is confirmed, it can remain enabled for the current idempotent migrations or be set to `false` after running migrations manually.
- Verify with `/api/health`.

Frontend on Vercel:

- Create a Vercel project named `callsync-frontend` with `frontend` as the project root.
- Set `REACT_APP_API_URL` to the deployed backend URL.
- Set Google and Outlook client IDs.
- `frontend/vercel.json` keeps client-side routes working on refresh.

## Required Environment Variables

Backend:

- `DATABASE_URL`
- `JWT_SECRET`
- `TOKEN_ENCRYPTION_KEY`
- `FRONTEND_URL`
- `AUTO_RUN_MIGRATIONS`
- `SENDGRID_API_KEY`
- `EMAIL_FROM`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `OUTLOOK_CLIENT_ID`
- `OUTLOOK_CLIENT_SECRET`
- `OUTLOOK_REDIRECT_URI`

Frontend:

- `REACT_APP_API_URL`
- `REACT_APP_GOOGLE_CLIENT_ID`
- `REACT_APP_OUTLOOK_CLIENT_ID`

## Production Gaps Still To Close

- Deploy backend on Vercel and point it at Supabase Postgres.
- Deploy frontend on Vercel and point it at the Vercel backend.
- Add link expiry.
- Add rescheduling flows.
- Add request validation middleware.
- Expand backend integration tests around calendar refresh and booking edge cases.
- Add observability through Sentry or similar.
- Add AI scheduling features only after the core workflow is reliable.

## AI Roadmap

The best AI additions are workflow-specific:

- Natural language meeting creation: "Schedule a 30-minute call with Sarah next week after 2 PM."
- Smart slot ranking based on working hours, calendar density, and meeting buffers.
- Invite email drafting and follow-up reminders.
- Conflict explanations: why a time was not suggested.
- Weekly scheduling summary for the host.

## Presentation Plan

For portfolio/public launch:

1. Add screenshots of login, calendar connection, meeting creation, public booking, and confirmation.
2. Add an architecture diagram.
3. Deploy frontend and backend.
4. Create a demo mode with fake calendar data.
5. Write a case study explaining the production hardening work.
