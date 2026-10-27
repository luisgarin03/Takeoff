# Cloud project library implementation

## Workflow

- **Cloud status:** authenticated Drive connection state controls idle Local Only. Connected idle has no subtitle. Offline, upload/download, pending, conflict and unsaved statuses remain visible.
- **This project:** no provider selector. New saves use Google Drive; already-bound Supabase projects retain their provider. Save As and the Profile preference remain compatible with the existing provider workflow.
- **Download Locally:** enabled only for an existing Drive project. Recursively lists the tagged project folder through the authenticated Edge Function, preserves original names, subdirectories and empty directories, and writes a ZIP with the project directory at its root. No upload, rename or cloud mutation occurs. Sequential 4 MiB reads and an incremental ZIP writer stream to Save File where supported; other browsers buffer up to 512 MiB. The dialog's transfer lock prevents duplicate exports and offers cancellation during downloads.
- **Browse projects:** the authorized project metadata list supplies names, author, role and modified date. Drive projects appear as project folders; entering one resolves its tagged folder and lists its real children through the server. Breadcrumbs, Up, refresh and current-folder search work without browsing arbitrary Drive locations. Select a project for Open, Duplicate, Rename, Share or Delete. Download is absent. Legacy Supabase projects have a separate filter. Assets are listed, not launched.
- **Open project:** choose Locate Google Drive Folder once per account/browser. Select My Drive, Estimate save data, Projects, or the project folder; the stored directory handle is the only filesystem authority. Actual Drive folder names come from the server. The resolver reads the matching `.otk`, checks project identity and (where available) the cloud archive hash, and uses the existing local workspace importer. It does not make a ZIP, fetch Drive binary content, or write another filesystem copy. The existing importer still creates a browser IndexedDB workspace, as all file-project opens do; it does not edit the source `.otk` in place.
- **Streamed files:** reading the selected filesystem handle lets Drive for desktop/Windows hydrate the archive naturally. The UI shows Opening project from Google Drive. A missing, denied, ambiguous or stale file produces an actionable error with no silent API download fallback. Portable `.otk` archives contain required project data; their existing integrity validation remains in use.
- **Author:** optional `authorId`, `authorName`, `authorEmail` extend `annotations.project_metadata`, which already stores title and timestamps. Profile name wins over auth name, then email. Known authors survive later saves; intentional copies get a new project identity/author. Older metadata remains valid and displays trustworthy owner information or Unknown. Folder identity is not duplicated in the manifest: existing project-ID-tagged folders and provider file records remain authoritative.

## Reused components and changed files

UI: `CloudProjects.jsx`, new `CloudFileBrowser.jsx`, `cloud.css`, `icons.jsx`, and the existing header/serializer in `TakeoffCanvas.jsx`.

Client services: `CloudContext.jsx`, `projectMetadata.js`, `projects.js`, `driveFiles.js`, `errors.js`; new `localDriveProject.js` and `supabase/driveLibrary.js` reuse the portable-project reader, local importer, metadata store and existing fflate dependency.

Server: `otk-drive/index.ts`, `drive-service.js`, `drive-google.js`, new `drive-library.js`. Existing server-only tokens, membership access checks, private requests and stable folder tags are retained. Every listing/chunk checks project access and ancestor containment; shortcuts are never followed. New writes create Estimate save data/Projects. Existing legacy project folders are reused, not moved or duplicated; the tagged root receives the current root name on a subsequent write.

Tests: `driveLibrary.test.ts`, updated `driveService.test.ts`. Documentation: README, USER_GUIDE, CHANGELOG and this report. No dependencies or schema migration added.

## Limits and live acceptance

The new folder-list/folder-chunk actions require the updated **otk-drive Edge Function**. This change does not deploy it. Existing Google OAuth configuration and connected owner permissions are required.

The existing `drive.file` scope only exposes files accessible to this application. Files added outside the app that Google does not expose under that scope cannot be discovered or guaranteed in an export. This is an application-managed project export, not a full-Drive backup. Google-native Docs/Sheets and shortcuts are rejected explicitly rather than silently omitted. Duplicate/unsafe names, more than 20,000 entries, excessive nesting, files over 2 GiB or ZIP totals approaching 4 GiB fail clearly. Concurrent file edits detected by metadata checks abort the export; this is not an atomic Drive snapshot.

Directory picking is available only where the host implements File System Access. No privileged Electron filesystem bridge or automatic OS mount discovery was added. Unsupported devices must use the existing Project → Open project file picker. Stored handles may need renewed access using Locate Google Drive Folder. Shared cloud access does not guarantee that the owner's folder is mounted on the member's PC.

Automated checks cover status, author round trips, nested/empty ZIP contents, unsafe paths, unsupported entries, local path/project resolution, access containment and existing Drive upload deduplication. The file-browser component was exercised in a real browser with fixture data for folders, breadcrumbs, Up, search, author and 390px width. The signed-out full app renders without page errors after the initial-state fix. Real Google account transfers, streamed-file hydration, multi-user permissions, and OS download completion still require live acceptance; no cloud data was changed during verification.
## Verification results

