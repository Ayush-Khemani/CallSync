# CallSync Roadmap Audit — 2026-08-18

This audit compares `docs/PRODUCT_ROADMAP.md` against the code currently implemented in CallSync.

Status legend:

- **Complete** — the roadmap task is implemented in the current product flow.
- **Partial** — part of the user-visible behavior exists, but the roadmap requirement is not complete or persistent.
- **Not started** — no meaningful implementation exists yet.

## Executive status

| Stage | Status | Summary |
| --- | --- | --- |
| Stage 1 — Meeting Pipeline Foundation | **Complete** | Pipeline/status model, follow-up risk, actions and empty states are implemented. |
| Stage 2 — Assisted Meeting Creation | **Complete / local heuristic** | Intent-first creation and four production templates are implemented, but the assistant is deterministic frontend logic rather than a real AI endpoint. |
| Stage 3 — Persistent Meeting Briefs | **Not started** | Brief data is generated in the frontend but is not stored in the database or returned with meetings. Guest answers are not collected. |
| Stage 4 — Follow-Up Workflow | **Partial** | Stale pending invites are surfaced through computed risk, but follow-up state, timestamps, messages, reminders and mark-followed-up actions are missing. |
| Stage 5 — Pre-Call Brief & Outcome Tracking | **Not started** | No persistent pre-call brief or post-call outcome model exists. |
| Stage 6 — AI & Integrations | **Partial infrastructure** | Google/Outlook calendar connectivity, conflict-aware availability and SendGrid notifications exist. Real AI, connected mailbox sending, ranking/explanations, analytics, billing readiness and observability remain. |

---

## Stage 1 — Meeting Pipeline Foundation

**Goal:** Make CallSync feel like a workspace for managing meeting opportunities.

| Roadmap task | Status | Current implementation |
| --- | --- | --- |
| Rename the dashboard concept from simple meetings to a meeting pipeline | **Complete** | Dashboard navigation uses **Pipeline**, and the main panel is explicitly a **Meeting pipeline**. |
| Group meetings by status: needs follow-up, link sent, booked, closed | **Complete** | `getMeetingPipelineStages()` produces `followUp`, `pending`, `confirmed`, and `cancelled` groups. |
| Surface follow-up risk for pending invites | **Complete for current stage** | `getFollowUpRisk()` derives low/medium/high risk from pending status and age. |
| Keep copy/open/cancel actions visible | **Complete** | Meeting cards and detailed meeting rows expose booking-page, copy-link and cancel actions. |
| Add useful empty states that explain what happens next | **Complete** | Pipeline-stage and all-pipeline empty states explain the next expected action. |

### Acceptance check

- **Host can identify invites needing attention:** yes.
- **App feels like progress tracking rather than a calendar-event list:** yes.

**Stage 1 result: Complete.**

---

## Stage 2 — Assisted Meeting Creation

**Goal:** Reduce manual setup and make every link feel purpose-built.

| Roadmap task | Status | Current implementation |
| --- | --- | --- |
| Add an assistant prompt for creating a meeting request from natural language | **Complete / heuristic** | The Create flow includes a meeting-assistant prompt and parses intent, guest, date, duration and work window. |
| Add production templates for founder sales, investor intros, recruiting screens and client onboarding | **Complete** | All four templates exist in `MEETING_TEMPLATES`. |
| Generate duration, buffer, working hours, questions and invite copy from chosen intent | **Complete / heuristic** | `buildMeetingDraftFromPrompt()` creates those values locally in the frontend. |
| Keep generated meeting brief visible while host selects slots | **Complete** | The generated brief remains visible beside the creation controls. |

### Acceptance check

- **Host can start from intent instead of a blank form:** yes.
- **Setup communicates why the call exists, not only when:** yes.

### Important limitation

The assistant is **not AI-backed yet**. It is a deterministic keyword/template system in the frontend. That is acceptable for Stage 2, but Stage 6 still requires replacing or augmenting this with a real generation endpoint.

