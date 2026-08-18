# CallSync Roadmap Audit — 2026-08-18

This audit compares `docs/PRODUCT_ROADMAP.md` against the current CallSync codebase.

Status legend:

- **Complete** — the roadmap task is implemented in the current product flow.
- **Complete in source** — implementation is committed, but the latest production build has not been verified yet.
- **Partial** — useful behavior exists, but the roadmap requirement is not complete.
- **Not started** — no meaningful implementation exists yet.

## Executive status

| Stage | Status | Summary |
| --- | --- | --- |
| Stage 1 — Meeting Pipeline Foundation | **Complete** | Pipeline/status model, follow-up risk, actions and empty states are implemented. |
| Stage 2 — Assisted Meeting Creation | **Complete / local heuristic** | Intent-first creation and four production templates are implemented; generation is deterministic frontend logic rather than a real AI endpoint. |
| Stage 3 — Persistent Meeting Briefs | **Complete** | Meeting brief data is persisted, guest questions are shown during booking, guest answers are stored, and host notes/context are available on the dashboard. |
| Stage 4 — Follow-Up Workflow | **Complete for manual follow-up** | Follow-up timestamps/counts/next-action dates are persisted, stale invites are surfaced from reminder state, contextual nudge copy is generated, and hosts can record completed follow-ups. Connected-mailbox sending remains Stage 6. |
| Stage 5 — Pre-Call Brief & Outcome Tracking | **Complete in source** | A dedicated Prepare & Outcomes workspace builds pre-call briefs from durable meeting context, persists call outcomes/next steps, and filters booked meetings by next action. |
| Stage 6 — AI & Integrations | **Partial infrastructure** | Google/Outlook calendar connectivity, conflict-aware availability and SendGrid notifications exist. Real AI, connected mailbox sending, ranking/explanations, analytics, billing readiness and observability remain. |

---

## Stage 1 — Meeting Pipeline Foundation

**Goal:** Make CallSync feel like a workspace for managing meeting opportunities.

- **Complete:** dashboard is a meeting pipeline rather than an event list.
- **Complete:** meetings are grouped into needs follow-up, link sent, booked and closed.
- **Complete:** pending invites carry visible follow-up risk.
- **Complete:** open/copy/cancel actions and useful empty states are present.

**Acceptance:** a host can see what needs attention without opening every meeting.

---

## Stage 2 — Assisted Meeting Creation

**Goal:** Reduce manual setup and make every link feel purpose-built.

- **Complete / heuristic:** intent-first meeting assistant exists.
- **Complete:** founder sales, investor intro, recruiting screen and client onboarding templates exist.
- **Complete / heuristic:** duration, buffers, work windows, guest questions and invite copy are generated locally.
- **Complete:** generated meeting brief stays visible during setup.

**Important limitation:** the assistant is deterministic frontend logic, not an AI-backed generation endpoint. Real AI remains Stage 6.

---

## Stage 3 — Persistent Meeting Briefs

**Goal:** Store context so the meeting remains useful after the link is created.

- **Complete:** `002_persistent_meeting_briefs.sql` persists meeting type, goal, invite message, qualification questions, guest answers and internal notes.
- **Complete:** guest answers are stored atomically during booking.
- **Complete:** host dashboard shows the meeting brief, answers and private notes.
- **Complete:** public booking page renders stored qualification questions.
- **Complete:** request emails include stored meeting context.
- **Complete:** ordered idempotent migrations run in Vercel serverless when enabled.

**Acceptance:** booked meetings carry durable context for preparation.

---

## Stage 4 — Follow-Up Workflow

**Goal:** Help users recover meetings that would otherwise disappear.

| Roadmap task | Status | Current implementation |
| --- | --- | --- |
| Add follow-up status and timestamps | **Complete** | `003_follow_up_workflow.sql` adds `last_followed_up_at`, `follow_up_count`, and `next_follow_up_at`. |
| Generate copyable follow-up messages | **Complete** | The dashboard generates a contextual nudge from the guest, meeting type and booking URL, with different copy for repeat touches. |
| Add "mark followed up" action | **Complete** | `PATCH /api/meetings/:id/follow-up` records the timestamp, increments the count, and schedules the next check. |
| Add reminder rules for stale pending invites | **Complete** | Initial pending requests are due after two days; after a recorded follow-up, the next check is scheduled three days later. Risk is based on the persisted next-action date. |
| Later: send follow-ups through connected Gmail/Outlook | **Deferred to Stage 6** | Stage 4 intentionally keeps sending manual while making the copy/action/state persistent. |

### Stage 4 implementation

- `Backend/migrations/003_follow_up_workflow.sql`
- `Backend/src/routes/followUpRoutes.js`
- `frontend/src/followUpWorkflow.js`
- `frontend/src/Stage4Product.js`
- `frontend/src/Stage4FollowUp.css`
- `/dashboard` uses the Stage 4 pipeline and public booking remains compatible.

### Acceptance check

- **Pending invites do not silently sit in the system:** yes.
- **Host knows exactly who needs a nudge and what to say:** yes.
- **Follow-up activity survives refresh/redeploy:** yes; it is persisted in PostgreSQL.

