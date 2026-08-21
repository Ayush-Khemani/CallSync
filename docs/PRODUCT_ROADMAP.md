# CallSync Product Roadmap

_Last updated: 2026-08-22_

This document is the product source of truth for CallSync. Implementation/release status should be cross-checked against `docs/ROADMAP_STATUS_2026-08-22.md`. Real-provider release gates are tracked separately in issues #14 and #23; **merged/deployed source does not by itself mean external-provider activation has been verified.**

---

## 1. Product Thesis

CallSync started from a real scheduling problem: synchronize Google Calendar and Outlook Calendar, expose the host's real availability, share a booking link, and create the final meeting on both participants' calendars.

That capability remains foundational, but it is no longer enough to define the product.

Scheduling itself is becoming a commodity. Calendar products, scheduling tools, and AI assistants can increasingly find time, suggest slots, and create events. CallSync should therefore not compete by becoming another generic scheduling form or another Calendly clone.

The product should own the larger workflow around an important meeting:

> Turn an interested conversation into a booked, prepared, completed, remembered, and followed-up meeting.

CallSync should become a lightweight meeting operating system / meeting CRM for high-value calls.

The value is not only **when the meeting happens**. The value is making sure the meeting actually moves from intent to outcome.

### The CallSync lifecycle

**Create → Offer → Track → Confirm → Prepare → Meet → Capture → Follow up → Next step**

Every stage should preserve context instead of forcing the user to reconstruct it from email, calendar entries, notes apps, or memory.

---

## 2. Product Problem

People do not need another way to create a calendar event.

Google Calendar, Outlook, Calendly, Cal.com, ChatGPT, Gemini, Copilot, and other tools already help with basic scheduling.

The harder problem is the messy gap between:

- "Yes, let's talk"
- a link actually being sent
- the other person booking
- both calendars being correct
- the host remembering why the meeting exists
- entering the call prepared
- capturing what happened
- following up at the right time
- remembering the relationship and next step later

That is the workflow CallSync should own.

---

## 3. Target Customer

Start with users who lose real value when meetings slip or context disappears:

- Solo founders managing investor, customer, advisor, partnership, and hiring calls
- Consultants and agencies managing discovery, onboarding, and client calls
- Sales operators managing an early pipeline before a heavyweight CRM is necessary
- Recruiters and hiring managers managing candidate screens and follow-ups

The early product should remain useful for an individual user before adding team/admin complexity.

---

## 4. Product Principles

1. **Meeting lifecycle over calendar utility**
   - Calendar synchronization is infrastructure.
   - The product is the workflow around the meeting.

2. **Reliability before intelligence**
   - A booking product is worthless if invitations, attendee emails, or calendar events fail.
   - End-to-end delivery must work before advanced roadmap items are considered production-ready.

3. **Host control over exposed availability**
   - CallSync can use connected calendars to understand conflicts without exposing private calendar contents.

4. **Fewer blank forms, more assisted setup**
   - Start from intent and context rather than forcing users to configure every field manually.

5. **Every invite has a status**
   - A meeting request should never disappear into a passive list.

6. **Every important meeting has context before and an outcome after**
   - The meeting should carry its purpose, guest context, notes, outcome, and next action.

7. **AI should perform specific workflow jobs**
   - Generate useful briefs, follow-ups, preparation, summaries, and next-step suggestions.
   - Do not turn the product into a generic chatbot.

8. **AI output must remain editable and grounded**
   - Generated content should be based on persisted meeting context and remain under user control.

9. **Keep the user inside the meeting workflow**
   - Long term, CallSync should contain the useful meeting memory itself instead of forcing the user to move every meeting into Notion or another notes product.

---

# PRIORITY 0 — Reliability Gate

**Status: Automated safeguards implemented; real Google/Outlook end-to-end verification remains open in issue #14.**

Before later roadmap stages are considered provider-verified, the core booking loop must be production-reliable with real accounts.

## Goal

A host should be able to create a meeting request, send it to another person, receive a booking, and trust that both sides receive the correct communication and calendar state.

## Required checks

