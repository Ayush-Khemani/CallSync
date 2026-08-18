# CallSync Product Roadmap

_Last updated: 2026-08-18_

This document is the product source of truth for CallSync. Implementation status should be cross-checked against `docs/ROADMAP_AUDIT_2026-08-18.md`, but new product work should follow the priorities and product boundaries defined here.

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

Before advancing the product roadmap, the core booking loop must be production-reliable.

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

**Do not treat later roadmap stages as production-complete until the end-to-end booking flow is verified.**

This is the highest-priority product requirement.

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

**Status: Complete with deterministic/local generation**

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

## Limitation

The current generation path is deterministic frontend logic. Real AI belongs behind the Stage 6A server-side intelligence boundary.

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

**Status: Complete for manual follow-up**

## Goal

Help users recover meetings that would otherwise disappear.

## Tasks

- Add follow-up status and timestamps.
- Generate contextual, copyable follow-up messages.
- Add a "mark followed up" action.
- Add reminder rules for stale pending invites.
- Persist follow-up count and next follow-up date.
- Later, send follow-ups through connected Gmail/Outlook.

## Acceptance

- Pending invites do not silently sit in the system.
- The host knows exactly who needs a nudge and what to say.
- Follow-up activity remains durable.

## Product boundary

Stage 4 manages the follow-up workflow even before connected-mailbox sending exists. Actual Gmail/Outlook sending is Stage 6B.

---

# Stage 5 — Pre-Call Preparation & Outcome Tracking

**Status: Complete in source; production verification required**

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

The Stage 5 implementation is committed in source. Production status should remain separate from source-complete status until a fresh successful deployment is verified.

---

# Stage 6 — Real Intelligence & Communication

## Goal

Add real AI and communication capabilities behind the existing workflow without changing CallSync into a generic AI chat product.

---

## Stage 6A — Server-Side AI Generation Boundary

**Next intelligence milestone**

### Goal

Replace deterministic helper logic with a reusable server-side generation layer while keeping deterministic fallbacks.

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
5. Ground generation in persisted meeting context.
6. Keep generated output editable.
7. Keep provider/model details out of the product experience.

### Acceptance

- AI makes an existing workflow step faster or better.
- The product still works when AI generation fails.
- Users are never forced into a chat interface to complete the meeting workflow.

---

## Stage 6B — Connected Mailbox Sending

### Goal

Move from copyable messages and transactional notifications to communication sent from the user's own mailbox where appropriate.

### Tasks

- Add Gmail send scopes and connected sending.
- Add Outlook Mail send scopes and connected sending.
- Send meeting invitations/follow-ups through the connected mailbox where product behavior requires it.
- Keep SendGrid for transactional system notifications.
- Persist actual outbound timestamps against the Stage 4 follow-up model.
- Surface sending failures clearly.

### Acceptance

- The host can complete the follow-up workflow without copying text into another application.
- Outbound communication is reflected in CallSync's meeting state.

---

## Stage 6C — Smarter Coordination, Measurement & Maturity

### Tasks

- Smarter slot ranking.
- Explain calendar conflicts without exposing private event content.
- Booking-rate analytics.
- Follow-up-rate analytics.
- Meeting-outcome analytics.
- Observability and alerting.
- Security review and token-storage hardening.
- Billing readiness only after the paid product boundary is clear.

### Acceptance

- CallSync can explain and improve the meeting workflow, not only execute it.
- Operational failures can be detected and diagnosed.

---

# Stage 7 — In-Platform Meeting Memory

## Goal

Make the completed meeting itself part of CallSync's persistent workflow.

A meeting should not become an empty calendar event after it happens, and the user should not have to move every important call into Notion or another notes app just to remember what was discussed.

## Tasks

- Add a durable meeting notes area attached to the existing meeting record.
- Allow the user to capture notes during or immediately after the call.
- Add AI-assisted meeting summaries grounded in the meeting's actual captured content/context.
- Extract editable:
  - key points
  - decisions
  - action items
  - owners where known
  - deadlines/follow-up dates where known
  - unanswered questions
- Connect captured notes to the Stage 5 outcome and next-step model.
- Preserve the meeting brief, guest answers, preparation, notes, outcome, and follow-up history as one continuous record.
- Make previous meeting context available when the same relationship returns for another call.

## Product rule

AI meeting notes should be a workflow feature, not a separate chatbot or generic document editor.

## Acceptance

- A user can open a completed meeting later and understand why it happened, what was discussed, what was decided, and what should happen next.
- Important meeting memory stays inside CallSync.

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

Until the core lifecycle is strong, avoid spending the next iteration on:

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

# Immediate Build Order

1. **Priority 0: verify and fix the end-to-end booking/email/calendar flow.**
2. **Verify Stage 5 in production.**
3. **Stage 6A: server-side AI generation boundary with deterministic fallback.**
4. **Stage 6B: Gmail/Outlook connected sending.**
5. **Stage 6C: slot intelligence, analytics, observability, security, billing readiness.**
6. **Stage 7: in-platform meeting memory and AI-assisted meeting notes.**

The roadmap should only advance when each preceding product dependency is reliable enough to support the next layer.
