# CallSync

**CallSync is an AI-first meeting operations workspace.**

Instead of making users navigate through calendars, meeting records, follow-ups, tasks, and relationship history manually, CallSync is moving toward a simpler model:

> Tell CallSync what you want done. The agent handles the workflow.

The chat workspace is the primary product surface. Meetings, People, Tasks, Today, and Calendars remain available as structured records and manual fallbacks behind the agent.

Examples:

- “Schedule a 30 minute call with Maya next week in the afternoon.”
- “Prepare me for my next meeting.”
- “What do I still owe people?”
- “Show everyone I met recently who has an open commitment.”
- “Find my active meetings.”

The goal is not to add an AI chatbot to a scheduling product. The goal is to make CallSync an **AI meeting operator** backed by reliable calendar, email, meeting-memory, and action systems.

## Product principles

CallSync is being built around a few simple rules:

1. **Workflow before dashboard.** The product should make the next action obvious instead of showing users more metrics.
2. **Chat first.** Users should be able to describe the outcome they want instead of learning where every feature lives.
3. **Structured records still matter.** AI operates on durable Meetings, People, Tasks, Outcomes, and Memory rather than opaque chat state.
4. **Read and prepare automatically.** Searching, summarizing, and preparing can happen without extra friction.
5. **Confirm external side effects.** Sending invitations or changing external systems requires an explicit approval boundary.
6. **Never fake success.** Calendar, email, and provider failures remain visible and cannot be represented as completed work.

## Current experience

After login, CallSync opens on the AI workspace.

Primary navigation:

- **Chat** — tell CallSync what you want done;
- **Today** — work that needs attention now;
- **Meetings** — lifecycle view for meeting requests and booked conversations;
- **People** — repeated-attendee history and context;
- **Tasks** — durable commitments created from meetings;
- **Calendars** — Google and Microsoft connections.

The manual workspace is intentionally becoming quieter and more utilitarian. The long-term direction is that users should rarely need to navigate through the product to perform routine meeting operations.

## AI agent architecture

The current agent flow is server-side:

```text
User
  ↓
Chat workspace
  ↓
POST /api/agent/chat
  ↓
CallSync agent orchestrator
  ↓
Tool selection
  ├── Meetings
  ├── Tasks
  ├── People / relationship history
  ├── Meeting preparation
  └── Scheduling + real calendar availability
  ↓
Structured result or approval request
  ↓
Confirmed side effect
  ↓
Existing CallSync execution services
```

The browser no longer decides whether a request “looks like” scheduling, tasks, or meetings and then calls those APIs directly. Intent, tool selection, conversation state, and approval state are owned by the backend.

### Current agent tools

The server agent can currently:

- list active, pending, and booked meetings;
- list open meeting commitments;
- find a person by name/email and retrieve meeting history plus open work;
- prepare a pre-call brief for a booked meeting;
- interpret a natural-language scheduling request;
- identify missing scheduling information;
- check real Google/Outlook availability;
- rank available times;
- prepare a meeting invitation;
- create a durable approval request before sending anything.

Scheduling execution uses the same protected meeting-creation path as the normal product rather than a separate AI-only implementation.

### Durable agent state

Agent conversations and approvals are persisted in PostgreSQL:

```text
agent_threads
agent_messages
agent_pending_actions
```

This means the AI workspace is not dependent on temporary React state. The latest conversation can be restored after reload, and external actions have durable approval state.

Newer proposals supersede stale pending approvals, approvals expire, and selected meeting times are validated against the original agent proposal before execution.

## Meeting lifecycle

Underneath the agent, CallSync still maintains a structured meeting lifecycle:

```text
Request
  ↓
Calendar availability
  ↓
Temporary holds
  ↓
Guest booking
  ↓
Confirmed meeting
  ↓
Preparation
  ↓
Conversation
  ↓
Outcome
  ↓
Tasks / follow-up
  ↓
Memory + relationship continuity
```

The canonical meeting record contains the context for one conversation, while People and Tasks provide longitudinal views across meetings.

## Current product capabilities

### Scheduling and calendar coordination

