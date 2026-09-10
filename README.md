# CallSync

**CallSync is an AI-first meeting operations workspace.**

Instead of making users navigate through calendars, meeting records, follow-ups, tasks, and relationship history manually, CallSync is moving toward a simpler model:

> Tell CallSync what you want done. The agent handles the workflow.

The chat workspace is the primary product surface. Meetings, People, Tasks, Today, and Calendars remain available as structured records and manual fallbacks behind the agent.

Examples:

- “Schedule a 30 minute call with Maya next week in the afternoon.”
- “Prepare me for my next meeting.”
- “Follow up with Maya if she still has not booked.”
- “Move my meeting with Alex to Thursday afternoon.”
- “Cancel Friday’s meeting with Sam.”
- “Mark the send-deck task complete.”
- “What do I still owe people?”

The goal is not to add an AI chatbot to a scheduling product. The goal is to make CallSync an **AI meeting operator** backed by reliable calendar, email, meeting-memory, and action systems.

## Product principles

CallSync is being built around a few simple rules:

1. **Workflow before dashboard.** The product should make the next action obvious instead of showing users more metrics.
2. **Chat first.** Users should be able to describe the outcome they want instead of learning where every feature lives.
3. **Structured records still matter.** AI operates on durable Meetings, People, Tasks, Outcomes, and Memory rather than opaque chat state.
4. **Read and prepare automatically.** Searching, summarizing, and preparing can happen without extra friction.
5. **Confirm external side effects.** Sending messages or changing external calendars requires an explicit approval boundary.
6. **Keep internal work lightweight.** Reversible CallSync-only actions such as completing a task can happen directly once the target is identified.
7. **Never fake success.** Calendar, email, and provider failures remain visible and cannot be represented as completed work.

## Current experience

After login, CallSync opens on the AI workspace.

Primary navigation:

- **Chat** — tell CallSync what you want done;
- **Today** — work that needs attention now;
- **Meetings** — lifecycle view for meeting requests and booked conversations;
- **People** — repeated-attendee history and context;
- **Tasks** — durable commitments created from meetings;
- **Calendars** — Google and Microsoft connections.

The manual workspace is intentionally quieter and more utilitarian. The long-term direction is that users should rarely need to navigate through the product to perform routine meeting operations.

## AI agent architecture

CallSync now uses **LangGraph** as the server-side orchestration layer for the model/tool loop.

```text
User
  ↓
Chat workspace
  ↓
POST /api/agent/chat
  ↓
CallSync agent runtime
  ↓
LangGraph StateGraph
  ├── model node
  ├── conditional routing
  ├── tool node
  └── model ↔ tool loop
  ↓
CallSync tool registry
  ├── Meetings
  ├── Tasks
  ├── People / relationship history
  ├── Meeting preparation
  ├── Scheduling + real calendar availability
  ├── Follow-up preparation
  ├── Cancellation preparation
  └── Rescheduling preparation
  ↓
Structured result or durable approval request
  ↓
Confirmed side effect
  ↓
Existing CallSync execution services
```

LangGraph owns orchestration and state transitions during an agent run. CallSync still owns the business rules: meeting creation, calendar protection, connected-mail sending, cancellation, rescheduling, task state, persistence, and approval validation remain application services rather than framework-specific logic.

The browser does not decide whether a request “looks like” scheduling, follow-up, cancellation, tasks, or meetings and then call those APIs directly. Intent and tool selection happen on the server.

### LangGraph execution model

The current graph is deliberately small and explicit:

```text
START
  ↓
model
  ├── final answer ─────────→ END
  │
  └── tool call(s)
          ↓
        tools
          ↓
        model
          ↺
```

The graph preserves the existing six-tool-round safety ceiling and also uses LangGraph’s recursion limit as a second guard against runaway execution.

CallSync currently keeps conversation persistence and external-action approval state in its own PostgreSQL tables rather than using an in-memory LangGraph checkpointer. A future step can move resumable human-in-the-loop execution to a production PostgreSQL LangGraph checkpointer and native interrupt/resume semantics without rewriting the underlying CallSync services.

### Current agent tools

The server agent can currently:

- list active, pending, and booked meetings;
- list open meeting commitments;
- find a person by name/email and retrieve meeting history plus open work;
- prepare a pre-call brief for a booked meeting;
- interpret a natural-language scheduling request;
- identify missing scheduling information;
- check real Google/Outlook availability;
- rank available meeting times;
- prepare and create a meeting request after approval;
- prepare an editable follow-up email;
- send an approved follow-up through the user’s connected Gmail or Outlook mailbox;
- prepare a meeting cancellation and execute it after approval;
- find new availability for a booked meeting and reschedule after approval;
- complete or reopen internal CallSync tasks directly.

Scheduling, follow-up, cancellation, and rescheduling all reuse CallSync’s normal protected backend services rather than creating weaker AI-only execution paths.

### Durable agent state

Agent conversations and approvals are persisted in PostgreSQL:

```text
agent_threads
agent_messages
agent_pending_actions
```

This means the AI workspace is not dependent on temporary React state. The latest conversation can be restored after reload, and external actions have durable approval state.

Newer proposals supersede stale pending approvals. Approvals expire. Selected meeting times are validated against the original proposal, and a follow-up cannot be switched to a mailbox that was not available in the original approved action.

## Meeting lifecycle

Underneath the agent, CallSync maintains a structured meeting lifecycle:

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
- cancellation cleanup across connected providers;
- approval-gated rescheduling across connected providers;
- cross-provider reschedule rollback if one connected calendar update fails;
- reschedule availability that ignores the meeting’s own current event to avoid false self-conflicts.

