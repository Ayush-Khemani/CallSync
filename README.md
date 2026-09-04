# CallSync

CallSync is a lightweight meeting operating system for high-value calls.

> Turn an interested conversation into a booked, prepared, completed, remembered, and followed-up meeting.

Calendar sync is infrastructure; the durable meeting record and lifecycle are the product.

See:

- [Product roadmap](docs/PRODUCT_ROADMAP.md)
- [Current roadmap status](docs/ROADMAP_STATUS_2026-09-04.md)
- [Microsoft OAuth production setup](docs/MICROSOFT_OAUTH_SETUP.md)
- [OAuth token-encryption rollout](Backend/scripts/OAUTH_TOKEN_ENCRYPTION_RUNBOOK.md)

## Current product scope

CallSync currently includes:

- email/password authentication;
- Google Calendar and Outlook Calendar OAuth connections;
- explicit connected/not-connected calendar state in the Calendars workspace;
- combined availability across Google and Outlook;
- fail-closed calendar reads when a connected provider cannot be verified;
- privacy-safe best-fit slot ranking and conflict counts;
- duration, work-window, interval, and buffer controls;
- private/busy host-only temporary calendar holds;
- meeting-request delivery from the host's connected Gmail or Outlook mailbox;
- public guest booking and qualification questions;
- selected-hold promotion into the real attendee meeting;
- unused-hold cleanup and cancellation cleanup;
- Today daily execution queue for upcoming meetings, stale invites, missing outcomes, and due commitments;
- meeting pipeline and lifecycle analytics;
- durable meeting Action Engine with outcome-backed and manual commitments;
- Actions workspace with open/completed/overdue views;
- Relationships workspace derived from repeated-attendee meeting history;
- meeting-record Actions for adding, completing, and reopening commitments in context;
- editable AI-assisted meeting briefs with deterministic fallback;
- editable follow-up, pre-call, opening-prompt, and next-step suggestions;
- connected Gmail/Outlook follow-up sending;
- post-call outcome capture;
- durable meeting memory with raw notes kept separate from derived memory;
- repeated-attendee relationship continuity;
- request correlation IDs, hardened public health diagnostics, CORS enforcement, and OAuth token-encryption support.

Real-provider production activation is tracked separately from source completion in GitHub issues #14 and #23.

## Repository layout

```text
CallSync/
  Backend/
    migrations/
    scripts/
    src/
      config/
      db/
      middleware/
      routes/
      services/
      utils/
    tests/
    index.js
    package.json
    vercel.json
  frontend/
    public/
    src/
    package.json
    vercel.json
  docs/
```

## Backend architecture

- `Backend/src/app.js` configures Express, CORS, JSON parsing, routes, request context, and error handling.
- `Backend/src/server.js` starts the local/long-running server.
- `Backend/index.js` exports the Vercel handler.
- `Backend/src/config/env.js` centralizes environment configuration.
- `Backend/src/db/*` owns Postgres pooling and migrations.
- `Backend/src/routes/*` owns the HTTP API.
- `Backend/src/services/calendarService.js` owns Google/Outlook calendar behavior and token refresh.
- `Backend/src/services/mailService.js` owns narrow connected Gmail/Outlook sending.
- `Backend/src/services/generationService.js`, `workflowGenerationService.js`, and `memoryGenerationService.js` provide server-side AI assistance with deterministic fallback.
- `Backend/src/utils/tokenCrypto.js` provides AES-256-GCM OAuth token encryption when `TOKEN_ENCRYPTION_KEY` is configured.

## Reliability contracts

CallSync intentionally treats external-provider correctness as a release requirement:

- connected-calendar availability fails closed rather than showing a falsely free day;
- meeting requests are not sent if every offered slot cannot be protected by calendar holds;
- a failed selected-hold promotion does not leave CallSync falsely confirmed;
- confirmation-email failure does not undo a calendar-confirmed booking, but delivery state remains explicit;
- cancellation surfaces incomplete provider cleanup;
- unexpected server errors remain generic to clients and carry a request ID for log correlation;
- AI provider failures/malformed responses fall back to grounded deterministic output.

## Verification

Backend unit checks:

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

The integration database is reset with `TRUNCATE ... CASCADE`; use only a disposable test database.

Frontend:

```bash
cd frontend
npm test -- --watchAll=false --runInBand
npm run build
```

## Local setup

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

Run database migrations:

```bash
cd Backend
npm run migrate
```

Generate a 32-byte token-encryption key when preparing the encryption rollout:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Then follow [Backend/scripts/OAUTH_TOKEN_ENCRYPTION_RUNBOOK.md](Backend/scripts/OAUTH_TOKEN_ENCRYPTION_RUNBOOK.md); do not blindly enable encryption without the dry-run/migration verification.

## Environment variables

### Backend

Core:

- `DATABASE_URL` (or `DATABASE_URL_V2`)
- `JWT_SECRET`
- `FRONTEND_URL`
- `FRONTEND_URLS`
- `FRONTEND_ORIGIN_REGEX`
- `AUTO_RUN_MIGRATIONS`

Google:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`

Microsoft:

- `OUTLOOK_CLIENT_ID`
- `OUTLOOK_CLIENT_SECRET`
- `OUTLOOK_REDIRECT_URI`

Generation:

- `OPENAI_API_KEY` — optional; deterministic fallback remains available without it
- `OPENAI_MODEL` — optional model override

Security rollout:

- `TOKEN_ENCRYPTION_KEY` — base64-encoded 32-byte key; configure only as part of the documented migration rollout

### Frontend

- `REACT_APP_API_URL`
- `REACT_APP_GOOGLE_CLIENT_ID`
- `REACT_APP_OUTLOOK_CLIENT_ID`

## Production deployment

Current production targets Vercel for the frontend/backend and Postgres for persistence.

Stable production aliases:

- frontend: `https://call-sync-livid.vercel.app`
- backend: `https://call-sync-irsv.vercel.app`

For OAuth, the provider redirect URI must match the frontend callback origin exactly. Microsoft personal-account support additionally requires the Entra configuration documented in [docs/MICROSOFT_OAUTH_SETUP.md](docs/MICROSOFT_OAUTH_SETUP.md).

Public operational checks:

- `/api/health`
- `/api/health/db`

`/api/health/db` intentionally exposes only safe service/database reachability information and commit correlation—not database hosts or raw provider/database errors.

## Release state

The implementation stack through Stage 7 plus the Today / Actions / Relationships productization layer through PR #40 is shipped. Current work is focused on production activation, repeated real usage, and reliability rather than adding another large feature stage.

Priority order:

1. finish the dedicated Outlook-only Priority 0 production run;
2. finish Priority 0 real-provider revoked-token and delivery/failure-path checks;
3. verify provider-backed AI generation and deterministic fallback in production;
4. verify connected Gmail/Outlook follow-up sending;
5. validate coordination intelligence and lifecycle analytics against real records;
6. execute the OAuth token-encryption rollout safely;
7. verify durable meeting memory and repeated-attendee continuity in production;
8. define the paid-product boundary only after repeated product value is demonstrated.