**Stage 4 result: Complete for the manual follow-up workflow.**

---

## Stage 5 — Pre-Call Brief & Outcome Tracking

**Goal:** Make CallSync valuable before and after the meeting.

| Roadmap task | Status | Current implementation |
| --- | --- | --- |
| Add pre-call brief view for upcoming booked meetings | **Complete in source** | `/prepare` is a dedicated Prepare & Outcomes workspace for booked calls. |
| Include guest answers, meeting goal, suggested agenda and opening prompt | **Complete in source** | `buildPreCallBrief()` turns the stored goal and guest answers into a focused agenda and opening prompt; raw guest answers and private host notes remain visible. |
| Add post-call outcome fields: happened, useful, next step, follow-up date | **Complete in source** | `004_pre_call_outcomes.sql` persists happened/useful, next step, follow-up date, outcome notes and recorded timestamp. |
| Add dashboard filters for next actions | **Complete in source** | The workspace filters booked calls into Prepare, Outcome due, Next action due, Scheduled next steps and Captured. |

### Stage 5 implementation

- New migration: `Backend/migrations/004_pre_call_outcomes.sql`.
- New authenticated read API: `GET /api/meetings/outcome-state`.
- New authenticated write API: `PATCH /api/meetings/:id/outcome`.
- New preparation/next-action model: `frontend/src/stage5Workflow.js`.
- New workspace: `frontend/src/Stage5Prep.js` at `/prepare`.
- New visual layer: `frontend/src/Stage5Prep.css`.
- Dashboard includes a **Prepare & outcomes** entry point without replacing the Stage 4 pipeline.
- Pre-call agenda is deterministic and grounded in persisted meeting context; it is intentionally not marketed as AI before Stage 6.
- Post-call outcome captures whether the meeting happened, whether it was useful, what happens next, when to follow up, and durable notes.
- Next-action prioritization surfaces overdue follow-ups first, then missing outcomes, then upcoming preparation.
- `frontend/src/stage5Workflow.test.js` covers preparation, outcome-due, next-action and filtering behavior.

### Acceptance check

- **Hosts enter calls prepared:** yes in source. Booked calls get a focused goal, agenda, opening prompt and guest context view.
- **Meetings produce trackable outcomes:** yes in source. Outcome and next-step state are persisted rather than disappearing into the calendar.
- **Next actions are visible:** yes in source through dedicated filters and urgency ordering.

**Stage 5 result: Complete in source.**

### Deployment verification note

The latest Stage 5 Git commits are currently blocked from new Vercel builds by the account's Vercel **build-rate limit**. The last observed Stage 4 frontend/backend production builds remain healthy; GitHub's Vercel checks for the latest Stage 5 commit fail specifically with the Vercel build-rate-limit target, rather than a compiler or runtime error. Stage 5 should therefore remain marked **Complete in source** until a fresh production build runs successfully.

---

## Stage 6 — AI & Integrations

**Goal:** Connect the workflow to real communication and calendar systems.

### Existing infrastructure

- Google Calendar OAuth/token storage.
- Outlook Calendar OAuth/token storage.
- Conflict-aware Google + Outlook availability.
- Duration, interval, timezone and buffer-aware slot generation.
- Calendar event creation/deletion.
- SendGrid request and confirmation notifications.
- Durable meeting briefs and guest context.
- Persistent follow-up workflow.
- Pre-call preparation and outcome model in source.

### Still required

1. Real AI generation endpoint for meeting brief, follow-up and pre-call generation.
2. Gmail/Outlook sending for invites and follow-ups.
3. Smarter slot ranking and conflict explanations.
4. Booking/follow-up/outcome analytics.
5. Observability and alerting.
6. Security review/token-storage hardening.
7. Billing readiness after the paid product boundary is defined.

---

# Recommended build order from here

## Priority 1 — Stage 6A: intelligence without changing the product shape

1. Add a server-side AI generation boundary with deterministic fallback.
2. Upgrade meeting brief generation first.
3. Reuse the same boundary for follow-up copy and pre-call suggestions.
4. Keep every AI result editable and grounded in persisted meeting context.

## Priority 2 — Stage 6B: communication

1. Add Gmail send scopes and mailbox sending.
2. Add Outlook Mail send scopes and mailbox sending.
3. Keep SendGrid for transactional system notifications only.
4. Record actual outbound follow-up timestamps against the Stage 4 model.

## Priority 3 — Stage 6C: intelligence, measurement and maturity

1. Smarter slot ranking and conflict explanations.
2. Booking/follow-up/outcome analytics.
3. Observability and alerting.
4. Security/token-storage hardening.
5. Billing readiness after paid boundaries are clear.

# What we should not build next

To keep CallSync aligned with its product promise, avoid spending the next iteration on:

- more landing-page sections,
- generic AI chat,
- extra calendar providers,
- team/admin complexity,
- broad CRM features.

The next milestone is **Stage 6A: add real intelligence behind the existing meeting workflow, without turning CallSync into a chatbot**.
