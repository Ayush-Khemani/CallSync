# CallSync Roadmap Status — 2026-08-22

This file records the implementation/release state against `docs/PRODUCT_ROADMAP.md`. The roadmap remains the product source of truth; this file separates **merged/deployed source** from **real-provider / production activation verification**.

## Production baseline

- `main` is now `75e227008567a63ee8a5a858198d60f17721c16e` — Stage 7 durable meeting memory on top of the Stage 6B/6C stack.
- Frontend production (`call-sync-livid.vercel.app`) is READY on the Stage 7 merge.
- Backend production (`call-sync-irsv.vercel.app`) is READY on the Stage 7 merge.
- `/api/health` returns 200 with `x-request-id`.
- `/api/health/db` returns only safe reachability + commit SHA; database host/raw failure details are no longer public.
- Priority 0 issue #14 remains open for real Google/Outlook booking, inbox, hold, promotion, confirmation, duration, cancellation, and failure-path verification.
- Issue #23 remains the Stage 6–7 production activation gate for real model/mailbox/provider/environment checks.

## Shipped roadmap stack

The source/deployment dependency stack has now landed in order:

1. PR #19 — Stage 6B connected Gmail/Outlook follow-up sending — **merged + deployed**.
2. PR #20 — Stage 6C slot intelligence and lifecycle analytics — **merged + deployed**.
3. PR #21 — Stage 6C request observability and token-storage hardening — **merged + deployed**.
4. PR #22 — Stage 7 durable in-platform meeting memory — **merged + deployed**.

Each PR was revalidated against the actual lower-stage production baseline before merge. Stacked branches were rebuilt cleanly after squash merges so later PRs did not reintroduce duplicated lower-stage history.

## Priority 0 — reliability gate

**Automated/code coverage:** strong and merged.

Coverage includes private calendar holds, duration-aware holds/events, promotion of the selected hold into the attendee meeting, unused-hold cleanup, visible delivery failures, fail-closed connected-calendar availability, rollback behavior, cancellation cleanup state, and database-backed booking lifecycle tests.

**Still required:** real provider/inbox testing in issue #14. Automated tests do not close this gate.

## Stage 5 — pre-call preparation & outcomes

**Source:** complete.

**Deployment:** complete.

Pre-call preparation, editable agenda/opening prompt, host notes, outcome capture, next action, urgency ordering, and deterministic/provider-assisted suggestions are live. The date-dependent Stage 5 next-action test was also made clock-injectable so CI does not change behavior as calendar dates pass.

**Still required:** exercise the complete workflow with real booked production meetings as part of issues #14/#23.

## Stage 6A — server-side intelligence boundary

**Source:** complete and merged.

**Deployment:** complete.

One authenticated server-side generation boundary is used for meeting briefs, follow-up, pre-call preparation, opening prompts, next-step suggestions, and Stage 7 meeting memory. Deterministic fallback remains the reliability path when provider generation is unavailable.

**Still required:** confirm real provider-backed generation with the production OpenAI configuration and verify fallback/provider behavior in issue #23. Provider/model details remain outside the product response contract.

## Stage 6B — connected mailbox sending

**Source:** complete.

**Deployment:** complete via PR #19 / merge `bae42af5c7c0683a9b745db6f6d591e3aa2d522d`.

Includes narrow Gmail `gmail.send` / Outlook delegated `Mail.Send`, editable in-product follow-up sending, durable provider/timestamp state, failure-safe counters, scope-preserving Outlook refresh behavior, integration capability status, and connected-mail integration tests. SendGrid remains the transactional system-notification channel.

**Still required:** real Google/Microsoft re-consent and inbox/Sent Items verification in issue #23. A failed provider send must be verified not to advance follow-up state.

## Stage 6C — coordination and analytics

**Source:** complete.

**Deployment:** complete via PR #20 / merge `a7625e44a0438b3c5d319737d224cf4dc15d04f8`.

Includes deterministic best-fit slot ranking, privacy-safe conflict explanations, provider conflict counts, buffer-aware availability, booking/follow-up/outcome analytics, and the compact Meeting Health surface.

**Still required:** compare production analytics with real meeting records and exercise Google-only / Outlook-only conflict scenarios. Confirm no private event content is exposed in production responses/UI.

## Stage 6C — observability and security

**Source:** complete.

**Deployment:** complete via PR #21 / merge `417888920aadccb2838d4a88f27d84dd95df072d`.

Includes request correlation IDs, safer 5xx logs, a real blocked-origin 403 policy, hardened public DB health output, backward-compatible OAuth token encryption behavior, explicit missing-key/malformed-token failures, and CI coverage that actually executes these security tests.

Production smoke verification completed on 2026-08-22:

- `/api/health` — 200 + `x-request-id`.
- `/api/health/db` — 200 with only `status`, `service`, `database`, and `commitSha`.

**Still required:** deliberately decide/configure the production `TOKEN_ENCRYPTION_KEY` rollout and test migration behavior with real connected accounts. Do not enforce encrypted storage blindly before that environment migration is verified.

## Stage 7 — durable meeting memory

**Source:** complete.

**Deployment:** complete via PR #22 / merge `75e227008567a63ee8a5a858198d60f17721c16e`.

The final implementation was rebuilt because the original stacked branch had memory files but did not actually mount the routes/intelligence/frontend routing or run the memory tests in CI. The shipped version includes:

- durable raw meeting notes kept separate from derived memory;
- editable summary, key points, decisions, action items, owner/deadline when actually known, and unanswered questions;
- authenticated memory-state and memory-save routes;
- `meeting_memory` inside the server intelligence boundary with deterministic fallback;
- focused `/memory` workspace and launchers from Pipeline and Prepare & outcomes;
- relationship history for repeated attendees;
- previous same-attendee saved memory carried into future pre-call preparation;
- unit tests plus a database-backed integration that books two meetings with the same attendee, saves the first memory, and verifies it appears in preparation for the second meeting.

**Still required:** exercise `/memory` with real production meetings, reload persistence, edit generated output, and verify repeated-attendee continuity manually under issue #23.

## Billing

Billing remains intentionally deferred. The roadmap says billing readiness should follow a clear paid-product boundary and repeated demonstrated value; it should not block reliability, provider activation, connected communication, lifecycle intelligence, or meeting memory.

## Immediate execution order from here

1. Complete Priority 0 real-provider booking/calendar/email checks in issue #14.
2. Verify Stage 6A provider-backed generation and deterministic fallback in production.
3. Reconnect Google and Microsoft accounts with narrow send permissions and verify Stage 6B real sends end-to-end.
4. Exercise Stage 6C conflict intelligence and lifecycle analytics against real production records.
5. Decide and test the production token-encryption-key migration before enforcing encrypted token storage.
6. Exercise Stage 7 meeting memory with real booked and repeated-attendee meetings.
7. Close issue #23 only after those production activation checks pass.
8. Define the paid product boundary from observed repeated value before doing billing work.