- Google Calendar and Outlook Calendar remain synchronized for availability purposes.
- Conflict-aware availability returns only genuinely bookable slots.
- Public booking succeeds without stale or conflicting slots.
- Host receives the expected booking/request email.
- Guest receives the expected confirmation email.
- Calendar event is created correctly for the host.
- Calendar event / attendee state is created correctly for the guest side as intended by the integration.
- Event time, timezone, duration, title, description, and attendee email are correct.
- Cancellation or deletion behavior remains consistent with the stored meeting state.
- Failures are visible rather than silently swallowed.

## Acceptance

**Do not close the reliability gate from CI alone. Issue #14 closes only after the real end-to-end booking/email/calendar scenarios pass.**

This remains the highest-priority release requirement even though later source stages are now deployed.

---

# Stage 1 — Meeting Pipeline Foundation

**Status: Complete**

## Goal

Make CallSync feel like a workspace for managing meeting opportunities rather than a passive event list.

## Tasks

- Rename the dashboard concept from simple meetings to a meeting pipeline.
- Group meetings by status: needs follow-up, link sent, booked, closed.
- Surface follow-up risk for pending invites.
- Keep copy/open/cancel actions visible.
- Add useful empty states that explain what happens next.

## Acceptance

- A host can understand which meeting invites need attention without opening every row.
- The app feels like it tracks meeting progress, not only scheduled events.

---

# Stage 2 — Assisted Meeting Creation

**Status: Complete; deterministic templates remain available as fallback to Stage 6A intelligence.**

## Goal

Reduce manual setup and make every meeting link feel purpose-built.

## Tasks

- Add an assistant prompt for creating a meeting request from natural language.
- Add production templates for founder sales, investor intros, recruiting screens, and client onboarding.
- Generate duration, buffer, working hours, questions, and invite copy from the chosen intent.
- Keep the generated meeting brief visible while the host selects slots.

## Acceptance

- A host can start from intent instead of a blank form.
- Meeting setup communicates why the call exists, not only when it can happen.

## Current implementation

The original deterministic frontend logic remains as a reliable fallback. Real generation now sits behind the reusable Stage 6A server-side intelligence boundary.

---

# Stage 3 — Persistent Meeting Briefs

**Status: Complete**

## Goal

Store meeting context so it remains useful after the link is created.

## Tasks

- Add meeting fields for type, goal, invite message, qualification questions, and internal notes.
- Store guest answers during booking.
- Show the meeting brief on the host dashboard.
- Show guest-facing questions on the public booking page.
- Preserve the context through booking and later workflow stages.

## Acceptance

- Every booked meeting has enough context for the host to prepare.
- The booking page collects useful qualification data.
- Context survives refresh, redeploy, and later workflow actions.

---

# Stage 4 — Follow-Up Workflow

**Status: Complete; connected-mail sending source is deployed through Stage 6B, with real-provider verification still open.**

## Goal

Help users recover meetings that would otherwise disappear.

## Tasks

- Add follow-up status and timestamps.
- Generate contextual, copyable follow-up messages.
- Add a "mark followed up" action.
- Add reminder rules for stale pending invites.
- Persist follow-up count and next follow-up date.
- Send follow-ups through connected Gmail/Outlook where the user has granted the narrow send permission.

## Acceptance

- Pending invites do not silently sit in the system.
- The host knows exactly who needs a nudge and what to say.
- Follow-up activity remains durable.

## Product boundary

Stage 4 owns the follow-up workflow. Connected Gmail/Outlook delivery is implemented in Stage 6B and remains subject to the real-provider activation checks in issue #23.

---

# Stage 5 — Pre-Call Preparation & Outcome Tracking

**Status: Complete and deployed; real booked-meeting workflow verification remains part of issues #14/#23.**

## Goal

Make CallSync valuable before and after the meeting, not only during scheduling.

## Tasks

- Add a dedicated pre-call brief view for upcoming booked meetings.
- Include guest answers, meeting goal, suggested agenda, opening prompt, and host notes.
- Add post-call outcome fields:
  - did the meeting happen?
  - was it useful?
  - what is the next step?
  - when should the user follow up?
  - outcome notes
