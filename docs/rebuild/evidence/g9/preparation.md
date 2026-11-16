# G9 Preparation

2026-11-16. F19/F20; comparisons C01/C02/C10/C11/C12. Read-only preparation
during G8 cumulative checks. No G9 implementation or acceptance yet.

## Existing Fork Comparison

Upstream has no Microsoft/cloud layer. The fork supplies a projects landing
page, Microsoft redirect sign-in, Documents/LinkageStudio listing, local entry,
open/delete/rename, first cloud save and optional debounced autosave. Preserve
those capabilities without making authentication a prerequisite for the editor.
The rebuilt editor remains the first screen; a work-focused project library can
be opened explicitly rather than replacing guest entry with a sign-in landing.

The root adapter writes by filename without an ETag guard, lists one page, and
creates the folder after any lookup failure. Its autosave uses global listeners,
an unsafe-for-identity 32-bit text hash, file-ID-only backups and retries all
errors. Avoid carrying these behaviors into the candidate. Existing source is
retained, not edited or treated as qualified.

## Required Contracts To Freeze At G9 Start

- Optional lazily initialized MSAL/browser provider. Guest mount/local files never
  await authentication. No background interactive popup or credential logging.
  Silent expiry becomes a named sign-in action; explicit user interaction owns
  popup/redirect choice. Preserve pending local work before any navigation.
- A cloud item is account + drive + item ID + ETag, not a filename. Conditional
  updates/rename/delete refuse stale versions. First creation must not overwrite
  a different same-named document. Failed/ambiguous writes never mark saved.
- Validate and constrain pagination/download destinations before sending bearer
  tokens. Follow Graph nextLink with a bounded cycle detector; no token forwarded
  to arbitrary or preauthenticated download hosts. Inspect primary API semantics
  before fixing the transport interface.
- Per-session/account ownership across every await, bounded/coalesced autosave,
  explicit opt-in after first successful save, and no simulation/active-gesture
  snapshots. New edits during a save remain pending/dirty.
- Account-scoped local cache/pending journal, base ETag and full canonical text.
  Offline reload/reopen/reconnect must preserve local changes and show conflicts,
  never blindly replay an old backup over a newer remote project. No credentials
  in project files, recovery records, diagnostics or browser test artifacts.
- Native named library/rename/conflict controls with keyboard/modal ownership,
  44px coarse targets and Split View reachability. Local save/recovery remain
  independent escape paths for expiry, quota, denied auth and offline errors.
- Domain mocked transport tests plus actual browser workflows using boundary
  mocks. Real-account qualification uses an explicitly authorized disposable
  project/account; no live writes or authentication automation assumed.

## Primary References Reviewed

- [MSAL initialization](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/initialization)
- [MSAL errors and interaction ownership](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/errors)
- [Token lifetime and browser restrictions](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/token-lifetimes)
- [Graph child listing and nextLink](https://learn.microsoft.com/en-us/graph/api/driveitem-list-children?view=graph-rest-1.0)
- [Graph upload-session conditional headers/conflict behavior](https://learn.microsoft.com/en-us/graph/api/driveitem-createuploadsession?view=graph-rest-1.0)

These references are not evidence that the old adapter's simple-upload calls are
conditionally safe. Verify the exact chosen endpoint, installed MSAL version and
redirect registration at implementation. Public client ID exists in root config;
registration ownership/allowed candidate redirect URI and real account remain
unqualified. No secret key is needed for a browser SPA.
