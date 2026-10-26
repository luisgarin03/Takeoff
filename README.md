# OpenTakeoff

The empty Plan Set landing page uses React Bits Color Bends behind the onboarding panel, with the shared animated Estimating by Luis Garin wordmark in place of the blueprint icon. It stays off PDF and Whiteboard workspaces, pauses in hidden tabs, and stays still with reduced motion enabled.

A browser-based construction takeoff canvas. See [the project brief](AGENT_BRIEF.md), [feature map](FEATURES.md), and [user guide](docs/USER_GUIDE.md).

## Features

- Centered landing card with Open Recent project shortcuts, including saved author and last-modified details.

Project sharing is currently hidden in the app. Its implementation is retained behind `SHARING_UI_ENABLED` for future use.

- Responsive workspace controls, viewport-sized Cloud and User Guide windows, and stacked project details on phones. Narrow screens retain every toolbar control with vertical scrolling.

**Share from Google Drive:** each local project row has Share. Select the original `.otk` and supporting files with Google Picker, enter a recipient email, and grant read/download access. Google sends sharing emails for newly granted access; the Cloud inbox shows invitations. Recipients select files, download them from the sender's Drive into their own desktop-synced Drive folder, and open the imported project. Requires [sharing setup](docs/DRIVE_SHARING.md).

**Theme & logo** provides live logo colors, Shimmer/Solid/Pulse/Morph/Rainbow effects, brightness, speed, and light/dark appearance controls.

Cursor theme offers Default (original grayscale), Red, Blue, Pink, Orange, Purple, Green, and Yellow. It changes immediately and saves in this browser independently of logo colors; Reset logo keeps the cursor choice. Drawing, text, pan, and resize retain their cursor roles. Busy cursors use the included static fallbacks.

The User Guide includes a clickable topic index, visual control references, and app screenshots, with scrolling contained inside the guide.

The toolbar **User Guide** opens a centered, internally scrolling manual with button references. The live canvas zoom percentage sits immediately to its left so magnification remains visible across toolbar tabs. **Project → Open Recent** expands saved workspace links.

The **Project** menu creates named projects with an optional submission date and status. Those details travel with browser autosaves, cloud saves, and portable `.otk` project archives.

**Fence Material Calculator:** open it from the Project menu, the canvas rail, or the calculator button on a Takeoffs condition. Seven rule-driven calculators cover privacy, board-on-board, chain-link, vinyl, ornamental aluminum, temporary fence, and post/concrete work. The selected calculator includes an isometric fence preview with live length, height, panel, post, and gate context. The active condition's LF or EA quantity is imported automatically; results update instantly, can be saved as browser-wide presets, and selected material lines can be added to the condition's existing Supporting Materials estimate. Project-specific calculator values autosave and travel with local, cloud, and `.otk` project saves.

**Chain-Link Fence Post Calculator:** select a completed Linear takeoff and open the fence-post button on the canvas rail. The calculator links to that line without changing its measurement, treats its endpoints as terminal posts, lets square corner/terminal markers snap and drag along the measured path, and derives circular line posts independently for every section. Maximum spacing defaults to 10 ft (metric display supported); marker visibility, labels, size, closed-loop handling, project persistence, undo/redo, PDF overlays, and a detailed Report section are included.

Each condition can also choose **No mark** (the default), repeating **circle** markers, or repeating **X** markers for its Linear takeoffs. The optional markers make same-color conditions distinguishable on the canvas and exported marked PDFs without changing geometry, calibration, or LF totals.

Fresh workspaces start with **Chain Link Fence**, **Wood Fence**, and **Aluminum Fence** conditions when the user's reusable condition library is empty. Existing projects and saved library templates remain unchanged.

The live Takeoff summary uses the active condition's line color on its left edge, so the current measurement color stays visible while drawing and reviewing totals.

Local **Save project** reuses a previously selected file handle only for that same project; **New project…** starts with a fresh named save destination. After plans are first imported into a named local project, choosing that destination is required and the first complete `.otk` save runs immediately. The app continues its fast browser recovery save after edits, then coalesces portable-file updates until 30 seconds of idle time, with a two-minute maximum wait during continuous work. Expensive archive rebuilding runs only while the app is otherwise idle. **Save.. → Choose a new location / Save as** always chooses a new destination. Google Drive projects use a stable-ID-backed, human-readable `Estimate save data/Projects/<Project Name>/` folder (existing tagged project folders retain their location) containing `<Project Name>.otk`, with `PDFs/` and `Assets/` created only when those separate files are needed.

