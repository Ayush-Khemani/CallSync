# CallSync Roadmap Status — 2026-08-23

This snapshot records the current implementation/release state against `docs/PRODUCT_ROADMAP.md`. The roadmap remains the product source of truth; this file separates **shipped source**, **automated verification**, and **real-provider production activation**.

## Current baseline

The implementation stack through Stage 7 is shipped. Work is now focused on real-provider activation, failure handling, and operational cleanup rather than another large feature stage.

Recent reliability/activation work:

- PR #25 moved meeting-request and confirmation delivery to the host's connected Gmail/Outlook mailbox path.
- PR #27 put live provider connection state inside the existing Dashboard → Calendars cards.
- PR #28 added database-backed Priority 0 provider failure-path tests.
- PR #29 added dry-run-first OAuth token-encryption migration tooling and a production runbook.
- PR #30 reconciled roadmap state after the first Google production activation.
- PR #31 made expected provider failures user-actionable while keeping unexpected 5xx details private.
- PR #32 added explicit AI-provider outage/malformed-response fallback tests and a safe authenticated generation-capability signal.
- PR #33 documents Microsoft personal-account OAuth production setup and removes stale SendGrid setup/runtime configuration references.

Priority 0 issue #14 and Stage 6–7 activation issue #23 remain open because real-provider exit criteria are intentionally separate from source/CI/deployment completion.

## Priority 0 — real calendar booking verification

### Google-only — verified in production

The complete Google happy path has been manually exercised with real accounts:

- Google OAuth connection succeeds.
- a known Google busy period is excluded from availability;
- offered slots become private host-only calendar holds;
- the guest receives the request email from the connected host Gmail account;
- the booking link opens and the guest can answer questions/select a slot;
- the selected hold becomes the real attendee meeting;
- configured duration is preserved;
- unselected holds are removed;
- calendar invite and host/guest confirmation behavior works;
- CallSync reflects the confirmed booking state;
- cancellation cleans up the Google meeting.

Issue #14 Test A is checked complete.

### Google + Outlook together — verified in production

The dual-provider happy path has also been manually exercised:

- both providers connect simultaneously;
- a Google-only conflict blocks the corresponding slot;
- a different Outlook-only conflict also blocks its slot;
- offered slots are protected in both calendars;
- booking promotes the selected hold consistently in both providers;
- unselected holds disappear from both;
- cancellation cleans up both calendars.

Issue #14 Test C is checked complete.

### Outlook-only — still required

A dedicated Outlook-only run remains the missing happy-path release-gate check. It must independently verify:

- Outlook busy-period exclusion;
- private/busy host-only holds;
- selected-hold promotion;
- duration preservation;
- unused-hold cleanup;
- confirmation and cancellation behavior.

The dual-calendar success is strong Outlook evidence, but it does not replace the explicit Outlook-only gate in issue #14.

### Explicit failure-path checks — still required manually

Automated coverage is strong, but issue #14 still requires real-provider checks for revoked/expired Google and Outlook tokens plus visible delivery-warning behavior.

Do not close #14 until those manual checks and Outlook-only are complete.

## Microsoft personal-account activation

During real Outlook activation, Microsoft initially rejected a personal account with:

> You can't sign in here with a personal account. Use your work or school account instead.

The Entra app registration was corrected to support personal Microsoft accounts. The required production configuration is now documented in `docs/MICROSOFT_OAUTH_SETUP.md`, including:

- `signInAudience = AzureADandPersonalMicrosoftAccount`;
- `api.requestedAccessTokenVersion = 2`;
- the `/common` Microsoft identity-platform v2 endpoints;
- the production `/auth/outlook` redirect URI;
- delegated `Calendars.ReadWrite`, `Mail.Send`, and `offline_access` permissions.

Both Google and Outlook now connect successfully in the production CallSync Calendars workspace.

## Priority 0 automated reliability coverage

PR #28 (`d98569dd9f3b79106deebd4df6d228a5de092859`) added database-backed tests that verify:

- hold-creation failure rolls back the request before any request email is sent;
- selected-hold promotion failure restores `pending` state and sends no confirmation;
- partial confirmation-email failure preserves the calendar-confirmed booking while recording only successful delivery state;
- cancellation cleanup failure remains visible without falsifying the stored cancelled state;
- server/provider failures retain request-ID correlation.

PR #31 additionally preserves safe, actionable messages for deliberate operational `HttpError` failures while unexpected server exceptions remain generic to the client.

These tests do not substitute for the remaining real-provider failure checks.

## Stage 6A — provider-backed intelligence

**Source:** shipped.

