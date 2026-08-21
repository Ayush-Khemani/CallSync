# CallSync Roadmap Status — 2026-08-22

This file records the implementation/release state against `docs/PRODUCT_ROADMAP.md`. The roadmap remains the product source of truth; this file separates source-complete work from production/provider verification.

## Production baseline

- `main` is currently at Stage 6A (`f7f50b14537e92b0fb57d36264317171f477a708`).
- Stage 5 and Stage 6A are deployed on the current production baseline.
- Priority 0 issue #14 remains open for real Google/Outlook booking, inbox, hold, promotion, confirmation, duration, cancellation, and failure-path verification.
- Issue #23 remains the Stage 6–7 production activation gate.

## Roadmap implementation stack

The next releases must land in dependency order:

1. PR #19 — Stage 6B connected Gmail/Outlook follow-up sending.
2. PR #20 — Stage 6C slot intelligence and lifecycle analytics.
3. PR #21 — Stage 6C request observability and token-storage hardening.
4. PR #22 — Stage 7 durable in-platform meeting memory.

Do not promote an upper PR ahead of an unhealthy lower dependency.

## Stage 6A

**Source:** complete and merged.

**Production activation still to verify:** provider-backed generation with the production API key. Deterministic fallback remains the required reliability path.

## Stage 6B

**Source:** implemented in PR #19.

Includes narrow Gmail `gmail.send` / Outlook delegated `Mail.Send`, editable in-product follow-up sending, durable provider/timestamp state, failure-safe counters, scope-preserving token refresh behavior, and connected-mail integration tests.

**Release gate:** fresh GitHub CI + fresh frontend/backend Vercel previews, followed by real Gmail and Outlook consent/send tests in production.

## Stage 6C — coordination and analytics

**Source:** implemented in PR #20.

Includes deterministic best-fit slot ranking, privacy-safe conflict explanations, buffer-aware availability, booking/follow-up/outcome analytics, and the compact Meeting Health product surface.

**Release gate:** PR #19 must be healthy on `main`, then PR #20 must pass its own CI/deployment checks and production data verification.

## Stage 6C — observability and security

**Source:** implemented in PR #21.

Includes request correlation IDs, safer 5xx logging, hardened public DB health output, backward-compatible OAuth token encryption behavior, and explicit missing-key/malformed-token failures.

**Release gate:** production encryption-key rollout must be deliberate; do not enforce token encryption before the environment key is verified.

## Stage 7 — meeting memory

**Source:** implemented in PR #22.

Includes raw meeting notes, editable structured memory, grounded AI/fallback summaries, action items, unanswered questions, relationship history, and continuity into future same-attendee meeting preparation.

**Release gate:** lower Stage 6B/6C stack must be healthy on `main`, then `/memory` must be exercised with real booked meetings and repeated-attendee continuity.

## Billing

Billing remains intentionally deferred. The roadmap says billing readiness should follow a clear paid-product boundary and repeated demonstrated value; it should not block reliability, connected communication, lifecycle intelligence, or meeting memory.

## Immediate execution order

1. Refresh and clear PR #19 CI/Vercel checks.
2. Merge/deploy #19 only if green.
3. Retarget/verify #20 against `main`, then merge/deploy only if green.
4. Repeat for #21.
5. Repeat for #22.
6. Complete real-provider checks in issues #14 and #23.
7. Only then mark later stages production-complete in the roadmap.
