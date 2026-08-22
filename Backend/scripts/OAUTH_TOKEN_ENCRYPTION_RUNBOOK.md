# OAuth token encryption rollout

CallSync can read legacy plaintext OAuth token rows while `TOKEN_ENCRYPTION_KEY` is being introduced. Once the key is configured, newly serialized Google/Outlook token bundles are stored with AES-256-GCM encryption.

The migration command in this directory exists to convert existing plaintext rows without exposing token contents or requiring users to reconnect.

## Safety rules

- Use one stable production `TOKEN_ENCRYPTION_KEY`; do not casually rotate or delete it after encrypted rows exist.
- The key must be a base64-encoded 32-byte value.
- Never paste the key or OAuth token values into logs, issues, screenshots, or chat.
- Run the migration against a backed-up production database.
- Run the command without `--apply` first. Dry-run is the default.
- Do not remove the key after encrypted rows have been written. CallSync intentionally fails closed when encrypted tokens cannot be decrypted.

## 1. Generate the key once

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Store the result as the backend production `TOKEN_ENCRYPTION_KEY` secret.

## 2. Deploy with the key before migrating rows

Deploy the backend with `TOKEN_ENCRYPTION_KEY` configured, then verify:

- `/api/health` is healthy;
- `/api/health/db` is healthy;
- an existing connected Google/Outlook account still reports connected;
- normal calendar availability continues to work.

Legacy plaintext rows remain readable during this step. New token writes/refreshes will be encrypted automatically.

## 3. Run a dry-run

From a trusted environment with the production `DATABASE_URL` and the same production `TOKEN_ENCRYPTION_KEY`:

```bash
npm run tokens:encrypt
```

The command reports aggregate counts only:

- users scanned;
- rows requiring an update;
- plaintext/encrypted/empty Google token counts;
- plaintext/encrypted/empty Outlook token counts.

It opens a transaction and rolls it back in dry-run mode, so no token rows are changed.

If an existing encrypted value cannot be decrypted with the configured key, the command aborts rather than continuing.

## 4. Apply explicitly

After reviewing the dry-run counts and confirming the database backup:

```bash
npm run tokens:encrypt -- --apply
```

The migration encrypts only legacy plaintext values. Already encrypted values are validated and left unchanged. All updates commit in one transaction; a failure rolls the transaction back.

## 5. Verify after migration

Run the dry-run command again. The expected result is zero plaintext Google and Outlook tokens for currently stored connections.

Then verify with real connected accounts:

- `/api/integrations/status` still reports the expected providers connected;
- Google and Outlook availability reads still work;
- a token refresh can persist a refreshed encrypted bundle;
- connected mail sending still works for providers with send permission.

## Rollback and key rotation

If migration verification fails, keep the encryption key available and restore the pre-migration database backup before further changes.

This migration command is **not** a key-rotation tool. Rotating an existing production key requires decrypting every encrypted value with the old key and re-encrypting with the new key in a separately reviewed procedure.
