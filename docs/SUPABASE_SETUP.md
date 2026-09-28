# Optional Supabase Cloud

For the optional large-file Drive provider added after this initial Supabase implementation,
see [Google Drive storage](GOOGLE_DRIVE_STORAGE.md). It uses a separate secure connection,
additive migration 002, private Edge-mediated sharing and native Drive return handling.
The 50 MB bucket limit below continues to apply to Supabase Storage, not Drive files.

## Current status

The optional integration is implemented locally. No migration, account creation,
cloud file upload, Git commit/push, or Vercel deployment was performed for you.
The supplied public configuration was read successfully on 2026-09-27. The hosted
Auth settings endpoint returned HTTP 200 with email enabled. `otk_projects` was
not yet available through the Data API (PGRST205). Apply the migration below
before testing cloud projects. Live end-to-end account/storage tests remain open.

## Environment configuration

Use `web/.env.local`:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_PUBLIC_KEY
```

Use the **publishable** key from your Supabase project, never the secret key,
service-role JWT, database password, or personal access token. These two values
are public browser configuration. RLS and the user's session provide access
control; hiding the publishable key is not a security boundary.

The existing root `.gitignore` ignores `.env` and `.env.*` everywhere, except
`.env.example`. `web/.env.example` contains blank placeholders. Vite automatically
loads `.env.local` from `web`; restart Vite after editing it. Deployment variables
can override the file. The pre-bundle check rejects secret/service-role keys in
`VITE_SUPABASE_*` configuration without printing their values. An empty config
disables the client completely. Invalid config never makes local mode unusable.
Keep `.env.local` out of Git even though this integration uses only public values.

## Supabase dashboard setup

1. Keep the project on the Free plan. Do not enable paid add-ons for this feature.
2. In SQL Editor, review and run
   `supabase/migrations/202609270001_optional_cloud.sql` once against your intended
   project. It creates only new `otk_*` tables/functions and the dedicated private
   `otk-project-files` bucket/policies. It is not a rerunnable reset script.
   If you use Supabase CLI migrations instead, apply this same versioned file
   through your normal migration workflow, not a second copy in SQL Editor.
3. Confirm RLS is enabled on all four `otk_*` tables. Leave the bucket private.
   Do not add public or broad storage policies to make an error disappear.
   Existing permissive storage policies are combined with new ones; audit any
   policies already present in a reused Supabase project.
4. Enable Email/password authentication and email confirmation. Configure the
   app's production HTTPS Site URL and appropriate development redirect URLs.
5. In Auth email templates, change **Confirm signup** and **Reset password** to
   include `{{ .Token }}` as a readable code. For example:
   `<p>Your OpenTakeoff verification code is <strong>{{ .Token }}</strong>.</p>`
   The app uses `verifyOtp` with signup/recovery types, not link redirects.
   Do not rely on the default link-only templates with this implementation.
6. For users outside your Supabase team, configure a suitable SMTP provider.
   The default service is testing-only, limited to authorized team addresses
   and currently two messages/hour. Provider/domain costs are separate from
   Supabase; check them before choosing a provider. See the official
   [SMTP guide](https://supabase.com/docs/guides/auth/auth-smtp) and
   [email templates guide](https://supabase.com/docs/guides/auth/auth-email-templates).
7. Restart the app, create test accounts, and run the live checklist below.
   Never enter a secret key in the app to work around permissions.

## Google sign-in

The Cloud sign-in and signup forms offer **Continue with Google**. The button
uses `signInWithOAuth({ provider: 'google', options: { redirectTo } })` through
the existing auth adapter. It does not use the separate Google Drive login or
its client ID. Do not add a Google Client ID/Secret to frontend code or Vite
variables; the Supabase Google provider owns those credentials.

In Supabase **Authentication > URL Configuration**, allow the origins where the
app actually runs. The redirect preserves the current path and workspace query,
adding `otkGoogle=1`. For example, allow `http://localhost:5173/**` for development
and `https://YOUR-EXACT-APP.vercel.app/**` for that specific deployment. Add other
local ports, `127.0.0.1`, production custom domains, or named preview hosts only
when you use them. Do not allow arbitrary third-party hosts. Keep the Site URL
on your production origin. The Google Console callback remains Supabase's
`https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`, not your app URL.
See [Supabase Google auth](https://supabase.com/docs/guides/auth/social-login/auth-google)
and [redirect allowlists](https://supabase.com/docs/guides/auth/redirect-urls).

The client uses PKCE with automatic URL detection disabled. CloudProvider
explicitly exchanges the returned code exactly once, sharing the promise across
React StrictMode/remounts. It removes callback parameters from browser history,
preserves `localProject`, waits for initialization, then reopens Cloud with the
restored session or a sanitized retry/cancellation message. Sessions still use
the SDK's existing persistence and token refresh. Email verification and recovery
continue to use typed codes. See [PKCE](https://supabase.com/docs/guides/auth/sessions/pkce-flow).
Complete sign-in on the same origin/browser/device; overlapping sign-ins in
multiple tabs can invalidate an older PKCE verifier. A failed exchange never
clears local project data.

Capacitor currently has no App/Browser OAuth plugins or Android VIEW intent
filter/deep-link handler. Google blocks embedded WebView authorization. Therefore
the native button is disabled with an explanation, and email sign-in remains
available. Android Chrome supports the web flow; its session is separate from
the installed app. No new native permissions/plugins or external-browser token
handoff were added. Full native Google login needs a separately configured,
tested system-browser plus app-return bridge. Packaged `file://` builds also
retain email sign-in instead of using an invalid OAuth redirect.

The bundled `web/src/brand/google-g.png` is Google's supplied color logo from
https://developers.google.com/static/identity/images/g-logo.png, used only for
the labeled Google sign-in button. Source and usage guidance:
[Google branding](https://developers.google.com/identity/branding-guidelines).

Google verification: 10 auth tests pass, including the real Supabase SDK against
a simulated PKCE token response, duplicate-callback prevention, reload/session
persistence, origin/workspace handling, native guards, cancellation and failures.
The focused auth/config/RLS/storage/project-file/whiteboard suite passes 47 tests.
Typecheck, lint and build pass. Real Google account consent, production Vercel
redirects and physical-device native sign-in have not been performed.

## Existing architecture reused

`TakeoffCanvas.jsx` owns editing state. `buildPayload()` serializes project data;
`hydrate()` restores it. Existing 700 ms local autosave writes through `store.js`.
IndexedDB stores original PDFs, annotation metadata and revision snapshots.
`createFileProjectStore()` isolates imported projects by local workspace UUID.

`projectFile.js` reads/writes the existing v2 `.otk` ZIP (v1 still opens), including
original PDF bytes and deduplicated whiteboard attachments. `SaveProjectDialog`
and `saveProjectFile.js` retain the native location picker/download fallback.
`ingest.js` still imports PDF/image/ZIP plans; filename-plus-page sheet keys stay
unchanged. `markedset.js`, PDF rendering, coordinates, scale/calibration, snapping,
SVG geometry, the detail-render cancellation fix and rendering preferences were
not changed. Existing optional Google Drive storage remains independent.

## New architecture

The canvas adds an additive `project_id` UUID to the same annotation payload.
It survives local saves, `.otk` transfers and cloud saves. Workspace UUIDs remain
separate, allowing a local copy without changing its cloud identity. Save As
creates a new project identity; restoring a revision does not change identity.

`src/lib/supabase/` contains configuration, lazy client creation, auth, project
repository, file provider, transport validation and sync coordination. React
uses these operations rather than issuing SQL/storage requests itself.
CloudProvider restores sessions; CloudProjects supplies the account/browser UI.

The cloud envelope `opentakeoff.cloud.v1` contains the existing annotations,
revision payloads and plan manifest. It is a transport envelope, not a replacement
portable format. JSONB keeps shapes, conditions/materials, measurements, scales,
scale provenance, markups, RFIs, tabs/groups, bookmarks, labels, columns, palette,
client information, levels, units, counters and whiteboard layout together.
Binary whiteboard data is separated into content-addressed storage objects and
rehydrated before returning to the existing local serializer. Unknown additive
payload fields survive transport. Browser preferences, reusable global libraries,
credentials, AI keys and transient drawing/undo/camera state are not project data.

## Database and security

| Table | Contents |
| --- | --- |
| `otk_profiles` | Account ID, display name, creation timestamp |
| `otk_projects` | UUID, owner, name, JSONB state, schema version, revision counter, timestamps |
| `otk_project_members` | Project/user unique pair with editor or viewer role |
| `otk_project_files` | Project/hash unique pair, original name, MIME type, size, private path, upload status |

All four tables have RLS. Project/member/file tables grant clients SELECT only;
security-definer RPCs with empty search paths validate `auth.uid()` and permissions.
No client-supplied user ID establishes ownership. Profiles can be written only
by their account and read by project collaborators where relevant.

Owners read/write/delete/share, editors read/write, viewers read only. Anonymous
users and nonmembers cannot read projects/files or gain membership by guessing
UUIDs. Direct project UPDATE is not granted, so clients cannot bypass version
checks. Sharing looks up an exact confirmed email and never lists auth users.
Owner display names fall back to a short account ID until a Profile is saved.

Storage is private: `otk-project-files/<project UUID>/<SHA-256>`. Members read,
owners/editors upload registered objects, and no object UPDATE policy exists.
Objects are immutable; same-project identical bytes upload only once. Separate
projects deliberately have separate storage authorization and may duplicate bytes.
Deletion marks a project inaccessible to members, removes objects through the
Storage API, then purges database records after verifying no objects remain.
Interrupted deletions can be retried with **Finish deletion**. Local copies stay.
No access revocation can recall data another user has already downloaded.

## Save, load, sync and conflicts

Save first writes locally, then captures validated state and hashes originals.
`otk_save_project` locks the project row and compares the expected version before
updating. First save creates it; later saves increment the same row's version.
The new version is recorded locally before file uploads, making partial-upload
retries safe. No database calls occur during pointer movements. Cloud saves are
manual, not an automatic background queue. No Realtime subscriptions are created.

IndexedDB sync metadata is scoped by Supabase URL, user and workspace. It tracks
project ID, cloud version/timestamp, local-save time, last sync, payload hash and
missing file references. Status refreshes on opening Cloud and after operations.
Local autosave marks a previously synced project dirty. List rows show cloud
metadata rather than continuously comparing every project to every local copy.

Conflicts offer Keep Local, Use Cloud, or Save Local as Copy. Keep Local must still
match the cloud version shown in the confirmation; further changes conflict again.
Use Cloud opens a NEW local workspace, preserving the old workspace's offline work.
No geometry merge is attempted. Cloud Open downloads originals using the user's
session and verifies SHA-256/size before atomic local import. Matching files in
the current workspace are reused. Reopening from another browser reloads that
device's separate local cache; cross-workspace global binary deduplication is not
implemented. Save As/Duplicate consumes additional storage and download quota.

Metadata saves even if a PDF exceeds the upload limit. The original remains in
IndexedDB; missing-plan descriptors are retained on later cloud saves. On another
device those sheets cannot render until the originals are imported with matching
names. Whiteboard missing assets retain layout with a Local Only placeholder.
Cloud Download/Duplicate requires all originals. Keep source-device `.otk` backups;
ordinary local export includes only PDFs actually present in that workspace.

## Free-tier budget

Verified 2026-09-27 against [Supabase pricing](https://supabase.com/pricing):
500 MB database, 1 GB file storage, 5 GB egress plus 5 GB cached egress, 50,000
monthly active users, two active projects, and pausing after a week of inactivity.
Automatic backups are not included. Treat cloud storage as another copy, not your
only backup. Monitor the dashboard's database/storage/egress usage.

The [Free upload limit](https://supabase.com/docs/guides/storage/uploads/file-limits)
is 50 MB/file; this integration conservatively caps objects at 50,000,000 bytes.
The [recommended resumable uploader](https://supabase.com/docs/guides/storage/uploads/resumable-uploads)
is used above 6 MiB, with 6 MiB chunks and bounded retries; smaller files use the
standard upload endpoint. Cloud state is capped at 32 MiB including revisions.
Repeated unchanged files are not uploaded again. No Realtime/presence, thumbnails
in the cloud, per-point writes, or polling was added. Removed attachments remain
in that project's cloud storage until project deletion; automatic garbage
collection is deferred to avoid deleting files referenced by another revision.
JSONB snapshots and many Save As copies can still fill the Free tier quickly.

## Vercel and Android

For Vercel, use `web` as Root Directory, Vite as framework, `npm run build`, and
`dist` output. Add the two public environment variables to the appropriate
Preview/Production scopes and rebuild. `web/vercel.json` provides SPA route
fallback without rewriting assets/demo/files. A build embeds configuration;
editing local environment files cannot alter an already-deployed bundle.

For Capacitor, build the web app with those variables and run the existing
Capacitor sync/build/install workflow. No native plugins or permissions were
changed. Android already declares INTERNET permission. HTTPS fetch and browser
session persistence are used. Email codes avoid browser-to-app callback links.
On Android, clearing app data/uninstalling removes local work and sessions.
File uploads use originals from IndexedDB, not native filesystem paths.
Downloads reuse the existing browser download fallback where a native picker is
unavailable. WebView downloads and resumed TUS uploads still need physical-device
testing before relying on them. Do not disable certificate checks or CORS.

The running app and bundled Capacitor assets can edit cached projects offline.
The existing service worker is network-only: a brand-new browser cold start
without network is NOT guaranteed. No new app-shell offline cache was added.

## Verification and remaining live checklist

Local automated results: 15 new cloud tests passed (config/secret guards, auth
adapter, round-trips, original bytes, sharing/security, conflict and retry paths,
large-PDF Local Only behavior, missing assets and integrity rejection). RLS tests
execute real PostgreSQL through PGlite with a mocked Supabase-managed auth/storage
schema; they do not verify hosted PostgREST, email or the Storage HTTP service.
The focused cloud/project-file/whiteboard suite passed all 40 tests. An actual
Vite build with a synthetic secret key was correctly blocked without logging it.
Typecheck and ESLint passed. Production build passed with the existing large
bundle warning. Full suite: 977 tests, 963 passed, 14 known pre-existing branding
expectation failures. No new failing test names. Existing dependency audit reports
five moderate findings in React Router and Capacitor's Xcode/UUID dependencies;
no unrelated major upgrade was attempted.

Browser checks: unconfigured Local Mode remains usable; configured sign-in,
signup and forgot-password screens open on desktop and at 390px phone width.
No account was submitted or password changed. No runtime errors were observed in
the final cold-load check (existing React Router future-version warnings remain).
The bundled sample plan remained open after closing Cloud with Escape. No user
workspace was modified. The live public Auth endpoint was reachable, but the app
tables were not yet available.

Before production use, run these against test projects on the configured service:

1. Apply migration, configure SMTP/templates; create and confirm four test users.
2. Sign in/out, reload to restore session, and complete code-based password recovery.
3. Save a small PDF project with calibrated shapes, markups, bookmarks and notes;
   save again and confirm one project row/version increments with no second upload.
4. Open on a second authenticated browser/device; compare exact data and original
   PDFs; refresh; download/open the `.otk` backup.
5. Rename, Duplicate, Save As and Delete; interrupt a deletion then finish it.
6. Share to editor/viewer; verify Shared With Me, permitted actions, direct REST
   denials for viewer writes and outsider UUID access, and access revocation.
7. Change on two devices; exercise all three conflict choices. Edit offline,
   reconnect and save. Test interrupted upload resume and token expiration.
8. Test a PDF above 50 MB and a quota failure: metadata saves and originals stay
   local. Verify original-device backup/recovery of Local Only files.
9. Repeat on mobile Chrome, Galaxy Fold folded/unfolded, Capacitor Android and
   Vercel HTTPS. Validate native downloads and auth persistence after app restart.

## File inventory

Created: `supabase/migrations/202609270001_optional_cloud.sql`,
`web/src/lib/supabase/{config.js,client.js,auth.js,errors.js,projects.js,files.js,projectState.js,sync.js,CloudContext.jsx}`,
`web/src/components/CloudProjects.jsx`, `web/src/styles/cloud.css`,
`web/test/{supabaseConfig,supabaseAuth,supabaseSync,supabaseRls}.test.ts`,
`web/vercel.json`, this document, and ignored `web/.env.local`.

Modified: `web/.env.example`, `web/package.json`, `web/package-lock.json`,
`web/vite.config.js`, `web/src/main.jsx`, `web/src/pages/TakeoffCanvas.jsx`,
`web/src/lib/projectFile.js`, `web/src/lib/whiteboard.js`,
`web/src/components/Whiteboard.jsx`, `README.md`, `docs/USER_GUIDE.md`, `CHANGELOG.md`.
The existing `.gitignore` already covered local environment files and was retained.

Other boundaries: cloud project browser currently shows the 200 most recently
modified accessible projects; file manifests paginate beyond 1,000 rows. Google
Drive workspaces should first be exported/imported locally before saving to
Supabase. Cloud saves are manual; there is no multiplayer merge, automatic
conflict resolution or service-role fallback. Next priorities are the live
checklist, physical Android verification, then optional quota-aware garbage
collection and broader project-list pagination if needed.
