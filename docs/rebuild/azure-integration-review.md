# Azure Integration Skill Review

2026-11-16. Required companion for F19/F20, G9/G10 and C01/C02/C11/C12.
User explicitly requested use of the supplied azure-integration skill. Read the
entire supplied file and applied its security checklist to the current candidate.
This is an integration guide, not permission to alter a tenant or grant consent.

Source: AZURE INTEGRATION SKILL (1).md, SHA256
`4640c2c6c14a24b261e7f9a0c183bddf1958ab5a3886d62408af7e635f41d81a`.
Its referenced references/azure-portal-setup.md was not supplied; do not claim
that missing reference was read. Current Microsoft primary documentation is used
to resolve version-specific differences rather than guessing its contents.

## Applied Checklist

| Skill Requirement | Candidate Evidence / State |
| --- | --- |
| Public SPA, PKCE and SDK-owned tokens | MSAL Browser 5.29.1; no custom OAuth exchange or client secret. Tokens exist in memory only as needed for Graph Authorization; no manual persistent token store or extraction during QA |
| sessionStorage rather than localStorage token cache | src/cloud/auth.ts config; SDK initialization is lazy and optional |
| PII-safe logging | piiLoggingEnabled false and logger callback emits nothing. Provider response bodies and preauthenticated download addresses are not logged |
| Minimum file scope | Files.ReadWrite only; no User.Read request because profile API is not used, and no Files.ReadWrite.All |
| Explicit account-bound token acquisition | Captured homeAccountId, acquireTokenSilent, account identity check; local disconnect is clearCache for the selected account |
| No popup for network/autosave failures | Token path never opens a popup; explicit Connect action only. Interactive mutex and stale-operation cancellation are covered |
| Sanitized filenames / no traversal | Reject invalid names before any token/request, append bounded .slinker, encode path segments. Reject rather than silently rewrite names; conditional identity-based writes/rename/delete |
| Exact registered redirect | Screenshot showed localhost:5173/LinkageStudio/redirect.html, not 127.0.0.1. Candidate opened on localhost:5187. Microsoft localhost port exception applies; no wildcard or Azure change |
| Offline project resilience without storing credentials | Account/project-isolated IndexedDB cache and pending revision journal, not the skill's single localStorage backup. No blind reconnect overwrite |
| CSP script/object/connect restrictions | OPEN hardening item AZ-01: no CSP is configured by this candidate. Do not describe the security checklist as fully passed |
| Preserve non-interaction token failure classification | OPEN UX item AZ-02: auth adapter/transport currently sanitize token acquisition failures to auth. No unexpected popup occurs, but network failures can be mislabeled as reconnect-required |

## Version-Specific Adaptations

- Keep guest editing independent of MSAL availability. Do not block App render
  behind auth initialization or add msal-react solely to match an example: this
  implementation uses the SDK behind its tested CloudAuth boundary.
- The skill shows an editor-root redirect and handleRedirectPromise before
  render. Current popup flow instead uses a dedicated redirect.html with only
  broadcastResponseToMainFrame. This is the MSAL v5 bridge contract, not a missing
  copy of the old full-page redirect flow. Do not add a router or second response
  consumer to that callback.
- Do not copy the example CSP verbatim: its connect-src omits the preauthenticated
  Microsoft download hosts and would block cloud reopen. The checklist's literal
  no-wildcards rule also differs from its own wildcard login-host example. AZ-01
  requires an explicit deployment policy and tested provider-owned download-host
  rules, production popup/silent-renew/PWA/image tests, and a negative blocked
  destination test. A meta CSP cannot supply frame-ancestors; use hosting headers
  for anti-framing requirements. No new permission/security broadening is implied.
- No online-event listener automatically uploads a stale backup. Preserve captured
  ETags, explicit opt-in autosave and offline conflict choices.

## Verification And Follow-Up

See evidence/g9/live-qualification.md for actual disposable-file checks, the
projected-metadata download failure, its repair and remaining live/device limits.
Original user models were not uploaded for this qualification. No original cloud
file was opened, overwritten, renamed or deleted.

AZ-01 and AZ-02 are explicit follow-up hardening tasks, not fabricated passing
checks and not changes silently included in the download compatibility repair.
No production deployment or full security certification is claimed.

Primary references checked 2026-11-16:

- [MSAL v5 redirect bridge](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/redirect-bridge)
- [MSAL initialization](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/initialization)
- [Redirect restrictions / localhost matching](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url)
- [DriveItem metadata](https://learn.microsoft.com/en-us/graph/api/driveitem-get?view=graph-rest-1.0)
- [JavaScript download flow](https://learn.microsoft.com/en-us/graph/api/driveitem-get-content?view=graph-rest-1.0)
