# Firebase HR gateway — implementation and cutover status

This change adds a real HTTP gateway on the existing `nexus-line-bot` Vercel project. It is **disabled by default**. It does not close either production RTDB vulnerability by itself. The current mainmanagement and Employee-management pages still use their original direct database access; they have not been switched to this gateway.

## Implemented

- `POST /sso-api/{challenge,session,read,write,command,revoke}`; no public signup, enrollment, role editing or password reset endpoint.
- Existing mainmanagement Firebase ID token checked by Firebase accounts lookup, project/audience/issuer/expiry/revocation/disabled checks; synthetic legacy account email verification is not required. No existing UID or password is changed.
- Approved P-256 public key, one-use 60-second challenge bound to UID, token hash, device, session, operation and payload. Browser helper requires a non-extractable private key. This is an application device signature, **not WebAuthn**, hardware attestation or proof of user presence. DID alone cannot authorize a request. Existing legacy device lists remain untouched; public keys must be privately verified and mapped before activation.
- Protected `_security` principal/session/device records, per-user rate limit, 15-minute sessions, fresh authorization on reads and every CAS retry. No authority comes from names, localStorage roles, request-body employee records or decoded JWT claims alone.
- Staff: own employee data, own requests/attendance, shared operational settings and bulletin. Allowlisted employee fields exclude device secrets and arbitrary legacy fields.
- Manager: own data plus pending requests in explicitly assigned request-key scope and authorized car/sick/personal categories. No self-review or annual-leave review.
- CEO: business administration within implemented field validation. No history deletion, ID replacement, arbitrary path proxy or bulk record replacement. Account/delegation/key enrollment and several current UI workflows are not yet implemented.
- Version checks against the exact visible record, root ETag compare-and-set, bounded retries, persistent operation IDs, atomic audit/receipt, readback. Concurrent annual approval rechecks the complete current source ledger.
- The current Employee-management annual calculation is preserved in `annual-policy.mjs`, including individual grants, legacy reconciliation evidence and the non-freezing current-period treatment of unsettled prior periods.

## Preserved host behavior

Existing LINE handlers, existing functions, environment variables, cron path and schedule are retained. New code uses only `HGE_SSO_ENABLED` and `HGE_SSO_SERVICE_ACCOUNT_JSON`; it does not reuse LINE or Supabase secrets. No dependency is added. Existing production traffic continues to the existing handlers.

## Actual deployment prerequisites

The existing Vercel project `nexus-line-bot` was read-only checked on 2026-10-22: `HGE_SSO_SERVICE_ACCOUNT_JSON` is absent. Never paste a private key into a PR, source file, browser page or chat. A reviewed server credential must be configured as a Vercel Sensitive environment variable through the secure deployment settings. This implementation accepts a service-account JSON in that server variable; workload federation is not implemented here. No key was created/downloaded or IAM grant made in this change.

The server refuses to read or write business data while HR rules grant any direct client access. It expects a server-only ruleset:

```json
{"rules":{".read":false,".write":false}}
```

**Do not apply this to the current live pages.** They still require direct access. This server-only proxy design is an alternative to the per-project custom-token/projection design in mainmanagement PR #9, not a drop-in backend for that candidate client bridge. Mixing the two would fail the strict rules gate.

Private schema required before activation, after rules are protected or in a private staging copy:

- `_security/principals/{existingAuthUid}`: active, role (staff/manager/ceo), positive version, original employeeKey, original typed employeeId, modules.hr=true, explicit approvals.
- `_security/devices/{uid}/{originalDeviceId}`: active and reviewed publicJwk (public EC P-256 only).
- `_security/requestScopes/{uid}/{originalRequestKey}=true` for manager review.
- sessions/challenges/rates are server-owned. `_sso/operations` and `_sso/audit` are also server-owned. Neither namespace may be seeded into a publicly writable tree.

No production mapping values belong in this public repository. No mapping is inferred from the observed synthetic UID hashes or employee names.

## Remaining work before either rules cutover

1. Secure backend credential and verified private UID/employee/device mapping. Back up both data trees and rules to private storage, then verify restoration in isolation.
2. Preserve legacy alias/password login through a server-side mapping to existing Auth accounts. The helper currently expects an existing authenticated token; alias resolution/migration is not implemented.
3. Wire the latest portal and HR pages to the gateway. Preserve their latest UI, employee lifecycle, delegation editor, device approval/revocation, annual reconciliation, closure and work-log flows. This change deliberately does not ship the old ZIP's replacement HTML or its device-removal behavior.
4. Implement and validate mainmanagement data/admin endpoints and its separate rules cutover. This gateway currently accesses **only HR RTDB**, authenticating the mainmanagement UID on the server. It does not require reusing anonymous HR Auth users or signing a mainmanagement token into the HR SDK.
5. Verify all module data paths, independent legal-practice accounting, Apps Script/NAS/automation consumers, employee/manager/CEO operations and rollback against a deidentified staging copy.
6. Only when these checks pass: coordinated client release, protected ACL bootstrap, rules deployment and unauthenticated negative checks. Do not restore public rules as an everyday rollback mechanism; use a maintenance state and an already protected prior version.

The user's later instructions authorize implementation and necessary validation. There is no additional blanket approval requirement in this document. Missing deployment credentials and unverified compatibility are actual technical blockers, not a request for the user to approve the same work again.

## Validation

`npm run test:sso`: 23 synthetic tests initially passed on Node 24. Includes actual local HTTP, WebCrypto client signing, gateway policy, CAS data and receipt/readback. Does not claim production login, production writes or full current HTML regression coverage. Use the repository's normal `npm test` for existing LINE tests as well.

Official references:
- https://firebase.google.com/docs/auth/admin/verify-id-tokens
- https://firebase.google.com/docs/reference/rest/auth#section-get-account-info
- https://firebase.google.com/docs/database/rest/save-data#section-conditional-requests
- https://firebase.google.com/docs/database/security
