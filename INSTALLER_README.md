# OpenTakeoff Windows Installer

This repository packages the existing `web` Vite/React application as a Windows desktop app with Electron and electron-builder. Electron is only the desktop runtime/container layer; the OpenTakeoff UI, measuring logic, PDF handling, IndexedDB/localStorage persistence, and workflows remain the existing browser application.

## Architecture

- `web/` is a client-only React 18 + Vite application.
- Normal local operation does not require a backend. Plans and takeoffs are stored by Chromium in IndexedDB/localStorage.
- Optional integrations remain optional: Google Drive sync, AI endpoints, Netlify schedule parsing, and the separate capture server are not started or required by the desktop package.
- The Electron main process registers the private `opentakeoff://app/` protocol and serves `web/dist` from the packaged app. This avoids hard-coded source paths and keeps Vite's root-relative assets working in production.
- Electron security settings use `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`. The preload exposes only fixed update actions; it cannot choose a feed, execute commands, or access files.

## Rebuild the Installer

From the installed source checkout:

```powershell
cd C:\Apps\OpenTakeoff\web
npm ci
npm run dist:win
```

The command first runs the production Vite build and then creates the Windows installer with electron-builder.

## Publishing updates to installed Windows apps

The installed app uses `electron-updater` with a fixed public GitHub Release feed:
`luisgarin03/Takeoff`. It checks shortly after startup and every four hours, but it
does not download or install silently. Users see the update in the app, choose
**Download update**, save their project, and choose **Restart and install**.

Configure these GitHub `release` environment secrets before the first production build:

- `WINDOWS_CSC_LINK` — the base64 value or secure certificate location accepted by electron-builder
- `WINDOWS_CSC_KEY_PASSWORD` — the certificate password
- `WINDOWS_PUBLISHER_NAME` — the exact certificate subject/publisher

To publish version `0.2.0`, first set `web/package.json` to `0.2.0`, merge the
verified change, then create and push tag `v0.2.0`. The
`Publish Windows app update` workflow verifies the tag, runs the full project check,
requires all signing settings, and publishes the installer, block map, and
`latest.yml` to the GitHub Release. Installed copies accept the new version only
after it is published and its Windows signature matches.

Do not rename, transfer, or delete the configured update repository without first
shipping a signed app version that points to the replacement feed. Do not put a
GitHub token in the installed app.

## Output

The installer is generated at:

```text
C:\Apps\OpenTakeoff\release\Beitzell Estimating-Setup-x64.exe
```

The unpacked packaged application for local verification may also be created with:

```powershell
cd C:\Apps\OpenTakeoff\web
npm run pack:win
```

## Installed App Behavior

- Product name: `Beitzell Estimating`
- Windows target: x64 Windows 10/11
- Installer technology: NSIS through electron-builder
- Default install scope: per-user, using the standard Windows per-user application install location
- Start Menu shortcut: `OpenTakeoff`
- Desktop shortcut: offered/created by the installer
- Uninstaller: installed by NSIS and registered in Windows Apps & Features / Add or Remove Programs

## User Data

Mutable application data is stored outside Program Files under:

```text
%LOCALAPPDATA%\OpenTakeoff
```

Chromium stores site data for `opentakeoff://app/` there, including IndexedDB and localStorage. Upgrades preserve this user data. The uninstaller removes installed binaries, shortcuts, and installer registry entries, but does not automatically delete user projects, PDFs, takeoffs, or saved settings.

## Upgrades and Uninstall

Running a newer `OpenTakeoff-Setup-x64.exe` upgrades the installed application and preserves `%LOCALAPPDATA%\OpenTakeoff`.

Uninstall through Windows Settings or the Start Menu uninstaller. The normal uninstaller removes the application binaries and shortcuts. User data is intentionally left in `%LOCALAPPDATA%\OpenTakeoff` unless the user explicitly removes it.

## Limitations

- The default desktop build packages the static local OpenTakeoff app. It does not bundle or auto-start optional external services such as the Python AI sandbox, Netlify functions, or the separate capture server.
- Optional AI endpoints and contribution endpoints can still be configured inside the app as URLs, just as in the browser version.
- Google sign-in can still open external Google authentication pages; team Drive mode requires the same build-time Google configuration as the web deployment.
- Production subscription builds also require the public Supabase/RevenueCat build settings in `web/.env.local`. Enable `VITE_REQUIRE_ACTIVE_LICENSE=1` only after the billing migration, Edge Function, webhook, and live products are tested.

## Code signing

Internal builds may be unsigned. For a public installer set `CSC_LINK`,
`CSC_KEY_PASSWORD`, and `WINDOWS_PUBLISHER_NAME` before `npm run dist:win`.
The publisher name must exactly match the Windows code-signing certificate.
See `docs/LAUNCH_AUTH_AND_BILLING.md` for the complete release checklist.