- Add next-action filters and urgency ordering.

## Acceptance

- Hosts enter calls prepared.
- Meetings produce trackable outcomes instead of disappearing into the calendar.
- Next steps remain visible after the call.

## Deployment note

Stage 5 is deployed on production. Its date-sensitive next-action logic is also covered by deterministic clock-injected tests so CI does not change simply because hard-coded fixture dates pass.

---

# Stage 6 — Real Intelligence & Communication

## Goal

Add real AI and communication capabilities behind the existing workflow without changing CallSync into a generic AI chat product.

---

## Stage 6A — Server-Side AI Generation Boundary

**Status: Source complete and deployed; production provider-backed generation verification remains open in issue #23.**

### Goal

Use one reusable server-side generation layer while keeping deterministic fallbacks.

### Tasks

1. Create one server-side AI generation boundary.
2. Keep deterministic fallback behavior when AI is unavailable or inappropriate.
3. Upgrade meeting brief generation first.
4. Reuse the same boundary for:
   - invite copy
   - qualification questions
   - follow-up messages
   - pre-call agenda suggestions
   - opening prompts
   - next-step suggestions
   - Stage 7 meeting memory
5. Ground generation in persisted meeting context.
6. Keep generated output editable.
7. Keep provider/model details out of the product experience.

### Acceptance

- AI makes an existing workflow step faster or better.
- The product still works when AI generation fails.
- Users are never forced into a chat interface to complete the meeting workflow.

### Remaining activation check

Verify real provider-backed generation with the production model configuration while confirming the deterministic fallback still handles provider/config/schema/timeout failure safely.

---

## Stage 6B — Connected Mailbox Sending

**Status: Source complete and deployed via PR #19; real Gmail/Outlook consent and delivery verification remains open in issue #23.**

### Goal

Move from copyable messages and transactional notifications to communication sent from the user's own mailbox where appropriate.

### Tasks

- Add Gmail `gmail.send` scope and connected sending without requesting inbox-read access for this workflow.
- Add Outlook delegated `Mail.Send` alongside calendar access.
- Send edited follow-ups through the connected mailbox.
- Keep SendGrid for transactional system notifications.
- Persist actual outbound timestamps/provider against the Stage 4 follow-up model.
- Surface sending failures clearly and do not advance follow-up state after failed sends.
- Preserve calendar-only token refresh behavior for existing Outlook connections until deliberate re-consent.

### Acceptance

- The host can complete the follow-up workflow without copying text into another application.
- Outbound communication is reflected in CallSync's meeting state only after successful delivery action.

### Remaining activation check

Use real Google and Microsoft accounts to re-consent, send, verify guest inbox/Sent Items, and verify revoked/missing send permission does not produce false success.

---

## Stage 6C — Smarter Coordination, Measurement & Maturity

**Status: Coordination, analytics, observability, and security source are complete and deployed via PRs #20/#21. Production data/provider checks and encryption-key rollout remain open in issue #23.**

### Tasks

- Smarter slot ranking. **Implemented.**
- Explain calendar conflicts without exposing private event content. **Implemented with time-geometry-only explanations and provider counts.**
- Booking-rate analytics. **Implemented.**
- Follow-up-rate analytics. **Implemented.**
- Meeting-outcome analytics. **Implemented.**
- Observability and alerting. **Request correlation and safer production diagnostics implemented; external alerting/vendor integration remains optional future maturity work.**
- Security review and token-storage hardening. **Implemented in code; production encryption-key migration must be deliberate.**
- Billing readiness only after the paid product boundary is clear. **Deferred intentionally.**

### Acceptance

- CallSync can explain and improve the meeting workflow, not only execute it.
- Operational failures can be detected and diagnosed.

### Production verification completed

- Frontend/backend Stage 6C deployments are READY.
- Backend responses include `x-request-id`.
- `/api/health/db` exposes only safe reachability + commit SHA rather than DB host/raw errors.
- New security/observability tests are actually executed by CI.
- Blocked CORS origins are covered as a clean 403 path.

