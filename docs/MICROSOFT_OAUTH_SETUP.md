# Microsoft OAuth production setup

CallSync supports both Microsoft work/school accounts and personal Microsoft accounts such as Outlook.com/Hotmail.

The frontend uses the Microsoft identity platform v2 `/common` authorization endpoint and requests delegated calendar/mail permissions. The Microsoft Entra app registration must therefore be configured to accept both organizational and personal Microsoft accounts.

## Required app-registration settings

In Microsoft Entra admin center, open the app registration used by CallSync's `REACT_APP_OUTLOOK_CLIENT_ID` / `OUTLOOK_CLIENT_ID`.

### Supported account types

The application must use:

```json
"signInAudience": "AzureADandPersonalMicrosoftAccount"
```

This is the app-registration setting for:

> Accounts in any organizational directory and personal Microsoft accounts.

Do not use `AzureADMyOrg` or `AzureADMultipleOrgs` if personal Outlook/Hotmail accounts must connect.

### Access token version

Personal-account support requires the v2 token configuration. In the manifest, ensure:

```json
"api": {
  "requestedAccessTokenVersion": 2
}
```

Set/save `requestedAccessTokenVersion` first if Entra refuses the `signInAudience` change with an error saying the application must accept Access Token Version 2.

## Redirect URI

Configure a **Web** redirect URI matching the frontend OAuth callback exactly.

Production:

```text
https://call-sync-livid.vercel.app/auth/outlook
```

If another stable frontend domain becomes canonical, add its exact `/auth/outlook` callback before switching traffic.

Avoid relying on arbitrary preview URLs in the production Microsoft app registration unless a deliberate preview OAuth strategy is introduced.

## Delegated permissions

CallSync currently requests:

- `Calendars.ReadWrite`
- `Mail.Send`
- `offline_access`

Calendar access is used for availability, private/busy temporary holds, promotion of the selected hold into the attendee meeting, and cleanup/cancellation.

`Mail.Send` is used for connected Outlook mailbox sending. CallSync should not request broader mailbox-read permissions for this workflow.

## OAuth endpoints

Authorization:

```text
https://login.microsoftonline.com/common/oauth2/v2.0/authorize
```

Token exchange/refresh:

```text
https://login.microsoftonline.com/common/oauth2/v2.0/token
```

Using `/common` is intentional because CallSync supports both organizational and personal Microsoft accounts. Account eligibility is still controlled by the Entra app registration's supported-account setting.

## Environment variables

Frontend:

- `REACT_APP_OUTLOOK_CLIENT_ID`

Backend:

- `OUTLOOK_CLIENT_ID`
- `OUTLOOK_CLIENT_SECRET`
- `OUTLOOK_REDIRECT_URI`

The client IDs must refer to the same Entra app registration. Keep the client secret backend-only.

## Production verification checklist

After changing the Entra app registration:

1. Open CallSync → **Calendars**.
2. Connect Outlook with a personal Outlook/Hotmail account.
3. Confirm CallSync reports Outlook Calendar connected and Outlook Mail permission enabled.
4. Create an Outlook-only busy event and confirm CallSync excludes that period.
5. Create a meeting request and confirm offered slots become private/busy host-only holds.
6. Book one slot from the guest link and confirm the selected hold becomes the attendee meeting.
7. Confirm unused holds are removed and cancellation cleans up the Outlook event.
8. Verify an Outlook mailbox send from CallSync arrives and appears in Sent Items when testing Stage 6B activation.

## Common failure: personal account rejected

Symptom:

> You can't sign in here with a personal account. Use your work or school account instead.

Cause: the Entra app registration does not allow personal Microsoft accounts even if CallSync is correctly using the `/common` v2 endpoint.

Fix:

1. Set `api.requestedAccessTokenVersion` to `2`.
2. Set `signInAudience` to `AzureADandPersonalMicrosoftAccount`.
3. Save the manifest/app registration.
4. Retry **Connect Outlook** from CallSync.

Do not change CallSync from `/common` to a tenant-specific endpoint when the product is intended to support personal Microsoft accounts.
