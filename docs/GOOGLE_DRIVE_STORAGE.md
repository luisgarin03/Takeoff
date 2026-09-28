# Optional Google Drive File Storage

Implementation report, 2026-09-27. Local implementation and automated tests are
available. **Not deployed or live-accepted.** No production migration, Google
consent, or real cross-account transfer was performed by this change.

## Architecture Discovered

The existing React app saves projects and original PDFs in IndexedDB, exports
portable `.otk` archives, and serializes board assets in annotations/revisions.
The Supabase integration authenticates users, saves JSON state with version/CAS
checks, maintains memberships, hashes binary files with SHA-256, and uses a private
Storage bucket. `projectState.js` already includes original plans and whiteboard
assets from both current annotations and saved revisions in one deduplicated
manifest. `sync.js` saves locally first and records the successful cloud version
before uploading files. Cloud Open verifies bytes and imports a separate local
workspace with the existing sheet identifiers and coordinate data.

The older optional `google/auth.js`, Drive project database, Sheets integration,
and composite store are separate systems. They are not replaced and their broader
scopes are not requested by this new connection. Supabase Google Sign-In likewise
remains separate from Connect Google Drive.

## Chosen Sharing Model

Google Drive holds the owner's **private binary files**. Supabase still holds
auth, profiles, projects, members, versions, state and file manifests. An
authenticated `otk-drive` Edge Function proxies bounded file chunks using the
owner's server-side Google connection. It verifies the Supabase JWT with
`auth.getUser(token)`, then checks current project membership for every operation.
It never trusts a body-supplied user ID, a client-provided Drive file ID, or a
client-provided resumable upload URL.

This intentionally avoids Google-email-based ACL sharing. A collaborator's
Supabase email can differ from their Google email, and they do not need to
connect Google Drive at all. Owner/editor can upload; viewers can download only;
outsiders cannot retrieve file metadata or bytes. Files are not made public.
Moving a file within the owner's Drive does not change its canonical Drive ID.

Removing a Supabase member denies their next chunk/request. Downloads recheck
membership before returning bytes fetched from Google. There are no collaborator
Drive permissions to synchronize or revoke. Already delivered or cached bytes
cannot be recalled, and bytes already in flight cannot be guaranteed recalled.
If the owner separately shares/moves files into shared folders in Google Drive,
those independently granted permissions are outside OpenTakeoff's control.

