# CallSync Roadmap Audit — 2026-08-18

This audit compares `docs/PRODUCT_ROADMAP.md` against the current CallSync codebase.

Status legend:

- **Complete** — the roadmap task is implemented in the current product flow.
- **Partial** — useful behavior exists, but the roadmap requirement is not complete.
- **Not started** — no meaningful implementation exists yet.

## Executive status

| Stage | Status | Summary |
| --- | --- | --- |
| Stage 1 — Meeting Pipeline Foundation | **Complete** | Pipeline/status model, follow-up risk, actions and empty states are implemented. |
| Stage 2 — Assisted Meeting Creation | **Complete / local heuristic** | Intent-first creation and four production templates are implemented; generation is deterministic frontend logic rather than a real AI endpoint. |
| Stage 3 — Persistent Meeting Briefs | **Complete** | Meeting brief data is persisted, guest questions are shown during booking, guest answers are stored, and host notes/context are available on the dashboard. |
| Stage 4 — Follow-Up Workflow | **Complete for manual follow-up** | Follow-up timestamps/counts/next-action dates are persisted, stale invites are surfaced from reminder state, contextual nudge copy is generated, and hosts can record completed follow-ups. Connected-mailbox sending remains Stage 6. |
| Stage 5 — Pre-Call Brief & Outcome Tracking | **Not started** | Persistent meeting context exists, but there is no dedicated pre-call view or post-call outcome model yet. |
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
| Generate copyable follow-up messages | **Complete** | The dashboard generates a concise contextual nudge from the guest, meeting type and booking URL, with different copy for repeat touches. |
| Add "mark followed up" action | **Complete** | `PATCH /api/meetings/:id/follow-up` records the timestamp, increments the count, and schedules the next check. |
| Add reminder rules for stale pending invites | **Complete** | Initial pending requests are due after two days; after a recorded follow-up, the next check is scheduled three days later. Risk is based on the persisted next-action date. |
| Later: send follow-ups through connected Gmail/Outlook | **Deferred to Stage 6** | Stage 4 intentionally keeps sending manual while making the copy/action/state persistent. |

### Stage 4 implementation

- New migration: `Backend/migrations/003_follow_up_workflow.sql`.
- New authenticated API: `GET /api/meetings/follow-up-state`.
- New authenticated action: `PATCH /api/meetings/:id/follow-up`.
- New frontend follow-up model: `frontend/src/followUpWorkflow.js`.
- New dashboard product surface: `frontend/src/Stage4Product.js`.
- New follow-up UI styling: `frontend/src/Stage4FollowUp.css`.
- `/dashboard` and public booking routes now pass through the Stage 4 product surface.
- Follow-up risk resets after outreach and surfaces again when the persisted next-action time becomes due.
- Compact pipeline cards can copy a nudge; expanded meeting detail shows suggested copy, last outreach, next check and a **Mark followed up** action.

### Acceptance check

- **Pending invites do not silently sit in the system:** yes. They are assigned a follow-up due date and move into the needs-follow-up stage when due.
- **Host knows exactly who needs a nudge and what to say:** yes. The pipeline identifies due requests and supplies copyable follow-up text.
- **Follow-up activity survives refresh/redeploy:** yes. Timestamp, count and next follow-up time are stored in PostgreSQL.

**Stage 4 result: Complete for the manual follow-up workflow.**

Connected Gmail/Outlook sending remains deliberately out of scope until Stage 6 so Stage 4 does not duplicate the integration milestone.

---

## Stage 5 — Pre-Call Brief & Outcome Tracking

**Goal:** Make CallSync valuable before and after the meeting.

| Roadmap task | Status | Current implementation |
| --- | --- | --- |
| Add pre-call brief view for upcoming booked meetings | **Not started** | Booked meetings carry durable context, but there is no dedicated preparation view. |
| Include guest answers, meeting goal, suggested agenda and opening prompt | **Partial prerequisite complete** | Guest answers and meeting goal exist; suggested agenda/opening prompt do not. |
| Add post-call outcome fields: happened, useful, next step, follow-up date | **Not started** | No outcome model exists. |
| Add dashboard filters for next actions | **Not started** | Current grouping is lifecycle-status based. |

**Stage 5 is now the next product milestone.**

Recommended order:

1. Add a dedicated upcoming-booked/pre-call view using stored guest answers and meeting goal.
2. Add suggested agenda and opening prompt.
3. Persist post-call outcome, usefulness, next step and follow-up date.
4. Add next-action dashboard filtering.

---

## Stage 6 — AI & Integrations

**Goal:** Connect the workflow to real communication and calendar systems.

Current useful infrastructure:

- Google Calendar OAuth/token storage.
- Outlook Calendar OAuth/token storage.
- Conflict-aware Google + Outlook availability.
- Duration, interval, timezone and buffer-aware slot generation.
- Calendar event creation/deletion.
- SendGrid request and confirmation notifications.
- Durable meeting briefs and guest context.
- Persistent follow-up workflow from Stage 4.

Still required:

1. Real AI generation endpoint for meeting brief, follow-up and pre-call generation.
2. Gmail/Outlook sending for invites and follow-ups.
3. Smarter slot ranking and explanations.
4. Booking/follow-up/outcome analytics.
5. Observability and alerting.
6. Security review/token-storage hardening.
7. Billing readiness after the paid product boundary is defined.

---

# Recommended build order from here

## Priority 1 — Stage 5: preparation + outcomes

Build the pre-call experience first, then outcome capture and next-action tracking.

## Priority 2 — Stage 6: intelligence + communication

Add real AI generation, connected mailbox sending, smarter ranking, analytics and production maturity.

# What we should not build next

To keep CallSync aligned with its product promise, avoid spending the next iteration on:

- more landing-page sections,
- generic AI chat,
- extra calendar providers,
- team/admin complexity,
- paid-plan plumbing,
- broad CRM features.

The next milestone is **Stage 5: turn booked meetings into prepared calls with trackable outcomes**.
