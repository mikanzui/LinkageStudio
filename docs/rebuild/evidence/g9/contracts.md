# G9 Cloud Contracts

2026-11-16. Shared types in candidate src/cloud/types.ts, frozen for scoped work.
Lead owns auth, controller, UI, shared types and integration. Worker outputs stay
in exclusive ignored packages until reviewed. No live account writes are authorized.

## OneDrive Transport

Factory createOneDriveClient({accountId, token, fetch?}) returns CloudPort.
Token getter is bound to that account; caller changes account by replacing client.
GraphItem fields are driveId/id/name/eTag/lastModifiedDateTime/size. IDs and ETags
are required; validate/clones responses. CloudError carries a stable code/status,
not raw token, preauthenticated URL or provider error-body diagnostics.

- Existing folder remains Documents/LinkageStudio. Listing is read-only: absent
  folder is empty, not an implicit write. Folder creation only belongs to explicit
  create. Only actual 404 permits creation; 401/403/etc do not.
- Enumerate bounded pages/items, reject cycles and invalid nextLink destinations
  before obtaining/sending tokens. Tokens only go to exact Graph origin/v1.0 and
  expected listing path. Encode every path segment; never interpolate filenames
  or IDs as URLs. Files are .slinker, case-insensitive.
- Create must request conflictBehavior=fail. Save updates immutable drive/item ID
  with the captured If-Match ETag, never a filename overwrite. Rename/delete also
  send If-Match; 409/412 produce conflict, 404 is missing, 401/403 auth, 507 quota.
  Do not retry ambiguous writes or automatically refresh a stale ETag and retry.
- Load metadata + preauthenticated download without bearer/cookies on download
  hosts (browser CORS-compatible); require safe HTTPS, bounded body/character count
  and a consistent metadata ETag check around content acquisition. Never expose
  the preauthenticated URL through DTOs/logs. Invalid/future project interpretation
  belongs to the canonical codec, not destructive transport migration.
- Requests support AbortSignal and a finite request timeout. No unbounded retry,
  popup, browser store dependency, automatic account mutation or live credentials.

Primary references: Graph driveItem resource, small upload, download, child list,
update and delete. Small-upload documentation omits some conditional-header detail;
actual service conditional semantics still require real-account qualification,
not a stronger guarantee inferred from mock tests.

## Local Cloud Cache

Factory createCloudCache() returns CloudCache. Lazy IndexedDB database
linkage-studio-cloud-cache, version1; no relationship to or deletion of G8 recovery.
Identity is JSON-tuple(accountId,driveId,itemId), never filename or account label.

CloudCacheRow stores confirmed text/item, revision/updatedAt, optional pending
text/projectName, and optional remoteDeleted. Cached item ETag remains the base
version for pending content. CloudCacheMetadata excludes both text payloads and
reports hasPending/remoteDeleted. Do not persist credentials or invented auth state.

list(accountId,limit=100) returns newest metadata for only that account (bounded
1..100). read returns a clone/null; write validates/clones and atomically accepts
only strictly newer revisions; remove requires exact revision and returns false
on mismatch. True means transaction committed, not request success. Two tabs and
late completions cannot clear a newer journal. No automatic eviction or silent
corrupt-schema recreation. Quota/blocked/unavailable/corrupt failures propagate;
timeout/close/versionchange resource ownership must be tested.

Use document's 32-million-character text limit and finite bounded metadata. Remote
deleted copies remain distinguishable from writable cloud projects. Cache is local
plaintext project storage, not an authentication/security boundary or cloud save.

## UI And Controller

Guest mounts independently. Explicit sign-in/account choice owns interaction;
silent auth failures never create popups. Each asynchronous operation captures
account plus project session/generation. Confirmed cloud completion may mark only
its captured baseline; new edits and replaced projects remain untouched.

Persist pending text before bound-project upload; one in-flight plus coalesced
pending snapshot, no simulation frame writes, defer active cancellable gestures.
Opt-in autosave begins only after confirmed first save. Account/project changes
detach old bindings. Reconnect uses the captured ETag and preserves conflict data.
Conflict choices are keep local as a new copy or explicitly open remote, never
silent force overwrite. Local Save and G8 recovery remain independent escape paths.