**Cost tradeoff:** this saves Supabase Storage capacity, not Supabase network
bandwidth. Proxy downloads consume Edge Function egress and invocations, uploads
also require invocations, and the owner's Google storage/request quotas apply.
Do not enable this expecting unlimited free transfer. See official
[Supabase egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress),
[function limits](https://supabase.com/docs/guides/functions/limits), and
[function pricing](https://supabase.com/docs/guides/functions/pricing).

## Schema And Security

Apply existing migration `202609270001_optional_cloud.sql` first, then the new
**`supabase/migrations/202609270002_drive_files.sql`**, in staging before production.
The second migration is additive; no existing data/tables are recreated.

- Projects gain `file_provider` (default `supabase`) and `file_provider_locked`.
- Files retain `(project_id, sha256)`, name, MIME, size, generated storage path,
  created time and `uploaded`; gain provider, stable file/folder IDs, owner and kind.
- Three RLS-enabled server-only tables hold Drive connections, single-use OAuth
  attempts, and encrypted resumable URLs/short transfer leases.
- Authenticated/anonymous users have no access to those credential tables or
  backend-only RPCs. The Edge admin client is the only consumer.
- Provider selection requires project ownership and a connected Drive account.
  Registration locks the provider. Existing projects with file rows are locked
  to their existing Supabase provider. No automatic provider migration occurs.
- Client `otk_finish_file` cannot mark a Drive upload complete; the backend first
  verifies Google-reported ID, SHA-256, size and MIME.
- Existing file-manifest RLS remains; legacy Storage policies additionally require
  a Supabase-backed file row. A Drive row cannot authorize a Storage upload.
- Project purge waits for cloud file cleanup and active transfer leases. Drive
  cleanup trashes binaries rather than permanently deleting them. Empty app-created
  folders can remain. Trash may continue using Google quota until emptied by its owner.

Refresh tokens and resumable session URLs use AES-GCM encryption at rest, with
owner/project identity as authenticated data. The encryption key lives only in
Edge secrets. Keep a secure backup; changing/loss of the key requires a deliberate
reencryption/reconnection plan. Access tokens are obtained as needed, never sent
to the frontend or persisted in ordinary browser storage. Reconnecting another
Google identity is rejected to avoid silently orphaning existing files.

## Google Cloud Console Setup

Do this manually only after reviewing the cost/security model above. **Never send
client secrets, refresh tokens or service-role keys in chat.** No secrets are
needed to run the local tests.

1. Use a **separate Google Cloud project for Drive**, distinct from the project
   used by Supabase Google Sign-In. Enable Google Drive API in that project.
2. Configure the OAuth consent screen, authorized app domain, support/contact
   details and appropriate publishing/testing access for the intended users.
3. Create a **Web application** OAuth client in the dedicated Drive project for
   the server-based flow. A second client in the same project is not sufficient
   to isolate Google grant revocation.
4. Add this exact authorized redirect URI, replacing the project reference:
   `https://PROJECT.supabase.co/functions/v1/otk-drive?action=callback`.
5. Request only `openid`, `email`, and
   `https://www.googleapis.com/auth/drive.file`. No full Drive scope, Google Sheets
   scope, service account, paid compute service, or public sharing is needed.
6. Add test users while the consent app is in Testing. For an External app in
   Testing that requests Drive access, refresh tokens expire after seven days.
   Reconnect during testing; review publishing/verification before broader use.

**Revocation scope:** Google documents token revocation as removing that user's
OAuth grants across all clients in the same Google Cloud project. Therefore the
Drive project must be separate to keep its Disconnect operation from revoking
Google grants used for sign-in. This does not imply remote deletion of an existing
Supabase session or any local project. See [Google token revocation](https://developers.google.com/identity/protocols/oauth2/web-server#tokenrevoke)
and [refresh-token expiration](https://developers.google.com/identity/protocols/oauth2#expiration).

The backend requests offline access, consent/account selection, random single-use
state with ten-minute expiry, and S256 PKCE. The callback exchanges the Google code
on the server, pins verified Google identity, stores an encrypted refresh token,
and redirects only to an allowlisted web origin or the exact native callback.
Browser/native return URLs contain only a result flag, never a Google code or token.
Canceled, superseded and disconnected connection attempts cannot reconnect later.

References: [Drive scopes](https://developers.google.com/workspace/drive/api/guides/api-specific-auth),
[server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server),
[resumable upload](https://developers.google.com/workspace/drive/api/guides/manage-uploads),
[file metadata](https://developers.google.com/workspace/drive/api/reference/rest/v3/files).

## Supabase And Environment Setup

No new frontend environment variables or Google credentials are needed.

| Variable | Location | Classification |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | ignored `web/.env.local` / web host | Public |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | same | Public, never secret/service-role |
| `OTK_DRIVE_CLIENT_ID` | Edge secrets | Public identifier, kept server-side |
| `OTK_DRIVE_CLIENT_SECRET` | Edge secrets only | Secret |
| `OTK_DRIVE_TOKEN_KEY` | Edge secrets only | Secret: 32 random bytes, base64 |
| `OTK_DRIVE_CALLBACK_URL` | Edge configuration | Public exact HTTPS callback |
| `OTK_DRIVE_ALLOWED_ORIGINS` | Edge configuration | Public exact-origin allowlist |
| `SUPABASE_URL` | hosted Edge runtime | Managed public URL |
| `SUPABASE_SERVICE_ROLE_KEY` | hosted Edge runtime only | Managed backend secret |

The placeholder template is `supabase/functions/.env.example`. `.env` and
`.env.*` are already gitignored, except `.env.example`. Never prefix a secret with
`VITE_`. The existing public-only frontend configuration checks remain in place.

1. Apply the additive migration in a staging project; verify existing cloud access.
2. Open the staging project's **Edge Functions > Secrets**, enter the five
   `OTK_DRIVE_*` names above, and save their values privately. Generate the token
   key as 32 cryptographically random bytes encoded in base64; retain a secure
   backup. The hosted runtime supplies `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY`; do not add or expose these as frontend variables.
   Supabase reserves the `SUPABASE_` secret prefix. See [Edge secrets](https://supabase.com/docs/guides/functions/secrets).
3. Set allowed origins explicitly, for example localhost/127.0.0.1 with the actual
   dev port, the stable Vercel HTTPS origin and `https://localhost` for standard
   Capacitor Android. No wildcard preview origins. Add approved previews explicitly.
4. Deploy `otk-drive` only after approval. `supabase/config.toml` disables the
   gateway JWT check **for this function only**, because Google must reach its
   callback without a Supabase JWT. All other routes require a verified user JWT
   in the implementation. Do not remove that manual authentication.
5. Keep the existing Supabase Google login provider/redirect settings unchanged.
   The new Google Drive callback is a different server-owned OAuth flow.
6. Confirm CORS and the exact OAuth redirect before attempting a real upload.

Missing Edge setup produces a disabled Drive connection control. Existing
Supabase Storage/local-only projects continue working even before migration 002
and the Edge Function are enabled. Never supply a secret just to remove that UI message.

## File And Transfer Behavior

Folder structure uses app-owned folder markers and private folders:

```text
OpenTakeoff/projects/<project_uuid>/originals/<sha256>
OpenTakeoff/projects/<project_uuid>/whiteboard/<sha256>
OpenTakeoff/projects/<project_uuid>/attachments/<sha256>  (reserved for future attachment kinds)
```

Original name stays in Supabase metadata and the Drive description. Stable Drive
IDs, not URLs or human-readable names, identify files. A per-file lease prevents
concurrent writes; a pre-generated Drive file ID is saved before resumable creation.
Simultaneous first uploads may create empty duplicate folder containers, but the
project/hash row and stable ID prevent duplicate binaries. Unchanged uploaded
hashes are skipped on repeated Save.

Uploads save local state, then cloud JSON/version, then register/upload missing
files. Binary failures leave the saved takeoff state and originals intact. Google
uploads use 4 MiB chunks (a multiple of 256 KiB), encrypted persisted server sessions,
status probes after uncertain replies, limited retries and progress/cancel controls.
Retry Save after cancellation/interruption; it uses the last successful cloud
version and probes the persisted upload. A stale crashed transfer lease expires
after three minutes. Google session expiry starts a new session with the same
stable ID. Externally deleted completed files require owner restoration from Trash.
The Edge handler bounds each operation's Google calls to two minutes, shorter
than the database lease; individual Google requests have shorter timeouts.

Drive app limit: **2 GiB per file**, not a promise every phone can process that much.
Hashing/serialization/import still uses browser memory, so practical phone limits
can be substantially smaller. Existing Supabase **50 MB** limits, whiteboard
attachment limits and `.otk` size limits remain unchanged. Large binaries are not
stored in PostgreSQL or buffered whole in the Edge Function.

Cloud Open reads authorized state/manifests first, reuses matching current-workspace
bytes, or downloads missing files with the record's provider. Drive range downloads
are bounded to 4 MiB, validate metadata and verify the complete SHA-256 before
import. Interrupted chunks live in a separate disposable IndexedDB cache partitioned
by Supabase URL/user/project/hash; only complete verified files are marked reusable.
Quota/private-mode cache failures do not block downloads. Cached bytes are rehashed
when reused. Missing uncached files need internet and owner Drive access.

The existing importer creates a separate local workspace, preserving project ID,
sheet IDs, original names/page references, tabs/groups/bookmarks, takeoff vertices,
scales/calibration, markups and revisions. Board binaries are restored to their
existing asset IDs and base64 payloads before import, including revision-only assets.
No transient board UI state, PDF render resolution, transforms or measurement math
is changed. Once loaded locally, the workspace continues working offline.

## UI And Android

Cloud > Profile shows Drive status/email, Connect/Reconnect, Disconnect, Manage,
and a per-device/account default for **new** projects. Disconnect clears backend
access before attempting Google revocation; if Google cannot be reached, it tells
the user to revoke access in Google Account connections too. Shared projects using
that owner's Drive cannot fetch uncached files until reconnection.

Cloud > This project has explicit file storage selection. Once files are registered,
the provider is locked. Save As/Duplicate explicitly chooses a provider for a **new
project ID**, preserving the source. This is not an in-place migration. Upload and
download progress/cancellation is shown; errors never serialize token responses.

Web (localhost, Vercel, desktop/mobile Chrome): same-tab external Google redirect,
local-save flush first, return to the same workspace, then authenticated connection
status refresh. Electron `file:` origins are not supported by this new OAuth flow.

Capacitor Android: `@capacitor/browser` opens system Chrome Custom Tabs, not an
embedded Google login. `@capacitor/app` handles foreground and cold-start
`com.opentakeoff.app://drive-auth` links. The manifest matches only that host/scheme.
The local pending workspace ID is non-secret; the backend owns state/PKCE. Native
returns only trigger a server status refresh and never establish an app session.
The existing Supabase email/code session stays in use. **Supabase Google Sign-In
on native remains guarded; this bridge is only for Drive connection.**

Rebuild/install Android after syncing the plugins. Test a real Galaxy Z Fold with
process death, cancellation, background/foreground, orientation and network loss.
No physical device test or APK install was performed by this implementation.
References: [Capacitor App](https://capacitorjs.com/docs/apis/app),
[Capacitor Browser](https://capacitorjs.com/docs/apis/browser).

The toolbar Cloud icon is the user's requested bundled multicolor Google Cloud
artwork from `https://www.gstatic.com/cgc/super_cloud.png`. This is only an icon;
Google Cloud Storage is not the binary provider and no Google endorsement is implied.

## Changed Files

Created:
- `supabase/migrations/202609270002_drive_files.sql`
- `supabase/config.toml`, `supabase/functions/.env.example`
- `supabase/functions/otk-drive/index.ts`
- `supabase/functions/_shared/drive-{security,store,google,service}.js`
- `web/src/lib/supabase/{driveCache,driveConnection,driveFiles,projectFiles}.js`
- `web/src/brand/google-cloud.png`
- `web/test/{driveService,driveFiles,driveRls}.test.ts`
- This setup/implementation report.

Modified:
- `web/src/components/CloudProjects.jsx`, `web/src/styles/cloud.css`
- `web/src/lib/supabase/{CloudContext.jsx,errors.js,projects.js,sync.js}`
- `web/src/pages/TakeoffCanvas.jsx` (Drive return notification and Cloud icon only)
- `web/package.json`, `web/package-lock.json`
- `web/android/app/src/main/AndroidManifest.xml`
- Generated `web/android/{capacitor.settings.gradle,app/capacitor.build.gradle}`
- `README.md`, `CHANGELOG.md`, `docs/{USER_GUIDE,SUPABASE_SETUP}.md`
- `THIRD-PARTY-NOTICES.md` (requested cloud icon attribution)

## Automated Verification

Focused command from `web/`:

```text
node --import tsx --test test/driveFiles.test.ts test/driveRls.test.ts test/driveService.test.ts test/supabaseAuth.test.ts test/supabaseConfig.test.ts test/supabaseRls.test.ts test/supabaseSync.test.ts test/projectFile.test.ts test/whiteboard.test.ts test/whiteboardPdf.test.ts
```

Result: **77 passed, 0 failed**, including 25 new Drive tests. Coverage includes
connection/disconnection, PKCE/state/encryption, account mismatch, provider routing
and locking, legacy/local workflows, content deduplication, manifests, upload
completion/retry, cache/download retry/hash rejection, missing PDF recovery,
shared viewer/editor/outsider access and membership revocation, revoked Google
authorization, missing files, second-device restoration, board/revision restoration,
and no duplicate upload after repeated saves. SQL tests execute both migrations
against PGlite PostgreSQL with mocked managed auth/storage schemas, not a live project.

Frontend typecheck, ESLint, production build, and Deno Edge Function typecheck
and lint passed. Build retains the existing >500 kB chunk-size warning. `npx cap sync android`
completed and registered App/Browser/StatusBar; that is not a physical-device test.
The full suite ran **1009 tests: 995 passed, 14 failed**. Those 14 existing branding
expectations still expect `OpenTakeoff` while the configured display name is
`Estimating by Luis Garin` (brand/CSV/golden export/store error text). They were not
changed or hidden. Detailed local log: `output/drive-full-tests.log` (gitignored).

The actual account dialog was inspected at desktop and 390x844 mobile sizes,
including unavailable-backend status, disabled Drive connection/choice and preserved
Supabase selection. The bundled sample plan and colored toolbar icon were checked
in a separate local test workspace. No live cloud project was saved or modified.
`npm audit --omit=dev` reports five moderate advisories in existing React Router
and Capacitor CLI/xcode/uuid dependency chains; no forced major upgrades were made.

## Local Continuation Verification (2026-09-27)

This continuation resumed the existing working tree through Remote Desktop
Commander, rather than restarting the feature. Initial state: branch
`estimating-by-luisgarin-lab`, HEAD `7db8ed4`, 17 modified tracked files,
17 untracked files, and no staged changes. Root `AGENTS.md` was the only
repository instruction file found. Both staged and unstaged changes were reviewed.
The earlier verification section above is retained as the original session's
report; the following results were independently obtained in this continuation.

### Corrections and regression evidence

Four existing Drive files were edited, without replacing their implementation:
`web/src/lib/supabase/driveFiles.js`,
`supabase/functions/_shared/drive-google.js`,
`web/test/driveFiles.test.ts`, and `web/test/driveService.test.ts`.

- Await JSON response parsing inside the client's error handler, so a truncated
  upload reply triggers a saved-offset probe rather than bypassing safe retries.
- Reject missing or changed Supabase sessions before sending a Drive request.
- Bound retries when successful HTTP acknowledgements make no upload progress.
- Validate completion offsets before reporting an upload as successful.
- Treat HTTP 429 as a quota/rate-limit failure even when Google provides no body.

All five new regression tests failed before the source corrections, then passed.
The existing fixture was updated to include the authenticated user's ID; no
assertions were removed, skipped, or weakened to hide the reported failures.

### Independently rerun checks

| Check | Result |
| --- | --- |
| Existing focused suite before changes | 77 passed, 0 failed |
| Five added regressions before source fixes | 5 failed (29 total; 24 passed) |
| Focused suite after fixes | 82 passed, 0 failed |
| Full suite before changes | 1,009 total; 995 passed; 14 failed |
| Full suite after fixes | 1,014 total; 1,000 passed; the same 14 failed |
| Lockfile validation, frontend typecheck, ESLint | Passed |
| Production web build | Passed; existing large-chunk warning remains |
| Deno Edge Function check and lint | Passed |
| Isolated desktop/mobile browser smoke test | Passed with mocked cloud responses |
| Android Java compilation and manifest processing | Passed; not an APK install or device test |

The exact set of 14 full-suite failures was compared before/after and is
unchanged. They are existing app-branding expectations in branding, report/CSV,
RFI, shape/sheet export, and store tests (`OpenTakeoff` versus the configured
`Estimating by Luis Garin` name). Those tests and the branding were left intact.
Consequently the complete `npm run check` gate is still not green; build was
also run independently so those failures could not mask a build error.

Commands were run from `web/` using Node 24.15.0 and npm 11.14.1:
`npm run check:lockfile`, `npm run typecheck`, `npm run lint`, `npm test`,
and `npm run build`. The focused command immediately above is unchanged.
Deno 2.9.6 checked `supabase/functions/otk-drive/index.ts` with
`--no-lock --node-modules-dir=none`, then linted the entry and four shared files.

A fresh headless Chrome context used localhost port 5197 and a dummy
`https://drive-review.invalid` backend. All cloud responses were mocked and
other external browser requests blocked. Checks covered bundled sample-plan
rendering, email sign-in UI, unavailable Drive setup, disabled Drive selection,
connected status, explicit new-project/default and Save As provider choices,
390x844 mobile layout without horizontal overflow, and an OAuth error return
that preserves the workspace and removes the callback flag. No uncaught page
errors or project write requests occurred. The mobile screenshot was inspected.
This is UI verification, not real authentication or live cloud acceptance.

Android validation ran from `web/android`:

`gradlew.bat :app:compileDebugJavaWithJavac :app:processDebugMainManifest --no-daemon`

JDK 21 and the existing Android SDK were selected only in that process's
environment. An initial missing SDK-path error was resolved without editing
project settings. Offline resolution then exposed an uncached
`androidx.browser:browser:1.9.0` artifact; allowing normal dependency resolution
completed the build successfully. No Gradle upgrade, plugin resync, APK install,
physical-device test, or system environment change was performed.

Logs, browser screenshots/scripts, pre-edit copies, a baseline hash inventory,
and before/after failure comparison are retained outside the repository at:
`%TEMP%\otk-drive-review-20260927`. Existing `output/` logs were not overwritten.

### Still approval-gated / not verified live

No commit, push, deployment, remote migration, real Google consent, live project
write, two-account/two-device transfer, or physical Android OAuth return was
performed. The live acceptance sequence below remains required. No secret or
credential file contents were printed. Existing local/Supabase workflows,
manifest serialization, whiteboard assets, geometry and PDF rendering code were
not changed by this continuation.

## Final Local Readiness Review (2026-09-27)

A fresh Remote Desktop Commander inspection again found branch
`estimating-by-luisgarin-lab`, HEAD `7db8ed4`, 17 modified tracked files,
17 untracked files, and nothing staged. Applicable instructions, both diffs,
package scripts, lockfile validation, source, migration and tests were reviewed.
The earlier verification sections are historical; this section records the latest run.

This pass changed only the Drive client, its existing test file, this guide,
and `CHANGELOG.md`. Four additional regression tests first failed against the
existing source, then passed after targeted corrections:

- Validate a begin response before accessing `done`, including null/malformed replies.
- Preserve authentication, access, size and quota errors when a gateway response
  has no usable application error code, including empty and JSON-null bodies.
- Recheck cancellation after consuming a response body, before reporting success.
- Recheck the current account after consuming a body, before returning its payload.

No serializer, canvas, whiteboard, provider routing, Android source, database schema,
RLS policy, dependency declaration or existing branding expectation was changed.
The setup section was corrected to require a separate Google Cloud project for
Drive grant/revocation isolation, not merely a second OAuth client. It now also
explains seven-day External/Testing token expiry and Dashboard secret placement.

### Latest verification results

| Check | Latest result |
| --- | --- |
| Full suite before this pass | 1,014 total; 1,000 passed; 14 failed |
| Four added client regressions before fixes | 4 failed; the previous 13 client tests passed |
| Focused Drive/cloud/project/whiteboard suite after fixes | 86 passed, 0 failed |
| Full suite after fixes | 1,018 total; 1,004 passed; the same 14 failed |
| Lockfile validation, frontend typecheck and ESLint | Passed |
| `npm run check` | Failed at the full-test step; existing branding failures |
| Separately executed production build | Passed; existing large-chunk warning |
| Deno Edge Function check and lint | Passed |
| Desktop/mobile browser smoke test | Passed with mocked cloud responses |
| Android Java compilation and manifest processing | Passed offline using cached build inputs |

The exact 14 failing test locations were compared before/after and match. Their
branding expectations were not changed or skipped. Build was run separately
because the combined check command stops at the failing full suite.

The focused command in the original verification section still applies. The
complete gate was actually run as `npm run check`; production output was then
built with `npm run build`. Deno used `check --no-lock --node-modules-dir=none`
on the Edge entrypoint and linted it plus the four shared modules. Android used
`gradlew.bat :app:compileDebugJavaWithJavac :app:processDebugMainManifest --offline --no-daemon`
with process-local JDK 21 and Android SDK paths. All 81 Android tasks were already
up to date; this verifies the unchanged native build, not installed APK behavior.

The fresh browser context used localhost port 5198, dummy public configuration,
and mocked responses from `https://drive-review.invalid`; other external browser
requests were blocked. It checked sample-plan canvas rendering, sign-in UI,
unavailable/connected Drive status, provider choices and Save As, 390x844 mobile
layout, and an OAuth error return preserving the workspace. No uncaught page
errors or cloud-project write requests occurred. This is not live authentication.
Existing exact-callback validation tests ran; physical Android cold-start,
background/foreground and real consent-return behavior still require device tests.

Latest logs, screenshots, the browser script, pre-edit copies of the reviewed
files, and the exact full-suite failure comparison are in:
`%TEMP%\otk-drive-final-20260927`. Earlier verification files were not overwritten.

### Configuration boundary

No live setup was inspected using credentials, and no live account configuration
is claimed complete. Before real acceptance, the operator must configure the
dedicated Google project/client and exact HTTPS callback, review/apply only missing
migrations in staging (`202609270001_optional_cloud.sql`, then
`202609270002_drive_files.sql`), set the five backend `OTK_DRIVE_*` variables, deploy
`otk-drive` with its shared modules and existing per-function configuration, and
supply the two public Vite Supabase values on the intended host. Each deployment
or remote migration remains approval-gated. No new migration was needed.

No commit, push, deployment, remote migration, production data change, real Google
consent, APK install or physical-device test was performed. The two-user/two-device
acceptance sequence below remains mandatory; mocked success is not live acceptance.

## Exact Live Acceptance Test (Not Yet Run)

### Latest continuation verification (2026-09-27)

This continuation began on `estimating-by-luisgarin-lab`, HEAD `7db8ed4`, with
17 modified tracked files, 17 untracked files, and nothing staged. Existing work
was preserved. The client now rejects null download metadata as an integrity
error and rechecks cancellation/account identity after the final IndexedDB write.
Three new tests reproduced these failures before the fixes and pass afterward.

Fresh results: 89 focused tests passed; the full suite has 1,021 tests, 1,007
passed and the same 14 pre-existing branding failures (before: 1,018 total,
1,004 passed, 14 failed). Failure names were compared and are identical.
`npm run check` passed typecheck and ESLint, then stopped at those test failures.
Separate lockfile validation and production build passed (existing large-chunk
warning). Deno Edge check/lint passed. Android Java compilation and manifest
processing passed offline with process-local JDK 21/SDK paths (81 tasks up to date).
The reused browser smoke test passed against localhost port 5207 with dummy
configuration and mocked cloud responses; desktop sample rendering, Drive
status/provider/Save As controls, 390x844 mobile layout and OAuth error return
were checked. The mobile screenshot was visually inspected.

No new migration, secret access, remote data change, consent, deployment, commit,
push or physical-device verification occurred. These results are local only.
Logs and pre-edit evidence are in the current Codex chat's `work/drive-review`
directory. The following live acceptance sequence is still required.

Use a staging Supabase project, separate confirmed users A/B, and two genuinely
separate browser profiles/devices. Keep a source `.otk` backup. Record project UUID,
cloud version, file hash/size/provider/ID and sheet counts without recording secrets.

1. A/Device A: sign in with existing Supabase auth. Connect Drive in Profile using
   A's Google account. Verify the connected email; verify no public Drive sharing.
2. Import Architectural.pdf, Structural.pdf, Electrical.pdf (include one >50 MB).
   Calibrate a sheet, draw takeoffs/markups, set bookmarks and tabs/groups. Add an
   image and PDF to Whiteboard, move/resize them, and save a revision.
3. Explicitly select Google Drive for this new cloud project. Save to Cloud. Watch
   filenames/MB/progress; inspect private hash-named files and uploaded manifests.
4. Save again unchanged. Verify the same project UUID, a new state version, and
   identical file IDs with no duplicate binary uploads.
5. A shares the project with B as viewer through the existing Share control.
   B's Supabase email should deliberately differ from A's Google email. B does
   not connect Google Drive or receive separate Google file permissions.
6. B/Device B: sign in, Browse projects > Shared With Me > Open. Verify automatic
   downloading, complete sheets/PDF rendering, original IDs/page names/tab order,
   marks aligned with plans, identical scale/calibration/totals/bookmarks, and
   matching whiteboard assets/layout/revisions. No manual PDF import.
7. B attempts Save to Cloud: viewer denied. A changes B to editor; B edits a note
   and uploads a new allowed attachment. Verify access and owner storage. Test
   simultaneous state edits still produce the existing CAS conflict choices.
8. Interrupt A's large upload after several chunks, then retry Save. Verify resume
   and stable ID. Interrupt B's download, retry, and verify cached chunks are reused
   and full-file hash checked. Cancel each direction and retry without lost state.
9. Turn Device B offline with its loaded local workspace. Verify plans, marks and
   board remain usable. An uncached project should explain the network/access need.
10. A removes B. Close B's previous Cloud view and refresh. Verify membership gone,
    project no longer listed, and a fresh missing-file/range request returns 403.
    Use a third fresh profile or clear only the disposable test workspace/cache to
    avoid mistaking a previously cached copy for new access. Existing local copies
    legitimately remain readable; no remote recall is claimed.
11. Re-share and test owner Google revocation/disconnect, quota/network failures,
    moved file (stable ID still works), trashed file (actionable missing-file error),
    wrong Google account reconnection (rejected), and tampered bytes (rejected).
12. Repeat connect, Open and interrupted transfer on Android using the rebuilt APK:
    system-browser consent, successful return, cancel/back, cold start and Fold
    rotation. Confirm saved geometry/scale are unchanged. Also repeat desktop,
    mobile Chrome and the exact allowed Vercel origin.
13. Test a disposable project's Delete/Finish deletion and active-transfer race.
    Verify owner-only cleanup, Drive Trash, no new member downloads and preserved
    local backups. Do not delete real projects for this test.

Only after this live sequence passes should the feature be called live-accepted.
Credentials, backend deployment, migration application and this two-user/device
sequence remain manual/approval-gated work. Nothing was committed, pushed or deployed.