**Stage 2 result: Functionally complete.**

---

## Stage 3 — Persistent Meeting Briefs

**Goal:** Store context so the meeting remains useful after the link is created.

| Roadmap task | Status | Current implementation |
| --- | --- | --- |
| Add meeting fields for type, goal, invite message, qualification questions and internal notes | **Not started** | The current `meetings` table only stores user, attendee, unique link, selected slot, status and timestamps. |
| Store guest answers during booking | **Not started** | Public booking currently sends only the chosen slot ID. |
| Show meeting brief on the host dashboard | **Not started** | Brief exists only in Create state and disappears after creation. |
| Show guest-facing questions on the public booking page | **Not started** | Public booking only displays approved slots/status. |

### Acceptance check

- **Every booked meeting has enough context for host preparation:** no.
- **Booking page collects qualification data:** no.

**Stage 3 result: Not started and should be the next product-development milestone.**

### Recommended Stage 3 data model

Add a migration rather than overloading the existing frontend state.

Suggested `meetings` fields:

- `meeting_type TEXT`
- `goal TEXT`
- `invite_message TEXT`
- `qualification_questions JSONB NOT NULL DEFAULT '[]'`
- `guest_answers JSONB NOT NULL DEFAULT '{}'`
- `internal_notes TEXT`
- `updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`

For the current lightweight product, JSONB is sufficient for questions/answers and avoids premature table complexity. A separate normalized answer table can be introduced later if analytics require question-level querying.

### Recommended Stage 3 API work

1. Extend `POST /api/meetings/create` to accept and persist the meeting brief.
2. Return brief fields from authenticated meeting-list/detail endpoints.
3. Return guest-facing questions from `GET /api/meetings/:uniqueLink`.
4. Extend slot selection/booking to accept answers and persist them atomically with confirmation.
5. Update the host pipeline/detail view to show goal, questions/answers and internal notes.
6. Update the public booking page to collect answers before confirmation.

---

## Stage 4 — Follow-Up Workflow

**Goal:** Help users recover meetings that would otherwise disappear.

| Roadmap task | Status | Current implementation |
| --- | --- | --- |
| Add follow-up status and timestamps | **Not started** | Follow-up need is computed from `created_at`; no persistent follow-up state/timestamp exists. |
| Generate copyable follow-up messages | **Not started** | Risk detail gives advice but there is no reusable follow-up message. |
| Add "mark followed up" action | **Not started** | No endpoint/action exists. |
| Add reminder rules for stale pending invites | **Partial** | UI risk thresholds surface stale invites, but there is no reminder record, schedule or notification workflow. |
| Later: send follow-ups through connected Gmail/Outlook | **Not started** | Current outbound mail is SendGrid for meeting request/confirmation, not the user's connected mailbox. |

### Acceptance check

- **Pending invites do not silently sit in the system:** partially; they surface in the UI when the host opens CallSync.
- **Host knows exactly who needs a nudge and what to say:** who needs attention is implemented; reusable message/action is not.

**Stage 4 result: Partial. Implement after Stage 3.**

### Recommended Stage 4 fields

- `last_followed_up_at TIMESTAMP`
- `follow_up_count INT NOT NULL DEFAULT 0`
- `next_follow_up_at TIMESTAMP`
- optionally `follow_up_state VARCHAR(...)`

The existing computed risk can remain as a presentation layer, but it should incorporate the last follow-up timestamp rather than only meeting creation time.

---

## Stage 5 — Pre-Call Brief & Outcome Tracking

**Goal:** Make CallSync valuable before and after the meeting.

| Roadmap task | Status | Current implementation |
| --- | --- | --- |
| Add pre-call brief view for upcoming booked meetings | **Not started** | Booked meetings are visible, but no preparation view exists. |
| Include guest answers, meeting goal, suggested agenda and opening prompt | **Not started** | Required persistent inputs do not yet exist. |
| Add post-call outcome fields: happened, useful, next step, follow-up date | **Not started** | No outcome model exists. |
| Add dashboard filters for next actions | **Not started** | Current grouping is lifecycle-status based rather than post-call next-action based. |