Cloud Projects now provides scoped folder navigation, persistent project authors, complete-folder ZIP export under **This project → Download Locally**, and opening through a user-selected Google Drive for desktop folder. See [workflow and validation](docs/CLOUD_PROJECT_LIBRARY.md) for browser support, export limits and deployment requirements.

**Optional Google Drive files:** connect Drive separately in Cloud > Profile, new saves from This project use Drive for the project archive, original PDFs and board assets. Supabase remains authoritative for users, state and sharing; an authenticated Edge Function serves private file chunks to authorized members. Existing Supabase/local projects stay unchanged. Downloads verify file identity and stop on cancellation or an account change, including during the final local cache write. This saves Storage capacity, but proxy transfers still use Supabase egress. Backend setup and live acceptance are required: [Drive setup and implementation report](docs/GOOGLE_DRIVE_STORAGE.md).

**Optional Supabase cloud:** email/password accounts and Google sign-in on the web, private cloud projects, version-checked saves, sharing, and original-file storage alongside the existing local autosave and `.otk` backups. Configure `web/.env.local` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; never use a secret/service-role key. Database and email setup are required before cloud use. Google credentials stay in Supabase; the current Android wrapper retains email sign-in until native OAuth return support is added. See [Supabase setup and implementation report](docs/SUPABASE_SETUP.md).

Portable projects: **Project > Save project** asks for a filename and opens a Save As location picker in supported browsers (otherwise a named download). Once a supported browser grants a retained file handle, background portable saves update that same `.otk` without reopening the picker or interrupting drawing. The handle is retained per project and reused after reopening when write permission remains granted; background work never triggers a permission prompt. The single file contains the plan PDFs, takeoff data, scales, markups, RFIs, tabs, and revisions. **Project > Open project** restores it into a separate local workspace without replacing the currently saved project.

Projects whose full plan set exceeds the 512 MB portable limit can use **Project > Save.. > Marked pages only**. The compact `.otk` keeps full-quality PDF content for measured pages, pages with markups/notes, and page bookmarks—including pages referenced by saved revisions—while omitted pages become tiny placeholders that preserve the original page numbers. Reopening shows a clear compact-project notice. **Import missing files** accepts the original folder, PDFs, or a ZIP and restores only exact filename/size/hash matches, so existing measurements cannot be attached to a different drawing revision.

Longer plan loads and renders, Find scans, exports, and project saves share a white four-bar loading indicator, so work in progress is visible until the operation finishes.

**Project > Download this page** exports the complete current sheet as a lightweight one-page PDF with its takeoff lines, notes, and markups, without the automatic condition/quantity labels or a report cover. Before downloading, choose **Compact**, **Balanced**, or **HD** and compare the estimated file-size range. Compact and Balanced retain readable construction-plan text with progressively lighter compression; HD preserves the smallest callouts at the largest safe resolution. Oversized HD sheets are fitted automatically to the browser-safe 16-megapixel raster ceiling instead of failing. The completed size is reported after export. The visible plan is flattened to a bounded page image, leaving source OCR/search text, hidden text, fonts, forms, annotations, metadata, and complex resources behind. Long markup captions wrap into bounded 12-point multi-line boxes with a translucent paper background, so they stay readable instead of running across or beyond the page. The estimating canvas uses those same sheet-relative text, box, stroke, and arrowhead dimensions: zoom enlarges the plan and its markup together, making the live placement an honest preview of the downloaded PDF. Visible Find jobs are included as keyword highlights in their selected colors. In side-by-side view, it uses the last-clicked sheet.

**Sheet and file navigation:** the current-sheet selector groups every loaded PDF as a collapsible set and nests its pages directly underneath, so large multi-file projects no longer become one flat page list followed by a separate file list. The active PDF opens automatically and the currently displayed page keeps a condition-color highlight in the nested list; expand or collapse any other PDF without navigating away. Star individual pages in the nested list or sheet tabs, and star complete PDF headers independently. Pages with saved markups are bookmarked automatically and show a blue pencil instead of a star; removing the final markup removes the pencil while preserving any manual bookmark underneath. Favorite PDFs stay first without changing their internal page order. Manual favorites survive closed tabs or temporarily unavailable files, autosave, restore with revisions, and travel with portable project files; pencil markers derive from the project's saved markups.

