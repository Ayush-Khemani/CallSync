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
| Stage 4 — Follow-Up Workflow | **Partial** | Stale pending invites are surfaced through computed risk, but persistent follow-up state, timestamps, messages, reminders and mark-followed-up actions are missing. |
| Stage 5 — Pre-Call Brief & Outcome Tracking | **Not started** | Persistent meeting context now exists, but there is no dedicated pre-call view or post-call outcome model yet. |
| Stage 6 — AI & Integrations | **Partial infrastructure** | Google/Outlook calendar connectivity, conflict-aware availability and SendGrid notifications exist. Real AI, connected mailbox sending, ranking/explanations, analytics, billing readiness and observability remain. |

---

## Stage 1 — Meeting Pipeline Foundation

**Goal:** Make CallSync feel like a workspace for managing meeting opportunities.

| Roadmap task | Status | Current implementation |
| --- | --- | --- |
| Rename the dashboard concept from simple meetings to a meeting pipeline | **Complete** | Dashboard navigation uses **Pipeline**, and the main panel is explicitly a **Meeting pipeline**. |
| Group meetings by status: needs follow-up, link sent, booked, closed | **Complete** | `getMeetingPipelineStages()` produces follow-up, pending, confirmed/booked and cancelled/closed groups. |
| Surface follow-up risk for pending invites | **Complete for current stage** | `getFollowUpRisk()` derives low/medium/high risk from pending status and age. |
| Keep copy/open/cancel actions visible | **Complete** | Pipeline/detail views expose booking-page, copy-link and cancel actions. |
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

The assistant is **not AI-backed yet**. It remains a deterministic keyword/template system in the frontend. Stage 6 still requires a real generation endpoint.

**Stage 2 result: Functionally complete.**

---

## Stage 3 — Persistent Meeting Briefs

**Goal:** Store context so the meeting remains useful after the link is created.

| Roadmap task | Status | Current implementation |
| --- | --- | --- |
| Add meeting fields for type, goal, invite message, qualification questions and internal notes | **Complete** | Migration `002_persistent_meeting_briefs.sql` adds `meeting_type`, `meeting_goal`, `invite_message`, `qualification_questions`, `guest_answers`, and `internal_notes`. |
| Store guest answers during booking | **Complete** | Slot confirmation accepts qualification answers and persists them atomically with the booked slot. |
| Show meeting brief on the host dashboard | **Complete** | Detailed meeting views show type, goal, invite message, guest answers and private host notes. |
| Show guest-facing questions on the public booking page | **Complete** | The public booking flow renders the stored qualification questions and requires answers before confirmation when questions exist. |

### Additional Stage 3 implementation

- `POST /api/meetings/create` persists the generated brief with the meeting.
- `GET /api/meetings` returns the brief, answers and internal notes to the authenticated host.
- `GET /api/meetings/:uniqueLink` exposes only guest-safe brief fields and qualification questions.
- `PATCH /api/meetings/:id/notes` saves host-only private notes.
- Request emails include the stored meeting type/invite copy.
- Existing meetings remain backward-compatible and render without qualification context.
- Vercel serverless now runs ordered idempotent SQL migrations on first request when `AUTO_RUN_MIGRATIONS` is enabled.

### Acceptance check

- **Every newly booked meeting can carry enough context for host preparation:** yes.
- **Booking page collects useful qualification data:** yes.

**Stage 3 result: Complete.**

---

## Stage 4 — Follow-Up Workflow

**Goal:** Help users recover meetings that would otherwise disappear.

| Roadmap task | Status | Current implementation |
| --- | --- | --- |
| Add follow-up status and timestamps | **Not started** | Follow-up need is computed from `created_at`; no persistent follow-up state/timestamp exists. |
| Generate copyable follow-up messages | **Not started** | Risk detail gives advice but there is no reusable contextual follow-up message. |
| Add "mark followed up" action | **Not started** | No endpoint/action exists. |
| Add reminder rules for stale pending invites | **Partial** | UI risk thresholds surface stale invites, but there is no reminder record, schedule or notification workflow. |
| Later: send follow-ups through connected Gmail/Outlook | **Not started** | Current outbound mail is SendGrid for meeting request/confirmation, not the user's connected mailbox. |

### Acceptance check

- **Pending invites do not silently sit in the system:** partially; they surface when the host opens CallSync.
- **Host knows exactly who needs a nudge and what to say:** the first half exists; reusable follow-up copy/action does not.

