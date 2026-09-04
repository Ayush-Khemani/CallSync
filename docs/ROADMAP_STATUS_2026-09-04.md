# CallSync Roadmap Status — 2026-09-04

This snapshot records the current CallSync implementation/release state against `docs/PRODUCT_ROADMAP.md`. It separates **shipped product work**, **automated verification**, and **manual real-provider activation** so merged code is not confused with provider-verified production behavior.

## Current source baseline

- `main` is `eeb7aad832b0204d5f1e8dae1b5ea93895b028a1` — meeting-record Action management on top of the relationship and daily-execution product layers.
- Backend production deployment for this merge is green; frontend production rollout is being rechecked after merge.
- Both frontend and backend had no grouped Vercel runtime-error clusters in the preceding 7-day check on 2026-09-04.
- Priority 0 issue #14 remains open.
- Stage 6–7 activation issue #23 remains open.

## Productization work shipped after Stage 7

The Stage 1–7 source stack remains intact. Since the August activation work, CallSync has also moved from a feature collection toward a daily meeting operating system.

### PR #36 — Today workspace

- Today is the default authenticated workspace.
- Surfaces upcoming meetings, booking follow-ups, missing outcomes, and due next steps.
- Keeps Pipeline as the full lifecycle board.
- Refactored the previous oversized workspace component into focused product surfaces.

### PR #37 — durable Action Engine

- Added durable `meeting_actions` persistence.
- Outcome next steps become trackable actions transactionally.
- Re-saving an unchanged completed outcome does not resurrect completed work.
- Materially changing a commitment reopens it.
- Existing outcome next steps are backfilled safely.
- Database-backed integration tests cover the persistence contract.

### PR #38 — Actions workspace

- Added Open / Completed / All commitment views.
- Added overdue visibility, complete/reopen behavior, and manual meeting-linked actions.
- Kept actions anchored to meetings rather than introducing generic project management.

### PR #39 — Relationships workspace

- Groups repeated conversations by normalized attendee email.
- Carries forward latest meeting memory/outcome context.
- Surfaces meeting count, pending state, open commitments, and nearest action.
- Remains derived from canonical meeting data rather than introducing a second contacts database.

### PR #40 — Actions inside the canonical meeting record

- Added meeting-scoped action queries.
- Added an Actions tab to `/meeting/:id`.
- Users can add, complete, and reopen commitments without leaving meeting context.
- Outcome-backed actions refresh after outcome updates.
- Added frontend regression tests and Postgres meeting-isolation coverage.

## Current product architecture

The authenticated product now has distinct responsibilities:

- **Today** — immediate execution queue.
- **Pipeline** — meeting opportunities and lifecycle state.
- **Relationships** — longitudinal context across repeated meetings.
- **Actions** — durable commitments across meetings.
- **Meeting record** — canonical context: brief, preparation, follow-up, outcome, actions, memory, and activity.
- **Calendars** — Google/Outlook connection infrastructure.

The durable meeting record remains the center of the product. Calendar integrations are infrastructure around it.

## Priority 0 — production booking reliability

Issue #14 is still the release gate for real-provider booking behavior.

### Verified

- Google-only happy path — complete.
- Google + Outlook dual-calendar happy path — complete.
- Busy-time exclusion, private holds, selected-hold promotion, unused-hold cleanup, duration preservation, confirmation behavior, and cancellation were exercised in those verified paths.

### Still required

#### Outlook-only happy path

A dedicated Outlook-only production run must still verify:

- busy-period exclusion;
- host-only private/busy holds;
- selected-hold promotion;
- duration preservation;
- unused-hold cleanup;
- confirmation behavior;
- cancellation cleanup.

#### Explicit manual failure paths

Still required in real production/provider conditions:

- revoked/expired Google token fails closed;
- revoked/expired Outlook token fails closed;
- failed hold creation does not send the request email;
- failed selected-hold promotion does not leave false confirmed state;
- unconfirmed request delivery surfaces a visible copy-link warning;
- confirmation-mail failure preserves calendar confirmation while surfacing delivery warning.

Automated provider-failure integration coverage exists, but it does not replace these manual real-provider checks.

## Stage 6–7 production activation — issue #23

Source is deployed, but the following production activation work remains open.

### Stage 6A — provider-backed generation

- Confirm real provider-backed generation from the production UI.
- Verify structured meeting brief output and the later workflow jobs.
- Verify deterministic fallback still works when provider generation is unavailable.
- Confirm generated content remains editable and grounded.

### Stage 6B — connected mailbox sending

- Verify edited follow-up delivery from connected Gmail.
- Verify edited follow-up delivery from connected Outlook and Sent Items.
- Verify follow-up state advances only after a successful send.
- Verify revoked/missing send permission does not create false success.

### Stage 6C — coordination and analytics

- Exercise real Google-only and Outlook-only conflict intelligence.
- Validate lifecycle analytics against actual production meeting records.
- Match a known server error to its request ID in backend logs.

### Security rollout

- Decide/configure the production `TOKEN_ENCRYPTION_KEY`.
- Run the documented dry-run/migration sequence.
- Verify plaintext-token compatibility during migration and encrypted-token round trips afterward.
- Verify missing/wrong keys fail clearly.

### Stage 7 — production meeting memory

- Exercise raw notes → generated memory → edit → save → reload on a real booked meeting.
- Verify generated memory contains only supported context.
- Verify a second meeting with the same attendee carries prior relationship context forward.
- Verify pending/unbooked requests cannot be treated as completed meeting memory.

## Immediate execution order

1. Finish the Outlook-only issue #14 run.
2. Finish issue #14's real-provider failure-path checks.
3. Verify Stage 6A real provider-backed generation.
4. Verify connected Gmail and Outlook follow-up sends.
5. Validate real coordination intelligence and lifecycle analytics.
6. Execute the token-encryption rollout deliberately.
7. Complete real Stage 7 memory/relationship continuity verification.
8. Close #14 and #23 only when their actual exit criteria pass.
9. Only then decide the paid-product boundary and billing work.

The next milestone should be **verified repeated product behavior**, not more feature count.
