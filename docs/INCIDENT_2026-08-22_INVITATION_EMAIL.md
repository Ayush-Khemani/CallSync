# Invitation email incident — 2026-08-22

During Priority 0 production verification, meeting creation returned HTTP 201 and a booking link, but the attendee did not receive the invitation email.

Production Vercel logs showed `Meeting request email was not confirmed as sent` with `reason: not_configured`, confirming that the transactional SendGrid path had no production API key configured.

Remediation:
- send initial meeting requests through a connected Gmail mailbox when `gmail.send` is available;
- otherwise use a connected Outlook mailbox when delegated `Mail.Send` is available;
- retain SendGrid as transactional fallback;
- keep `delivery.requestEmail.sent=false` when no delivery channel confirms a send;
- retain the booking link so the host can copy it manually when delivery is unavailable.

This incident remains part of Priority 0 issue #14 until the real Google-only invitation flow is retested successfully in production.