Use the keyboard **Left Arrow** and **Right Arrow** keys to run the same previous/next page actions shown around the current-page selector in the Sheets toolbar. Navigation stays within the active PDF and pauses while typing, using a menu or dialog, drawing an unfinished measurement, or viewing sheets side by side.

In **Select** mode, takeoff markups render and hit-test above the PDF's selectable text. Clicking an overlapping note, callout, cloud, arrow, or highlight selects the markup first; PDF text remains selectable anywhere no markup occupies the pointer location.

The Markup menu includes **Draw** for opaque freehand plan ink. Click its disclosure row to expand the color-and-brush widget directly beneath Draw, choose from the shared ten-color construction palette, set the brush from 1–24 px, then press and drag on the sheet. The selected color and size are remembered in the browser. Draw strokes scale with the plan, can be selected and moved like other markups, participate in Undo/Redo and project saves, and are included in downloaded pages, Marked Set PDFs, and pages imported to Whiteboard.

The Markups panel follows the canvas selection: the matching row receives a clear selected treatment and scrolls into view, with its color, line style, weight, text, and RFI controls immediately available. Clicking a panel row also selects that markup on the canvas. A selected text-note leader shows a blue endpoint handle; drag that handle to repoint the arrow without moving its text box. Use the red × beside the selected arrow tip, or the × in its Markups row, to remove only the leader while keeping the text box. Markup creation, deletion, movement, text/style changes, and leader placement, repointing, or removal share the chronological Undo/Redo history with takeoff shapes.

Count takeoffs use the same condition-colored square with a white outline on the live canvas, downloaded pages, Marked Set PDFs, and pages imported to Whiteboard; export never substitutes a circle.

**PDF text search:** click **Find** in the sheet toolbar or press `Ctrl+F` (`⌘F` on Mac). A movable, resizable, non-modal panel opens at the top-right without starting a scan; enter comma-separated terms or use the scope suggestions, then choose **Find in all plans** for every loaded PDF, **Find in this PDF set** for every page in the focused PDF file, or **Find in this page** for only the focused sheet. Keywords use whole-word boundaries, so **gate** does not match inside **aggregate** or **gated**. Every run becomes a separately controlled Search marks job with its own editable highlight color, show/hide control, and remove button; these job rows expand without a nested scrollbar, and repeated matches across visible jobs are deduplicated. **Unmark all pages** hides every job without deleting it, and **Remove all** clears the completed searches. The PDF remains available for pan, zoom, and drawing while the panel stays open. Results are grouped into a clickable page list with the keywords and match counts found on each page, and the previous/next buttons move between matching pages. **Hide 1 match pages** removes one-match pages from that list and its navigation without deleting marks; the corresponding Show control restores them. **Rank** sorts the remaining list from the pages with the most matches to the fewest; clicking it again restores plan order. **Download JSON File** saves the complete latest search—not the currently filtered list—with ranked pages and PDFs, keyword totals, exact matched text and bounded context, available normalized coordinates, page size/label metadata, and deterministic construction categories. Zero-match PDFs remain in the document ranking, and no PDF is rescanned for the download. Visible highlights are also included by **Project > Download this page** in their selected colors. Open the panel's **Help** tab for usage guidance, resize from either lower corner, or close it with × or the active **Find** toolbar button. Pages with no usable selectable text can fall back to local, in-browser OCR; choose Automatic, Ask first, or Off under **Project > PDF opening & OCR**.

**Fast PDF opening:** new imports and saved projects use Fast auto-detect by default. Previously verified plans reuse their compatibility result, while a new or unverified plan checks only its first page instead of blocking on an every-page render. Later pages are validated when opened. Choose **Project > PDF opening & OCR** to switch to **Verify every page** for a stricter import/startup check. Compatibility results are stored alongside the local plan or cloud sheet manifest and are discarded when that PDF is replaced.

