# OpenTakeoff

A browser-based construction takeoff canvas. See [the project brief](AGENT_BRIEF.md), [feature map](FEATURES.md), and [user guide](docs/USER_GUIDE.md).

## Features

The **Project** menu creates named projects with an optional submission date and status. Those details travel with browser autosaves, cloud saves, and portable `.otk` project archives.

Local **Save project** reuses a previously selected file handle only for that same project; **New project…** starts with a fresh named save destination. **Save project as…** always chooses a new destination. Google Drive projects use a stable-ID-backed, human-readable `OpenTakeoff/<Project Name>/` folder containing `<Project Name>.otk`, with `PDFs/` and `Assets/` created only when those separate files are needed.

**Optional Google Drive files:** connect Drive separately in Cloud > Profile, then explicitly choose it for a new cloud project's original PDFs and board assets. Supabase remains authoritative for users, state and sharing; an authenticated Edge Function serves private file chunks to authorized members. Existing Supabase/local projects stay unchanged. Downloads verify file identity and stop on cancellation or an account change, including during the final local cache write. This saves Storage capacity, but proxy transfers still use Supabase egress. Backend setup and live acceptance are required: [Drive setup and implementation report](docs/GOOGLE_DRIVE_STORAGE.md).

**Optional Supabase cloud:** email/password accounts and Google sign-in on the web, private cloud projects, version-checked saves, sharing, and original-file storage alongside the existing local autosave and `.otk` backups. Configure `web/.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; never use a secret/service-role key. Database and email setup are required before cloud use. Google credentials stay in Supabase; the current Android wrapper retains email sign-in until native OAuth return support is added. See [Supabase setup and implementation report](docs/SUPABASE_SETUP.md).

Portable projects: **Project > Save project** asks for a filename and opens a Save As location picker in supported browsers (otherwise a named download). The single `.otk` file contains the plan PDFs, takeoff data, scales, markups, RFIs, tabs, and revisions. **Project > Open project** restores it into a separate local workspace without replacing the currently saved project.

**Project > Download this page** exports the complete current sheet as a one-page PDF with its takeoff lines, notes, and markups, without the automatic condition/quantity labels or a report cover. Exported markup captions use a translucent paper background so they stay readable over dense plan linework. In side-by-side view, it uses the last-clicked sheet.

**Sheet bookmarks:** star pages in the sheet tabs or navigation menus. The open-sheet dropdown groups bookmarked pages first, including bookmarked tabs you have closed. Bookmarks autosave and travel with portable project files.

**PDF text search:** click **Find** in the sheet toolbar or press `Ctrl+F` (`⌘F` on Mac). A movable panel opens at the top-right above the plans without dimming them. It starts with common scope terms; add or remove suggestion chips, customize the comma-separated search terms, and search every loaded plan to highlight all matches. Previous/next navigates across plans and pages. Scanned-image PDFs need OCR before their text can be found.

**Whiteboard:** arrange reference PDFs, images, and editable notes in a separate pan/zoom workspace with zoom up to 400%. Paste clipboard text, images, or supported files directly onto the board. Ten inline swatches label each file or note header independently; click its selected swatch again to restore the original header. Edit note titles inline, and keep note-body colors separate. These changes autosave with the board and travel inside `.otk` and cloud project files.

Draw colored arrows over whiteboard references by choosing **Draw arrow**, selecting one of the ten palette colors, and dragging across the board. The bottom-left **Draw > Markup > Arrow** tool adds colored, editable arrows to plan sheets. Both arrow types save in the existing project data; older `.otk` files still open without a migration or version bump.

**Markup shortcuts:** assign a custom **Ctrl+key** binding to each markup tool from its **Draw > Markup** menu. Bindings are unique per key, can be cleared, and stay in the current browser rather than changing saved project files. Ctrl+F and existing undo/copy/paste/duplicate chords remain reserved.

**Whiteboard PDF:** use **Export whiteboard as PDF** for one custom-sized page fitted to all note cards and attachment content, including offscreen items. To export only part of the board, choose **Select area to export**, drag a rectangle, then choose **Export selected area as PDF**. Note titles, header colors, swatches, note-body colors, text, and arrows are included; export keeps original PDF vectors where possible and clips content at the selected page edge.

Whiteboard PDF attachments have a **PDF detail** slider and **Refresh** action for sharper previews on demand; high-resolution renders are bounded to protect browser memory.

Measure construction plans with existing canvas tools, snapping, and reports. The optional **Trackpad** control adds relative touch or mouse aiming and tap-to-place without covering the target with your finger. At overview zoom, each finished sheet also has a local preview raster; its Diagnostics control is adjustable from 10–100% of the base raster (50% default), while the full-resolution sheet remains available for normal and detailed viewing.

The responsive drawers provide larger workspaces, adapt to phones and tablets, and share expanding condition-name inputs with the toolbar. Long measurement hover details wrap into a bounded card. Canvas Text notes accept line breaks and wrap into annotation boxes (Enter for a new line; Ctrl+Enter to place). Startup uses the attributed Uiverse rain background and Blueprint app icon.

## What's in the box

The React app is in `web/`. Its virtual trackpad reuses canvas coordinates, snapping, and measurement handlers. Trackpad Settings provides a session-only Show toggle plus live width (50–100vw), height (40–150px), and opacity (35–100%) controls; it defaults to 75vw × 60px at 90% opacity. No extra dependency or persistence is required.

Web/PWA, Android launcher/splash, and Windows Electron icon assets are included. Artwork credits ship at `/credits.html`; see [third-party notices](THIRD-PARTY-NOTICES.md).

Run `npm install` and `npm run dev` in `web/` with Node 24; validate with `npm run check`.