### Communication

- meeting-request delivery from the host's connected Gmail or Outlook mailbox;
- guest booking links;
- qualification questions;
- booking confirmation delivery;
- connected-mail follow-ups;
- editable AI-prepared follow-up drafts inside Chat;
- explicit approval before agent-sent follow-up email;
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
- agent-driven task completion/reopening;
- People view built from repeated-attendee history;
- repeated-attendee meeting context;
- previous memory carried into future preparation.

### Reliability and security

- request correlation IDs;
- hardened public health endpoints;
- CORS enforcement;
- fail-closed provider behavior;
- calendar-hold rollback when meeting creation cannot be protected;
- reschedule rollback when connected providers cannot be updated consistently;
- explicit provider delivery state;
- durable expiring agent approvals;
- server-side validation of approved slots/mailboxes;
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
- `Backend/src/services/agentOrchestratorService.js` — CallSync runtime wrapper and deterministic fallback;
- `Backend/src/services/agentGraphService.js` — LangGraph StateGraph model/tool orchestration;
- `Backend/src/services/agentRegistry.js` — unified tool registry;
- `Backend/src/services/agentTools.js` — read/preparation tools;
- `Backend/src/services/agentActionTools.js` — follow-up, cancellation, rescheduling, and task-action tools;
- `Backend/src/services/agentStore.js` — persistent threads, messages, and pending approvals;
- `Backend/src/services/agentAvailabilityService.js` — calendar availability for agent scheduling/rescheduling;
- `Backend/src/services/meetingCreationService.js` — protected meeting creation used by normal UI and agents;
- `Backend/src/services/meetingLifecycleService.js` — reusable cancellation and rescheduling behavior;
- `Backend/src/services/followUpService.js` — reusable connected-mail follow-up preparation/sending;
- `Backend/src/services/actionMutationService.js` — reusable internal task-state mutation;
- `Backend/src/services/calendarService.js` — Google/Outlook calendar operations and token refresh;
- `Backend/src/services/mailService.js` — connected Gmail/Outlook sending;
- `Backend/src/services/generationService.js` — meeting-brief generation with deterministic fallback;
- `Backend/src/services/workflowGenerationService.js` — follow-up/pre-call/next-step generation;
- `Backend/src/services/memoryGenerationService.js` — durable meeting-memory generation;
- `Backend/src/utils/tokenCrypto.js` — OAuth token encryption.

## Agent safety model

| Capability | Agent behavior |
| --- | --- |
| Read meetings | Automatic |
| Read tasks | Automatic |
| Read relationship history | Automatic |
| Generate meeting preparation | Automatic |
| Check calendar availability | Automatic |
| Draft scheduling proposal | Automatic |
| Complete/reopen internal task | Automatic after target identification |
| Create calendar holds / send meeting request | Confirmation required |
| Send follow-up email | Confirmation required |
| Cancel meeting / calendar events | Confirmation required |
| Reschedule connected calendar event | Confirmation required |
| Future external changes | Confirmation required by default |

Before an approved external action executes, the backend verifies ownership, pending state, expiry, and action-specific constraints. Scheduling/rescheduling times must come from the original proposal; follow-up mailboxes must come from the original available-provider set.

CallSync does not claim completion unless the underlying execution service returns a real result.

## Reliability contracts

External providers are treated as part of product correctness:

- connected-calendar availability fails closed rather than pretending a blocked calendar is free;
- a meeting request is not sent if all offered slots cannot be protected;
- failed hold creation rolls back created holds;
- failed selected-hold promotion cannot leave the meeting falsely confirmed;
- cross-provider rescheduling attempts rollback if only one provider update succeeds;
- confirmation-email failure does not undo an otherwise valid calendar booking, but the delivery state remains visible;
- cancellation exposes incomplete provider cleanup;
- AI/LangGraph failures can fall back to deterministic basic behavior;
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

The unit suite includes dedicated LangGraph routing tests for model→tool→model transitions, safe termination, structured payload propagation, and timezone injection.

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
- **PostgreSQL / Supabase** — persistent application, conversation, and approval state;
- **LangGraph** — server-side agent orchestration;
- **Google APIs** — Google Calendar + Gmail;
- **Microsoft Graph** — Outlook Calendar + Mail;
- **OpenAI Responses API** — model/tool decisions when configured.

Stable aliases:

- frontend: `https://call-sync-livid.vercel.app`
- backend: `https://call-sync-irsv.vercel.app`

Public operational endpoints:

- `/api/health`
- `/api/health/db`

The database health endpoint intentionally returns only safe reachability information rather than raw hosts, credentials, or provider errors.

## Technology roadmap

CallSync should add infrastructure because the product needs it, not because the technology looks impressive.

### Next infrastructure steps

**Durable LangGraph checkpoints / interrupts**

The graph currently runs inside one request while conversations and approvals are persisted by CallSync. The next orchestration step is evaluating a PostgreSQL LangGraph checkpointer so long-running graph execution can pause and resume natively around human approvals without relying on process memory.

**Docker**

Containerize the API and future workers so local development, CI, and deployment use reproducible runtime environments.

**Redis**

Potential uses include:

- short-lived execution state;
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
LangGraph orchestrator
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

1. make Chat the easiest way to operate CallSync;
2. expand and harden real agent workflows instead of adding dashboard features;
3. move human approvals toward durable LangGraph checkpoint/interrupt semantics;
4. continue simplifying the manual workspace as a clean system of record;
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
