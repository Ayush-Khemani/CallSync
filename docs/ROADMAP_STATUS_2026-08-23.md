# CallSync Roadmap Status — 2026-08-23

This snapshot records the current implementation/release state against `docs/PRODUCT_ROADMAP.md`. The roadmap remains the product source of truth; this file separates **shipped source**, **automated verification**, and **real-provider production activation**.

## Current baseline

- Source through Stage 7 remains shipped on `main`.
- PR #25 replaced the meeting-request/confirmation SendGrid runtime dependency with the host's connected Gmail/Outlook mailbox path.
- PR #26 added live calendar connection state; PR #27 corrected the placement so status now lives inside the existing Dashboard → Calendars Google/Outlook cards rather than a floating dashboard dock.
- PR #28 added database-backed Priority 0 provider failure-path integration tests.
- PR #29 added dry-run-first OAuth token-encryption migration tooling and a production rollout runbook.
- Priority 0 issue #14 remains open.
- Stage 6–7 activation issue #23 remains open.

## Google production verification — partially complete

The Google production happy path has materially advanced after enabling the Gmail API in the Google Cloud project used by CallSync OAuth.

Manually verified with a real host/guest flow:

- Google connection succeeds in production.
- A meeting-request email arrives from the host's connected Gmail account.
- Host Google Calendar updates for the request.
- The guest can book an offered slot.
- The selected hold becomes the real meeting with the guest attendee.
- Configured meeting duration is preserved.
- Unselected holds are removed.
- Calendar invitation / host and guest confirmation behavior works.

Still not independently recorded as complete for the Google-only Priority 0 checklist:

- a deliberately created busy-period exclusion check;
- all pre-booking hold privacy assertions from the production UI/manual inspection;
- dashboard-state parity after booking;
- cancellation cleanup in the real Google account;
- revoked/expired-token failure behavior.

Do not close issue #14 from the successful subset above.

## Outlook and dual-calendar production verification — still required

The remaining highest-priority manual work is:

1. Outlook-only happy path: conflict exclusion, private/busy holds, promotion, duration, unused-hold cleanup, notifications, and cancellation.
2. Google + Outlook together: provider-specific conflicts, holds in both calendars, consistent promotion, cleanup, and cancellation.
3. Revoked/expired-provider failure checks for both calendars.

The Dashboard → Calendars page now exposes live Google/Outlook connection state to make these checks easier to run without guessing whether a provider is connected.

## Priority 0 automated reliability coverage

PR #28 (`d98569dd9f3b79106deebd4df6d228a5de092859`) strengthened the failure-path gate with database-backed integration tests.

CI now explicitly verifies that:

- a connected-calendar hold creation failure rolls back the meeting and slots before any request email is sent;
- selected-hold promotion failure restores the meeting to `pending`, clears selection state, and sends no confirmation email;
- partial confirmation-email failure keeps a calendar-confirmed booking intact while persisting only successful delivery timestamps;
- cancellation cleanup failure is surfaced via `calendarCleanupComplete: false` while the stored meeting remains cancelled;
- provider 5xx failures remain client-safe while returning a correlation `requestId`.

These tests strengthen the release gate but do not substitute for real Google/Outlook verification.

## Stage 6A — provider-backed intelligence

**Source:** shipped.

**Production activation:** still required.

Remaining checks under issue #23:

- confirm the production backend has a valid `OPENAI_API_KEY`;
- generate a production meeting brief through the UI and verify useful structured output;
- verify deterministic fallback when provider generation is unavailable;
- verify generated fields remain editable;
- exercise follow-up, pre-call, opening prompt, next-step, and meeting-memory suggestions against persisted meeting state;
- confirm provider/model details remain outside the frontend response contract.

## Stage 6B — connected mailbox sending

**Source:** shipped.

The current meeting delivery architecture is now:

`CallSync → host's persisted Google/Microsoft OAuth token → Gmail API / Microsoft Graph → guest`

Meeting-request and confirmation delivery no longer depend on a configured SendGrid API key in the active runtime path. Connected follow-up sending remains available through Gmail `gmail.send` and Outlook delegated `Mail.Send`.

Google activation evidence now includes a successful real meeting-request email from the connected host Gmail account. The Stage 6B follow-up checklist is **not** complete yet because it specifically requires:

- editing a pending-meeting follow-up draft;
- sending that edited draft through Gmail from CallSync;
- verifying arrival from the connected Gmail account;
- verifying follow-up provider/timestamp state advances only after success;
- revoking/missing send permission and verifying a failed send does not advance follow-up state.

The equivalent Outlook connected-mail flow remains unverified in production.

## Stage 6C — coordination intelligence and analytics

**Source:** shipped.

**Production activation:** still required.

Remaining checks:

- Google-only and Outlook-only conflict-count verification;
- ranked-slot reason quality without exposing private event content;
- buffer-time behavior against real calendars;
- Meeting Health booking/follow-up/outcome rates against actual production records;
- safe zero/low-data analytics states.

## Stage 6C — observability and security

Existing verified production behavior includes request IDs and hardened public DB-health output.

PR #29 (`eed21937d03d5347cdd56539bd22b92bdfcdc259`) adds the missing operational tooling for the OAuth token-encryption rollout:

- `npm run tokens:encrypt` is dry-run by default;
- `npm run tokens:encrypt -- --apply` is the explicit apply mode;
- a valid 32-byte base64 `TOKEN_ENCRYPTION_KEY` is required;
- already-encrypted rows are decrypted during validation so a wrong/missing key aborts;
- legacy plaintext values are round-trip checked before commit;
- migration updates run in one transaction;
- output contains aggregate counts only, not user emails, IDs, or token values;
- `Backend/scripts/OAUTH_TOKEN_ENCRYPTION_RUNBOOK.md` documents rollout and verification.

This **does not** mean production token encryption is activated yet. Remaining activation steps are:

1. configure one stable production `TOKEN_ENCRYPTION_KEY`;
2. deploy and verify existing plaintext connections still work;
3. run the migration dry-run against the real production database;
4. review counts and database backup;
5. apply explicitly;
6. re-run dry-run and verify zero remaining plaintext provider tokens;
7. exercise real Google/Outlook reads, refresh persistence, and connected sending after migration.

## Stage 7 — durable meeting memory

**Source:** shipped.

**Production activation:** still required.

Use a real booked meeting to verify:

- raw notes remain separate from generated memory;
- generated summary/key points/decisions/action items/questions stay grounded in captured context;
- generated memory remains editable and persists after reload;
- a second meeting with the same attendee receives prior relationship continuity in pre-call preparation;
- pending/unbooked requests cannot be saved as completed meeting memory.

## Billing

Billing remains intentionally deferred. Reliability, provider activation, connected communication, lifecycle intelligence, security migration, and durable meeting memory stay ahead of monetization work.

## Immediate execution order

1. Complete Outlook-only Priority 0 production testing.
2. Complete Google + Outlook dual-calendar production testing.
3. Finish the remaining Google-only cancellation/conflict/revoked-token checks.
4. Verify Stage 6B edited follow-up sending through Gmail, then Outlook.
5. Verify Stage 6A provider-backed intelligence and fallback behavior.
6. Exercise Stage 6C conflict intelligence and lifecycle analytics on real records.
7. Configure and execute the production OAuth token-encryption rollout using the new dry-run/apply tooling.
8. Exercise Stage 7 durable meeting memory and repeated-attendee continuity.
9. Close #14 and #23 only when their real-provider exit criteria are satisfied.
10. Define the paid product boundary only after repeated value is demonstrated.