- Google Calendar OAuth;
- Outlook Calendar OAuth;
- combined Google + Outlook availability;
- fail-closed calendar reads when a connected provider cannot be verified;
- duration, work-window, slot interval, and buffer controls;
- privacy-safe conflict analysis and best-fit slot ranking;
- private host-only temporary calendar holds;
- selected-hold promotion into the booked attendee event;
- cleanup of unused holds;
- cancellation cleanup across connected providers.

### Communication

- meeting-request delivery from the host's connected Gmail or Outlook mailbox;
- guest booking links;
- qualification questions;
- booking confirmation delivery;
- connected-mail follow-ups;
- explicit delivery state when provider sending fails.

### Meeting intelligence

- editable AI-assisted meeting briefs;
- deterministic fallback when the AI provider is unavailable;
- pre-call preparation;
- follow-up suggestions;
- opening prompts;
- next-step suggestions;
- post-call outcome capture;
- meeting memory generated from raw notes while keeping the source notes separate.

### Work and relationship continuity

- Today execution queue;
- durable Tasks / Action Engine;
- outcome-backed and manually created commitments;
- complete/reopen task workflow;
- People view built from repeated-attendee history;
- repeated-attendee meeting context;
- previous memory carried into future preparation.

### Reliability and security

- request correlation IDs;
- hardened public health endpoints;
- CORS enforcement;
- fail-closed provider behavior;
- calendar-hold rollback when meeting creation cannot be protected;
- explicit provider delivery state;
- OAuth token-encryption support using AES-256-GCM;
- generic client errors for unexpected server failures.

Real-provider production activation and failure-path verification remain tracked separately from source completion in GitHub issues #14 and #23.

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
    PRODUCT_ROADMAP.md
    ROADMAP_STATUS_2026-09-04.md
    MICROSOFT_OAUTH_SETUP.md