**Stage 4 result: Partial and now the next product milestone.**

### Recommended Stage 4 model

- `last_followed_up_at TIMESTAMP`
- `follow_up_count INT NOT NULL DEFAULT 0`
- `next_follow_up_at TIMESTAMP`
- optional explicit follow-up state if needed by UI/automation

The existing risk calculation should then use the most recent follow-up timestamp rather than only meeting creation time.

---

## Stage 5 — Pre-Call Brief & Outcome Tracking

**Goal:** Make CallSync valuable before and after the meeting.

| Roadmap task | Status | Current implementation |
| --- | --- | --- |
| Add pre-call brief view for upcoming booked meetings | **Not started** | Booked meetings now carry durable context, but there is no dedicated preparation view. |
| Include guest answers, meeting goal, suggested agenda and opening prompt | **Partial prerequisite complete** | Guest answers and meeting goal now exist; suggested agenda/opening prompt are not generated. |
| Add post-call outcome fields: happened, useful, next step, follow-up date | **Not started** | No outcome model exists. |
| Add dashboard filters for next actions | **Not started** | Current grouping is lifecycle-status based rather than post-call next-action based. |

### Acceptance check

- **Hosts enter calls prepared:** context is available, but there is no dedicated prep experience yet.
- **Meetings produce trackable outcomes:** not yet supported.

**Stage 5 result: Not started as a milestone, with Stage 3 prerequisites now available.**

---

## Stage 6 — AI & Integrations

**Goal:** Connect the workflow to real communication and calendar systems.

| Roadmap task | Status | Current implementation |
| --- | --- | --- |
| Add real AI generation endpoint for meeting brief creation | **Not started** | Current assistant is frontend keyword/template logic; no LLM endpoint exists. |
| Connect Gmail/Outlook sending for invites and follow-ups | **Not started** | Google/Outlook **calendar** OAuth exists. Email notifications currently use SendGrid. |
| Add calendar conflict explanations and smarter slot ranking | **Partial** | Google + Outlook events are fetched and conflicting/buffered slots are excluded. There is no explanation layer or ranking model. |
| Add analytics: booking rate, follow-up rate, meeting outcome rate | **Not started** | No analytics implementation exists. |
| Add observability, billing readiness and security review | **Not started as a roadmap milestone** | Basic auth/error handling/tests exist, but the requested production maturity layer is not complete. |

### Existing useful infrastructure

- Google Calendar OAuth/token storage.
- Outlook Calendar OAuth/token storage.
- Combined Google + Outlook busy-event availability calculation.
- Duration, interval, timezone and buffer-aware slot generation.
- Calendar event creation/deletion around tentative slots.
- SendGrid meeting request and confirmation notifications.
- Durable meeting context from Stage 3.

**Stage 6 result: Partial infrastructure.**

---

# Recommended build order from here

## Priority 1 — Stage 4: persistent follow-up workflow

1. Add persistent follow-up timestamps/count/next-action time.
2. Generate a copyable follow-up message from the stored meeting context.
3. Add **Mark followed up**.
4. Recalculate follow-up risk from the last follow-up rather than only creation time.
5. Add reminder rules/notifications for stale requests.
6. Later, move sending into connected Gmail/Outlook mailboxes.

## Priority 2 — Stage 5: preparation + outcomes

1. Add upcoming-booked/pre-call view using stored guest answers and meeting goal.
2. Add suggested agenda/opening prompt.
3. Add outcome capture after the meeting.
4. Add next-step and follow-up-date fields.
5. Add next-action dashboard filtering.

## Priority 3 — Stage 6: intelligence and production maturity

1. Real AI brief/follow-up/pre-call generation endpoint.
2. Smarter slot ranking + explanations.
3. Gmail/Outlook email sending.
4. Funnel/outcome analytics.
5. Observability and alerting.
6. Security review/token-storage hardening.
7. Billing readiness after the paid product boundary is defined.

---

# What we should *not* build next

To keep CallSync aligned with its roadmap, avoid spending the next iteration on:

- more landing-page sections,
- generic AI chat,
- extra calendar providers,
- team/admin complexity,
- paid-plan plumbing,
- broad CRM features.

The next milestone is **Stage 4: make follow-up a persistent workflow rather than a visual risk signal**.