### Acceptance check

- **Hosts enter calls prepared:** not yet supported persistently.
- **Meetings produce trackable outcomes:** not yet supported.

**Stage 5 result: Not started.**

### Dependency note

Stage 5 should **not** be built before Stage 3. Guest answers and meeting goals need to be durable before a useful pre-call brief can exist.

---

## Stage 6 — AI & Integrations

**Goal:** Connect the workflow to real communication and calendar systems.

| Roadmap task | Status | Current implementation |
| --- | --- | --- |
| Add real AI generation endpoint for meeting brief creation | **Not started** | Current assistant is frontend keyword/template logic; no OpenAI/LLM endpoint exists. |
| Connect Gmail/Outlook sending for invites and follow-ups | **Not started** | Google/Outlook **calendar** OAuth exists. Email notifications currently use SendGrid. |
| Add calendar conflict explanations and smarter slot ranking | **Partial** | Google + Outlook events are fetched and conflicting/buffered slots are excluded. There is no explanation layer or ranking model. |
| Add analytics: booking rate, follow-up rate, meeting outcome rate | **Not started** | No analytics implementation was found. |
| Add observability, billing readiness and security review | **Not started as a roadmap milestone** | Basic auth/error handling/tests exist, but no evidence of the requested production observability/billing/security-review layer was found. |

### Existing useful infrastructure

- Google Calendar OAuth/token storage.
- Outlook Calendar OAuth/token storage.
- Combined Google + Outlook busy-event availability calculation.
- Duration, interval, timezone and buffer-aware slot generation.
- Calendar event creation/deletion around tentative slots.
- SendGrid meeting request and confirmation notifications.

These are strong Stage 6 prerequisites, but they do not complete Stage 6.

---

# Recommended build order from here

## Priority 1 — Stage 3: persist the meeting brief end-to-end

This is the highest-leverage missing layer. The product currently promises preparation/context, but that context disappears after creation. Fixing Stage 3 makes the existing assistant and landing-page positioning materially real.

Build order:

1. Database migration for brief/answers/notes.
2. Create-meeting API persists brief.
3. Authenticated meeting APIs return brief.
4. Public booking API returns questions.
5. Booking confirmation persists guest answers.
6. Dashboard meeting detail/prep card displays brief + answers.
7. Internal notes editing.

## Priority 2 — Stage 4: persistent follow-up workflow

Once meetings have durable context:

1. Follow-up timestamps/state.
2. Copyable follow-up message generated from meeting context.
3. Mark-followed-up action.
4. Recalculate next attention time from last follow-up.
5. Reminder job/notification rules.
6. Only later: Gmail/Outlook mailbox sending.

## Priority 3 — Stage 5: preparation + outcomes

1. Upcoming-booked/pre-call view.
2. Suggested agenda/opening prompt using stored context.
3. Outcome capture after the meeting.
4. Next-step/follow-up-date pipeline.
5. Next-action dashboard filtering.

## Priority 4 — Stage 6: intelligence and production maturity

1. Real AI brief/follow-up/pre-call generation endpoint.
2. Smarter slot ranking + explanations.
3. Gmail/Outlook email sending.
4. Funnel/outcome analytics.
5. Observability and alerting.
6. Security review/token-storage hardening.
7. Billing readiness only after the paid product boundary is defined.

---

# What we should *not* build next

To keep CallSync aligned with its own roadmap, avoid spending the next iteration on:

- more landing-page sections,
- generic AI chat,
- extra calendar providers,
- team/admin complexity,
- paid-plan plumbing,
- broad CRM features.

The next product milestone should be **Stage 3: persistent meeting briefs and guest qualification answers**.

That closes the largest gap between the current product and the promise: **booked, prepared, and followed-up meetings**.