```

## Backend architecture

Key boundaries:

- `Backend/src/app.js` — Express application, middleware, routes, and error handling;
- `Backend/src/config/env.js` — centralized environment configuration;
- `Backend/src/db/*` — PostgreSQL pool and migrations;
- `Backend/src/routes/agentRoutes.js` — agent chat, thread restoration, and approval confirmation API;
- `Backend/src/services/agentOrchestratorService.js` — server-side model/tool loop;
- `Backend/src/services/agentTools.js` — CallSync tool registry;
- `Backend/src/services/agentStore.js` — persistent threads, messages, and pending actions;
- `Backend/src/services/agentAvailabilityService.js` — calendar availability for agent scheduling;
- `Backend/src/services/meetingCreationService.js` — shared protected meeting creation path used by both normal UI and agents;
- `Backend/src/services/calendarService.js` — Google/Outlook calendar operations and token refresh;
- `Backend/src/services/mailService.js` — connected Gmail/Outlook sending;
- `Backend/src/services/generationService.js` — meeting-brief generation with deterministic fallback;
- `Backend/src/services/workflowGenerationService.js` — follow-up/pre-call/next-step generation;
- `Backend/src/services/memoryGenerationService.js` — durable meeting-memory generation;
- `Backend/src/utils/tokenCrypto.js` — OAuth token encryption.

## Agent safety model

CallSync currently uses a simple capability boundary:

| Capability | Agent behavior |
| --- | --- |
| Read meetings | Automatic |
| Read tasks | Automatic |
| Read relationship history | Automatic |
| Generate meeting preparation | Automatic |
| Check calendar availability | Automatic |
| Draft scheduling proposal | Automatic |
| Create calendar holds | Confirmation required |
| Send meeting request | Confirmation required |
| Other future external changes | Confirmation required by default |

A confirmed scheduling action is executed only after the backend verifies:

- the approval belongs to the signed-in user;
- the action is still pending;
- the action has not expired;
- selected slots came from the original proposal;
- the protected meeting-creation workflow can complete.

CallSync does not claim completion unless the execution service returns a real result.

## Reliability contracts

External providers are treated as part of product correctness:

- connected-calendar availability fails closed rather than pretending a blocked calendar is free;
- a meeting request is not sent if all offered slots cannot be protected;
- failed hold creation rolls back created holds;
- failed selected-hold promotion cannot leave the meeting falsely confirmed;
- confirmation-email failure does not undo an otherwise valid calendar booking, but the delivery state remains visible;
- cancellation exposes incomplete provider cleanup;
- AI provider failures can fall back to deterministic behavior;
- unexpected server errors stay generic for clients and include request IDs for log correlation.

## Local development

### Backend

```bash
cd Backend
npm install
cp .env.example .env
npm run migrate
npm run dev
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm start
```

## Verification

Backend syntax and unit tests:

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

Use only a disposable integration database. The test suite resets data with `TRUNCATE ... CASCADE`.

Frontend:

```bash
cd frontend
npm test -- --watchAll=false --runInBand
npm run build
```

## Environment variables

### Backend

Core:

- `DATABASE_URL` or `DATABASE_URL_V2`
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

AI:

- `OPENAI_API_KEY` — optional; deterministic fallback remains available where supported;
- `OPENAI_MODEL` — optional model override.

Security:

- `TOKEN_ENCRYPTION_KEY` — base64-encoded 32-byte key; configure only as part of the documented encryption rollout.

### Frontend

- `REACT_APP_API_URL`
- `REACT_APP_GOOGLE_CLIENT_ID`
- `REACT_APP_OUTLOOK_CLIENT_ID`

## Deployment

The current deployment model uses:

- **Vercel** — frontend;
- **Vercel** — Express backend/serverless API;
- **PostgreSQL / Supabase** — persistent application and agent state;
- **Google APIs** — Google Calendar + Gmail;
- **Microsoft Graph** — Outlook Calendar + Mail;
- **OpenAI Responses API** — server-side AI orchestration when configured.

Stable aliases:

- frontend: `https://call-sync-livid.vercel.app`
- backend: `https://call-sync-irsv.vercel.app`

Public operational endpoints:

- `/api/health`
- `/api/health/db`

The database health endpoint intentionally returns only safe reachability information rather than raw hosts, credentials, or provider errors.

## Technology roadmap

CallSync should add infrastructure because the product needs it, not because the technology looks impressive.

### Near-term

**Docker**

Containerize the API and future workers so local development, CI, and deployment use reproducible runtime environments.

**Redis**

Potential uses include:

- short-lived agent execution state;
- idempotency keys;
- distributed locks;
- availability caching;
- rate limiting;
- queue coordination.

**Background queue / workers**

As agent actions expand, provider work such as email batches, calendar operations, retries, AI generation, and follow-up workflows should move out of synchronous request paths.

RabbitMQ, Redis-backed queues, or another durable queue can be evaluated based on the workload.

### Evaluate when justified

**GraphQL**

Potentially useful as a read/orchestration gateway once agent and frontend views routinely need Meetings + People + Tasks + Memory in one query. It should not replace straightforward REST endpoints without a real data-shaping need.

**Kubernetes**

Not justified for the current single-application scale. It becomes reasonable only if CallSync evolves into several independently scalable services/workers with real traffic, queue consumers, scheduling workloads, and autoscaling requirements.

A likely future architecture is:

```text
React client
    ↓
API / Agent gateway
    ↓
Agent orchestrator
    ├── Meeting tools
    ├── Relationship tools
    ├── Communication tools
    └── Scheduling tools
    ↓
PostgreSQL + Redis
    ↓
Durable queue
    ↓
Background workers
    ↓
Google / Microsoft / AI providers
```

Docker would package these services. Kubernetes would only orchestrate them once operational scale makes that complexity worthwhile.

## Current priorities

The product direction is now:

1. make the AI workspace the easiest way to operate CallSync;
2. expand agent tools beyond scheduling, reads, and preparation;
3. add approval-gated follow-up, rescheduling, cancellation, and task operations;
4. continue simplifying the manual workspace so it remains a clean system of record;
5. finish Outlook-only and provider failure-path production verification;
6. complete Stage 6–7 production activation and token-encryption verification;
7. introduce Docker and background-job infrastructure when agent workloads justify it;
8. evaluate Redis, queues, GraphQL, and eventually Kubernetes based on concrete product needs.

## Documentation

- [Product roadmap](docs/PRODUCT_ROADMAP.md)
- [Current roadmap status](docs/ROADMAP_STATUS_2026-09-04.md)
- [Microsoft OAuth production setup](docs/MICROSOFT_OAUTH_SETUP.md)
- [OAuth token-encryption rollout](Backend/scripts/OAUTH_TOKEN_ENCRYPTION_RUNBOOK.md)

---

CallSync is moving from a meeting-management dashboard toward a product where the user can simply say what they want done and let the system coordinate the work safely.