**ChatGPT Project Assistant (optional):** triple-click or triple-tap the app logo, then open the **AI** drawer from **Experimental tools** to find both ChatGPT choices in one place. **Open ChatGPT ↗** launches the regular `chatgpt.com` experience in a new browser tab using the user's existing ChatGPT account; it does not require or modify the API assistant. **Project Assistant** opens a familiar browser-style chat over Project, Sheets, Takeoff, Whiteboard, Report, and calculator views. The resizable panel has a normal message composer, prompt suggestions, New chat, a collapsible Project context section, compact conversation options, and left/right docking. It uses the official OpenAI Responses API through a Google-authenticated Netlify function; `OPENAI_API_KEY` and `OPENAI_MODEL` are server-only and are never placed in the browser bundle, local storage, IndexedDB, or `.otk` files. The estimator explicitly chooses Current page, Selected elements, Current PDF set, measured/bookmarked pages, or Entire project context. The browser sends conversation text and only the bounded structured results of tools the model requests—never an entire source PDF. Client metadata is excluded unless enabled. Selectable PDF text and the existing local Find/OCR workflow remain in the browser; the assistant can ask that workflow to mark keywords without uploading pages. OpenTakeoff's existing totals engine remains authoritative. Bookmark, metadata, SOW, and RFI changes appear as approval cards, reject stale project revisions, and provide an immediate assistant Undo. Chat persistence is opt-in and backward-compatible; no project indexing or vector store is used. Leave either server variable unset to disable the feature cleanly. For local testing use Netlify Dev rather than the plain Vite server, and review [the user guide](docs/USER_GUIDE.md#15a-chatgpt-project-assistant) for privacy, citations, approvals, cost, and troubleshooting.

**Whiteboard:** arrange reference PDFs, images, and editable notes in a separate pan/zoom workspace with zoom up to 400%. Its top toolbar uses the same compact 58px frame and subtle workspace border as the estimating toolbar. Selecting a file, note, arrow, or rectangle places a red **Remove** action at the top-right of that object instead of adding a delete control to the toolbar; the button stays the same readable screen size while the board zoom changes. Paste clipboard text, images, or supported files directly onto the board. Ten inline swatches label each file or note header independently; click its selected swatch again to restore the original header. Edit note titles inline, and keep note-body colors separate. These changes autosave with the board and travel inside `.otk` and cloud project files.

While viewing a plan, use **Sheets > Import to Whiteboard** to place only the currently focused page on the Whiteboard. OpenTakeoff preserves that original PDF page as vector content and adds its measured takeoff lines, saved markups/notes, and visible Find highlights over it before importing the one-page working PDF. Imported Takeoff pages receive a full plan-scale board footprint, become selected, and open fitted large in the Whiteboard viewport instead of shrinking into a whole-board overview; this also provides substantially more close-up range before the 400% zoom ceiling. This avoids compressing the plan before Whiteboard export, so HD output retains the source's fine text and linework. Text notes and markup captions stay upright on source pages carrying 90°, 180°, or 270° PDF rotation. Protected or unusually large pages fall back to the maximum-detail HD raster. Automatic colored condition and quantity labels are omitted so they do not duplicate notes you add manually.

Every Whiteboard can contain multiple compact, movable Scope of Work panels sized in proportion to its plan cards. Their plan-scale type, row height, padding, and branding header stay compact on the board and use the same dimensions in PDF exports, so the worksheet does not visually overpower an adjacent construction sheet. Use **SOW panel** in the toolbar to add a blank panel, or use the duplicate button in a panel footer to create an independent copy beside the original; the adjacent × deletes only that panel. Each panel footer has its own editable name, so different scopes stay visible at the same time instead of reusing one worksheet. A panel header is one framed section with the Beitzell Fence Company logo centered on the left and an editable takeoff-title field centered on the right. Both sides use matching horizontal inset spacing on screen and in PDF exports. Drag the divider between them to resize the logo area independently. The default title is **FENCE TAKEOFF**; the former fixed “Project Estimating Worksheet” subtitle is not shown. The **SOW** section heading below the frame is editable too. Hover the logo to choose a custom PNG/JPEG/WebP/GIF/BMP logo or restore the default. Drag the header to position a panel or drag either side resize handle to change its saved width. **+ Line Item** creates a color-coded description, while **+ Title** creates a simple bold black heading without color controls. Click a line item's color dot to open the full palette; it may extend beyond the panel edge so every swatch and the custom-color control remain visible. Titles and line items can be edited, converted to uppercase with their **AA** action, duplicated, deleted, and reordered together. Their text fields enable the browser's English spelling, grammar, and autocorrect assistance; right-click underlined text for available corrections. Wrapping occurs between complete words on screen and in PDF exports. All panels, names, logos, titles, colors, ordering, widths, and board positions use the normal undo/redo and project save paths. Full-board, paginated, and selected-area PDF exports include every panel at its saved position while omitting editor-only controls.

Completing a takeoff measurement automatically maintains one final line per condition in the first Whiteboard SOW panel in the format `[combined measurement] - condition name`. Additional measurements for that condition update the same line instead of adding duplicates. The value uses the same role-aware arithmetic and condition multiplier as the live condition total; waste remains report/order-only. Linear totals sum their precise LF first and then round the final combined value up to the next whole foot without changing the precise takeoff quantity. The line uses the condition color. Each measured segment still receives its own persistent plan callout: its text box shows that segment's `[measurement] - condition name`, its box and arrow use the condition color, and the arrow tip lands on the measured geometry. The condition total and individual callouts stay synchronized when geometry, quantity, condition assignment, condition name, or condition color changes; deleting a takeoff updates the total and removes that segment's callout, while deleting the condition's final takeoff removes its automatic SOW line. Undo restores both. Manual SOW rows and manually duplicated automatic rows remain independent. New documentation is still created only at a completed-measurement commit, not while creating a condition, previewing points, copying/pasting, or loading a project.

Draw colored arrows or transparent outline rectangles over whiteboard references by choosing the matching tool, selecting one of the ten palette colors, and dragging in any direction. Switch back to **Select and move** to click an arrow shaft/head or rectangle edge, drag the whole drawing, adjust its visible handles, or delete it. Drawings keep a generous invisible hit target without making the exported stroke heavier. They participate in the board's undo/redo, autosave, `.otk`/cloud persistence, and PDF export; older projects continue to open normally. The bottom-left **Draw > Markup > Arrow** tool remains the separate arrow workflow for plan sheets.

Select a pasted or imported image and choose **Crop** to trim it with eight edge/corner handles. The outside area dims while editing; **Apply** commits one undoable crop and **Cancel** restores the exact previous view. Cropping is non-destructive: the original attachment stays embedded, crop metadata survives save/reload, and the image can be cropped again without creating replacement blobs. Whiteboard PDF export includes only the visible cropped portion.

**Markup shortcuts:** assign a custom **Ctrl+key** binding to each markup tool from its **Draw > Markup** menu. Bindings are unique per key, can be cleared, and stay in the current browser rather than changing saved project files. Ctrl+F and existing undo/copy/paste/duplicate chords remain reserved.

**Whiteboard PDF:** use **Export whiteboard as PDF** for one custom-sized page fitted to all note cards, attachment content, arrows, and rectangles, including offscreen items. Use **Export whiteboard as pages** for a multi-page Letter-landscape PDF that is easier to share or print while preserving the same board arrangement. **Select Content to Export** opens the persistent **PDF Export Pages** manager: use **Add Area** to draw any number of custom world-coordinate rectangles, or **Select Pages** and click a PDF/image card to add its exact content bounds and current PDF page. Exact-page entries stay linked when their card moves and can capture several pages from one multipage card. Rename/reorder/duplicate/delete pages, choose each page's paper size, orientation, and Standard/High/Maximum quality, preview the result, then download all entries in order as one PDF. Export selections survive normal project saves, pan/zoom never changes their geometry, overlapping regions are allowed, and their outlines and page labels are visible only while the manager is open. The outlines, labels, handles, and manager controls stay out of the PDF. Custom pages are rendered sequentially and independently, with progress and cancellation, so several distant or very large selected areas are never combined into one giant raster. The legacy full-board exports retain their shared **Compact**, **Balanced**, and **HD** selector and size estimates. Every mode includes note titles, header colors, swatches, note-body colors, text, drawing shapes, and only the visible portion of cropped images. Attached PDF pages are flattened into bounded JPEG page images, and imported images are re-encoded/downsampled when useful, so source OCR, hidden text, fonts, forms, annotation data, metadata, and complex PDF resources do not make the shared file unnecessarily heavy. Notes and SOW panels are freshly rendered at the selected quality; Whiteboard arrows and rectangles remain sharp vector overlays. All content is clipped at page or selected-area edges without stretching.

Whiteboard PDF attachments have a **PDF detail** slider and **Refresh** action for sharper previews on demand; detail changes only sharpness, so PDF/image content, notes, and drawings keep identical board coordinates in single-page, paginated, and selected-area exports. High-resolution renders are bounded to protect browser memory.

Measure construction plans with existing canvas tools, snapping, and reports. The optional **Trackpad** control adds relative touch or mouse aiming and tap-to-place without covering the target with your finger. At overview zoom, each finished sheet also has a local preview raster; its Diagnostics control is adjustable from 10–100% of the base raster (50% default), while the full-resolution sheet remains available for normal and detailed viewing.

The responsive drawers provide larger workspaces, adapt to phones and tablets, and share expanding condition-name inputs with the toolbar. Long measurement hover details wrap into a bounded card. Canvas Text notes edit directly in their annotation box with a large, resizable multiline field, accept line breaks, and wrap automatically (Enter for a new line; Ctrl+Enter to place). Each text box also has a leader-arrow control that stays proportional to the note while zooming: arm it, click the plan point the note should identify, and the same leader is retained in marked-page PDFs and Whiteboard imports. Startup uses the attributed Uiverse rain background and Blueprint app icon.

## What's in the box

The React app is in `web/`. Its virtual trackpad reuses canvas coordinates, snapping, and measurement handlers. Trackpad Settings provides a session-only Show toggle plus live width (50–100vw), height (40–150px), and opacity (35–100%) controls; it defaults to 75vw × 60px at 90% opacity. No extra dependency or persistence is required.

Web/PWA, Android and iOS launchers, and Windows Electron installer assets are included. Artwork credits ship at `/credits.html`; see [third-party notices](THIRD-PARTY-NOTICES.md).

Run `npm install` and `npm run dev` in `web/` with Node 24; validate with `npm run check`.

Selecting **Locate Google Drive Folder** now immediately displays that selected local folder’s actual files and subfolders. Use breadcrumbs, Up, Refresh folder, and search to navigate within the selected folder. Double-click a folder or `.otk`, or select it and choose Open folder/Open project. Other file types are listed without launching them. **Cloud Projects** returns to the cloud library. Local listings work offline and do not require Drive folder-list API deployment; they show file modification times and saved project editor metadata. Opening a selected `.otk` uses the normal local importer and does not automatically bind it to a cloud version.

Cloud Projects starts with Sign in/Create account when signed out. After sign-in, an accessible previously selected source folder reopens; otherwise choose a source folder. The cloud project list is loaded only after choosing **Browse cloud library instead** or **Cloud Projects** in the local browser.

Each `.otk` row in the selected local folder has an **Open project** button to open that file directly.

The selected-folder browser puts `.otk` files first, then folders ordered newest first. **Last modified** shows the filesystem timestamp for a file; a folder shows its **Latest file change**, the newest timestamp found recursively inside it (the browser cannot read the folder’s own Windows timestamp). Empty/inaccessible folders show Unknown. **Modified by** uses `project_metadata.lastModifiedByName/lastModifiedByEmail` recorded on new authenticated saves, independently of the original author. Older files and files edited outside the app may not identify an editor; no identity is guessed. Scanning reads file metadata and only inflates project manifests, not PDF/image assets, with depth/entry limits; reading synced archives may trigger Google Drive hydration.

**Create New Source Folder:** in the source-folder screen, choose a parent location in your Google Drive for desktop mount. Confirm creation of the fixed `Estimate save data/Projects` structure. If the source already exists, choose **Use Existing Folder**, **Choose Another Location**, or **Cancel**. Successful creation/reuse automatically remembers the source and opens Projects; no second Locate action is needed. Cancellation before confirmation creates nothing. Creation and remembered-source setup access only the chosen parent and immediate Projects listing, without a recursive drive scan. The browser remembers a directory handle rather than a hard-coded drive letter. It cannot reliably verify that the selected location is synced by Google Drive.

When signed in, your account avatar and display name appear beside the Beitzell Estimating logo. Select either to open Profile, view your email, edit your display name, or log out. The default name/photo come from Google account metadata; a saved display name takes precedence. Missing or unavailable photos use initials.

Report appearance includes Blueprint, Forest, Graphite, and Classic Paper presets, plus custom JSON theme import and Reset.

Open-sheet tabs live in the Sheets toolbar; schedule import is available from Draw → Measure → Schedule.

### Estimating toolbar and account

Project, Sheets, and Takeoff tabs organize the existing toolbar without resetting
the estimate. The logo and account stay outside the tabs. Profile includes account
cards and a Subscription section with configurable $40/$50/$60 monthly plans.
Production builds can connect Supabase accounts to RevenueCat-backed Apple In-App
Purchase and desktop/web checkout, with a server-owned license row and an opt-in
launch gate. When enabled, editing requires internet, an active subscription,
and the account's single active-computer lease. Offline, unsubscribed, and
second-computer sessions remain available for viewing and export in read-only
mode. See [launch authentication, billing, and installers](docs/LAUNCH_AUTH_AND_BILLING.md)
and the [toolbar integration notes](docs/TOOLBAR_SUBSCRIPTIONS.md).

**Owner-controlled app updates:** signed Windows installations check the public
`luisgarin03/Takeoff` GitHub release feed at startup and every four hours. Users choose
when to download and must confirm **Restart and install**; the app never installs an
update silently. Pushing a version tag such as `v0.2.0` runs the guarded Windows release
workflow, signs the NSIS installer, and publishes the installer, block map, and
`latest.yml` update metadata. iOS releases continue through App Store Connect and the
App Store review/update channel.

The **Takeoff** tab also contains the live condition summary. It shows the armed condition, scale/drawing guidance, current condition totals, visible shape count, and zoom without covering the plan canvas. The card wraps with the other Takeoff controls on narrower screens.

Experimental Takeoff features stay in a hidden floating panel so the everyday toolbar and canvas rail remain balanced for deployment. Quickly click or tap the unchanged Beitzell Estimating logo three times to toggle **Experimental tools**. The panel contains the working Report, Zone, AI, Revisions, Render settings, and Command line controls; close it with × or Escape.

Theme panel: choose any interface accent color with the Accent color picker. The choice previews immediately, saves in this browser, and applies to buttons, highlights, focus rings, and sliders in light and dark mode. Reset accent restores the default blue. Logo, cursor, and takeoff condition colors remain separate.

The hatch pattern picker opens above the canvas and stays within the window, including when used in the toolbar or docked conditions panel.

After sign-in, a welcome screen replaces the automatic Drive folder prompt. Free accounts see a view-only message and Get Premium opens subscription options; active subscribers see a welcome-back message.

User Guide is now in the top bar, immediately left of the profile, and stays available across toolbar tabs.

The Find panel's **Help** tab explains every search, suggestion, navigation, and highlight control. Drag either lower corner to resize the panel down to the screen's bottom edge; the panel keeps a small margin so its controls remain reachable.


### Print plans

Choose **Print...** in the project dropdown to open the centered print panel with a left settings sidebar, fixed bottom actions, and a large page preview on the right. Select the current page, all pages, or individual pages across loaded files. Choose Compact/Balanced/HD quality, paper size (including original sheet size), automatic/portrait/landscape layout, and margins. Toggle markups/notes, takeoff measurements, and grayscale independently. **Prepare preview** creates a PDF containing only the selected plan pages, in plan order, with no cover. **Print...** opens the browser print dialog for printer, copies, and duplex settings; choose matching paper and 100% scaling for the prepared layout. The prepared PDF can also be opened in a new tab. Plans fit within the chosen margins without stretching, which can change drawing scale. Print output uses white paper and excludes temporary Find highlights. Close or Cancel stops preparation after the current page. All processing stays in your browser.


### Unified save settings

The project dropdown now has one **Save..** entry. Its centered panel explains **Full project** (all available plans and project content) and **Marked pages only** (a separate smaller copy retaining measured, marked, or bookmarked pages). Edit the filename or choose **Choose a new location / Save as**. **Create a dated backup copy** adds a timestamp and preserves the active save destination. For an already compact project, saving preserves only available content; restore missing originals before making a complete source-plan backup.


Text and number fields and multiline text areas share a consistent gray outline, rounded corners, and padding, with a visible keyboard-focus ring and backgrounds matching the app theme.

Text-field styling also covers dates, times, editable labels, and text areas. Fields use compact vertical padding, gray upper/left borders, and softer lower/right borders. Light mode uses white fields; dark mode uses charcoal fields with light text.

The Takeoff toolbar summary card contains the editable active condition name, multiplier, and waste allowance. The separate appearance row now contains only appearance controls. Waste still affects report order quantities only, and the docked condition editor retains its existing controls.

The condition summary shows its editable name once; the totals section displays quantities without repeating that name.

Drawing-tool rail menus expand upward as needed to show their full list within the available screen height; scrolling is retained only when the list exceeds the viewport.

The sheet selector and previous/next controls sit in the top header immediately after Takeoff, available with either toolbar tab open or collapsed.

The Sheets tab strip shows bookmarked pages when any are available, including automatic markup bookmarks, in plan order. With no bookmarks it shows open sheets. The overflow menu retains access to other open pages; bookmarking is separate from closing a tab.

Plan set PDF headers show the filename in normal text with a page count. A separate **Erase** button on the right removes the PDF using the existing removal confirmation and affected-page preview.

Conditions opens as a centered panel over an undimmed canvas, retaining Takeoffs, Library, Materials, and Columns. Close with ×, Escape, or outside the panel; the canvas no longer shrinks when it opens. Panel tab/filter state survives reopening.

Hatch previews use independent SVG patterns so selecting a condition or hiding its toolbar does not hide matching hatch swatches elsewhere.

**+ Condition** opens a centered New condition dialog instead of a browser prompt. Enter a condition name, then choose **Add condition** or press Enter. Cancel or Escape dismisses it without adding anything.

The estimating toolbar, condition controls, and Markups/Stamps/RFIs drawer use solid shadcn-inspired surfaces, compact tabs, flat fields, and neutral borders in light and dark mode. Takeoff palette colors remain unchanged.

**Project Data..** combines project details and the plan set. Edit the project name, submission/due date, and status at the top and choose **Save details**; manage PDFs and select pages below. The former Edit project details menu entry now opens this combined panel.

Subscription verification reads protected Supabase entitlements through the existing billing integration. RevenueCat payment synchronization is configured separately; missing subscription records do not grant paid access.
Project calendar displays local project due dates and read-only Google Calendar events. Click an event to view its date, location, notes, links, and attachments in a detail card; app events expose edit/delete controls when you have editing access.

Calendar bid details: click an event for the tall scrolling bid card. With editing access, use the pencil or Take meeting notes to enter project, client/GC, contact, due time, amount, folder, document links, original invitation, location, and notes. Project fields travel with project metadata; app-event fields save in the event description. Google events remain read-only. Missing information is shown as Not added.

Stripe sandbox subscriptions: Estimating Pro is $40/month or $400/year through test-only Stripe Checkout. See [setup and test guide](docs/STRIPE_SANDBOX.md). No real card charges are enabled.

Calendar authorization restores the calendar and current project after Google approval. Active Stripe sandbox subscriptions enable local development testing; hosted production builds still require a production license.

Load sample plan waits for PDF import to complete and reports download/import errors with a retryable button. Sign in with editing access in the current browser before importing a sample.

The empty workspace landing card includes a Sign in button that opens the account login form.

Google sign-in requests read-only Google Calendar access during the initial consent flow and saves the connection for Calendar.

Connected Google calendars load automatically when Calendar opens; each account's calendar visibility selections are remembered in this browser.

Google Calendar imports preserve calendar and individual event colors.


Google Calendar editing: approve editing access in Calendar Settings. Use + Google event to create events; open an event and choose Edit to change dates, location, description, Google color, recurrence, attendees, reminders, visibility, availability, or RSVP. The editor supports duplicate, move, and confirmed deletion; recurring occurrences and the full series are separate edit choices. Drag and resize writable Google events to reschedule. Manage Google calendars in Settings provides creation, renaming, colors, quick-add, availability, preferences, sharing, and confirmed secondary-calendar deletion. Google account permissions are enforced on the server and stale event changes are rejected with version checks. Invitation/update emails are opt-in. Existing read-only authorizations continue to display events until editing permission is approved. Administrative ownership transfer, primary-calendar clearing, and webhook channel management are not exposed in the app.

Google event descriptions are edited as readable text rather than HTML source.