**Automated fallback verification:** strengthened by PR #32 (`0239ce511683886c45abf66ef3131895feba491e`).

CI now explicitly forces the provider path and verifies deterministic grounded fallback for:

- meeting briefs on upstream 503;
- malformed meeting-brief structured output;
- follow-up, pre-call, and next-step artifacts on provider outage;
- malformed workflow-generation output;
- meeting-memory generation on provider outage;
- malformed meeting-memory output.

The authenticated `/api/integrations/status` response now exposes only:

```json
{
  "generation": {
    "providerConfigured": true,
    "deterministicFallbackAvailable": true
  }
}
```

The booleans allow production activation to verify configuration state without exposing the API key or model name.

**Production activation still required:**

- confirm `providerConfigured` is true in production;
- generate a real production meeting brief and verify useful structured output;
- verify host editability;
- exercise follow-up, pre-call, next-step, and memory suggestions against persisted real meeting state;
- confirm provider/model details remain outside normal frontend generation responses.

## Stage 6B — connected mailbox sending

**Source:** shipped.

Current meeting-delivery architecture:

`CallSync → host OAuth token → Gmail API / Microsoft Graph → guest`

The active meeting-request/confirmation runtime does not use SendGrid. PR #33 removes stale SendGrid environment/config documentation; the unused npm package entry remains a separate dependency-only cleanup.

Real Gmail meeting-request delivery is verified. The dedicated Stage 6B follow-up gate remains open because it still requires:

- editing a pending-meeting follow-up draft;
- sending it through connected Gmail;
- verifying arrival and success-only provider/timestamp persistence;
- repeating through connected Outlook and verifying Sent Items;
- verifying revoked/missing send permission does not advance follow-up state.

## Stage 6C — coordination intelligence and analytics

**Source:** shipped.

Dual-calendar production testing has verified that provider-specific conflicts from Google and Outlook are both excluded from combined availability and that holds/promotion/cleanup stay consistent across providers.

Still required under #23:

- inspect ranked-slot reasons in production and confirm they expose only time geometry/work-window context;
- verify buffer-time behavior with real calendars;
- compare Meeting Health booking/follow-up/outcome rates with actual production records;
- verify zero/low-data analytics states.

## Stage 6C — observability and security

Already production-verified:

- responses carry request IDs;
- public `/api/health/db` exposes only safe service/database reachability and commit correlation;
- provider failures have safe client messages plus server-side correlation.

PR #29 (`eed21937d03d5347cdd56539bd22b92bdfcdc259`) provides the OAuth-token encryption rollout tooling:

- `npm run tokens:encrypt` is dry-run by default;
- `npm run tokens:encrypt -- --apply` explicitly mutates rows;
- a valid base64 32-byte `TOKEN_ENCRYPTION_KEY` is required;
- already-encrypted rows are validated with the configured key;
- legacy plaintext values are round-trip checked;
- updates run transactionally;
- output is aggregate-only;
- `Backend/scripts/OAUTH_TOKEN_ENCRYPTION_RUNBOOK.md` documents the operational sequence.

**Production token encryption is not yet activated.** The secret still has to be deliberately configured, the production dry-run reviewed, the migration applied, and real Google/Outlook reads/refresh/sending retested afterward.

## Stage 7 — durable meeting memory

**Source:** shipped.

Automated coverage includes raw/generated separation, grounding constraints, persistence, and repeated-attendee continuity. PR #32 additionally verifies that provider outage or malformed provider output falls back to notes/persisted context rather than breaking memory generation.

Production activation still requires a real booked meeting to verify:

- raw notes remain distinct from derived memory;
- generated memory remains grounded and editable;
- edits persist after reload;
- a second meeting with the same attendee receives previous relationship context;
- pending/unbooked requests cannot be saved as completed meeting memory.

## Billing

Billing remains intentionally deferred. Reliability, provider activation, connected communication, analytics, security migration, and durable meeting memory remain ahead of monetization work.

## Immediate execution order

1. Complete the dedicated Outlook-only Priority 0 production run.
2. Complete revoked/expired-token and visible-delivery-warning Priority 0 checks.
3. Verify Stage 6A provider-backed generation in production using the new safe capability signal.
4. Verify edited connected follow-up sending through Gmail and Outlook.
5. Finish Stage 6C ranked-slot/privacy/buffer and lifecycle-analytics checks against real data.
6. Configure and execute the production OAuth token-encryption rollout using the dry-run/apply runbook.
7. Exercise Stage 7 durable meeting memory and repeated-attendee continuity in production.
8. Close #14 and #23 only after their real-provider exit criteria pass.
9. Define the paid product boundary only after repeated product value is demonstrated.