- `npm run typecheck`: passed.
- `npm run lint`: passed, no lint warnings.
- Full `npm test`: **1,050 passed / 15 failed**. The failures match the existing baseline: 14 branding/CSV/store expectations still expect OpenTakeoff rather than Beitzell Estimating, plus the existing second-device Drive restore integrity test. They were not suppressed or modified. Consequently `npm run check` stops at tests.
- `npm run build` run separately: passed; existing large-chunk warning remains.
- `git diff --check`: passed.
- Additional full-modal browser fixture checks passed: connected idle subtitle hidden, author shown, old Download action absent, missing-local-folder Open fallback, real folder-list UI navigation, This project provider picker absent, unsaved Download Locally disabled, and 390px responsive layout. No page errors in the completed checks. Expected missing-folder handling logs a development warning; existing React Router future-flag warnings remain.

Live account operations were not exercised. Mocked browser results do not establish production Google permissions, Edge Function rollout, or desktop hydration behavior.

Selecting **Locate Google Drive Folder** now immediately displays that selected local folder’s actual files and subfolders. Use breadcrumbs, Up, Refresh folder, and search to navigate within the selected folder. Double-click a folder or `.otk`, or select it and choose Open folder/Open project. Other file types are listed without launching them. **Cloud Projects** returns to the cloud library. Local listings work offline and do not require Drive folder-list API deployment; they show file modification times and saved project editor metadata. Opening a selected `.otk` uses the normal local importer and does not automatically bind it to a cloud version.

Selected-local-folder follow-up verification: typecheck/lint/build passed; full suite 1,053 passed with the same 15 baseline failures. Browser automation used real browser filesystem handles with a mocked picker/account: immediate listing, subfolder double-click, Up, search, 390px layout, and opening a valid local .otk through the real importer all passed without page errors. Native Windows Drive hydration remains a live-environment check.

Cloud Projects starts with Sign in/Create account when signed out. After sign-in, an accessible previously selected source folder reopens; otherwise choose a source folder. The cloud project list is loaded only after choosing **Browse cloud library instead** or **Cloud Projects** in the local browser.

The selected-folder browser puts `.otk` files first, then folders ordered newest first. **Last modified** shows the filesystem timestamp for a file; a folder shows its **Latest file change**, the newest timestamp found recursively inside it (the browser cannot read the folder’s own Windows timestamp). Empty/inaccessible folders show Unknown. **Modified by** uses `project_metadata.lastModifiedByName/lastModifiedByEmail` recorded on new authenticated saves, independently of the original author. Older files and files edited outside the app may not identify an editor; no identity is guessed. Scanning reads file metadata and only inflates project manifests, not PDF/image assets, with depth/entry limits; reading synced archives may trigger Google Drive hydration.

Folder-date follow-up: local archives sort first; project folders sort by latest contained-file timestamp. Focused metadata/listing tests pass (13/13); full suite 1,056 passed with the same 15 baseline failures. Typecheck/lint/build and browser fixture checks for editor display, OTK-first ordering, navigation, opening and mobile overflow passed. Directory timestamps and filesystem editor identities are unavailable to this browser API; the UI labels derived folder dates and Unknown editors explicitly.


## Create New Source Folder

The existing `showDirectoryPicker` architecture now accepts a parent location with read/write access. A confirmation shows the fixed `Estimate save data/Projects` structure; a read-only exact-child probe detects existing folders. No suffixes or placeholder files are created. Use Existing ensures Projects exists; Create rechecks for an existing root before writing. Cancel, picker dismissal, and Escape before confirmation do not create folders or change the active source. A partially failed filesystem write can leave the root folder on disk; retry offers reuse instead of deleting or overwriting user content.

Creation validates Projects, persists `{handle, browseProjects: true}` under the existing per-account `drive-local-folder` key, then selects the source and opens its Projects library. Existing plain-handle preferences remain supported. The active source changes only after listing/validation and persistence succeed. Reopening uses the saved handle when permission remains available; use Locate again if the browser requires renewed access. New-source initialization and restoration enumerate only immediate Projects children; explicit later navigation/refresh retains the existing folder-date behavior.

The browser exposes a folder name and handle, not its absolute Windows path or verified Drive mount identity. The UI does not invent a path or reject custom mounts. Drive for desktop handles syncing this locally created structure. This operation does not register/rebind the selected folder with the separate API-managed Drive storage provider; its existing Save to Cloud folder bindings are unchanged.

Changed for this follow-up: CloudProjects.jsx, LocalFolderBrowser.jsx, localDriveProject.js, new createSourceFolder.test.ts, and documentation. No new filesystem abstraction, dependency, or deployment. Tests use real browser filesystem handles behind a mocked picker/account; native Windows picker presentation and actual Drive synchronization require the user's live environment.

Create-source validation: 6 focused tests cover read-only probing, minimal creation, existing-folder reuse, race recheck, failures, and nonrecursive initial/restored listings. Full suite: 1,062 passed / the same 15 pre-existing failures. Typecheck, lint, separate build and diff checks pass. Browser fixture checks passed for creation, validation/persistence, automatic Projects selection, reopen, duplicates, Use Existing, Cancel, Escape, alternate-location cancellation, permission errors, existing Locate and existing inline + Open. Completed fixture runs have no page errors; an expected handled permission warning and existing React Router warnings remain. Live native Windows picker and Google Drive sync are not verified by these fixture tests.