### Remaining activation checks

- Exercise ranking and conflict counts with real Google-only and Outlook-only calendar conflicts.
- Compare lifecycle analytics with real production meeting records.
- Decide/configure and test the production `TOKEN_ENCRYPTION_KEY` migration before enforcing encrypted storage for existing connections.

---

# Stage 7 — In-Platform Meeting Memory

**Status: Source complete and deployed via PR #22; real production meeting-memory workflow verification remains open in issue #23.**

## Goal

Make the completed meeting itself part of CallSync's persistent workflow.

A meeting should not become an empty calendar event after it happens, and the user should not have to move every important call into Notion or another notes app just to remember what was discussed.

## Tasks

- Add a durable meeting notes area attached to the existing meeting record. **Implemented.**
- Allow the user to capture notes during or immediately after the call. **Implemented.**
- Add AI-assisted meeting summaries grounded in the meeting's actual captured content/context. **Implemented with deterministic fallback.**
- Extract editable:
  - key points
  - decisions
  - action items
  - owners where known
  - deadlines/follow-up dates where known
  - unanswered questions
- Connect captured notes to the Stage 5 outcome and next-step model. **Implemented in the continuous meeting record.**
- Preserve the meeting brief, guest answers, preparation, notes, outcome, and follow-up history as one continuous record. **Implemented.**
- Make previous meeting context available when the same relationship returns for another call. **Implemented; previous same-attendee saved memory is carried into future pre-call preparation.**

## Product rule

AI meeting notes remain a workflow feature, not a separate chatbot or generic document editor.

## Acceptance

- A user can open a completed meeting later and understand why it happened, what was discussed, what was decided, and what should happen next.
- Important meeting memory stays inside CallSync.

## Verification note

The shipped implementation includes `/memory`, authenticated persistence, grounded generation, editable structured memory, relationship history, and database-backed tests proving prior saved memory can affect the next same-attendee pre-call brief. Real production use still needs to be exercised with actual booked meetings before issue #23 closes.

---

# Long-Term Product Direction

CallSync should progressively become the operating layer around high-value meetings.

It should know:

- why the meeting exists
- who it is with
- what was sent
- whether they booked
- what context they provided
- how the host should prepare
- what happened
- what was decided
- what the next step is
- when someone needs to follow up

The calendar remains an important integration, but not the center of the product.

The durable meeting record is the center.

---

# What We Should Not Build Next

Until the core lifecycle is verified with real provider usage, avoid spending the next iteration on:

- more landing-page sections for their own sake
- generic AI chat
- becoming a Calendly clone
- extra calendar providers without a clear user need
- broad CRM features unrelated to meetings
- heavyweight team/admin complexity
- decorative AI features with no workflow responsibility
- billing before reliability and repeated product value are clear

The landing page and application should communicate the same product: **an end-to-end meeting workflow, not a scheduling widget.**

---

# Immediate Execution Order

The major roadmap source stack through Stage 7 is now merged and deployed. The next work is **activation and real-world verification**, not another large feature layer:

1. **Priority 0:** complete real Google-only, Outlook-only, dual-calendar, inbox, booking, cancellation, and failure-path verification in issue #14.
2. **Stage 6A:** verify real provider-backed intelligence in production and deterministic fallback behavior.
3. **Stage 6B:** re-consent real Gmail/Outlook accounts and verify connected follow-up sends, inbox/Sent Items, and failure-safe state.
4. **Stage 6C:** exercise real conflict intelligence and validate lifecycle analytics against actual production records.
5. **Security migration:** decide/configure/test `TOKEN_ENCRYPTION_KEY` with existing connected accounts before enforcing encrypted token storage.
6. **Stage 7:** exercise `/memory` with real booked meetings, persistence/reload, editable generated memory, and repeated-attendee continuity.
7. **Close issue #23 only when those provider/environment activation checks pass.**
8. **Only after repeated product value is demonstrated:** define the paid product boundary and then do billing readiness.

The roadmap should advance from here based on verified product behavior, not feature count.
