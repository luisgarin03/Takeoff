# Changelog

## Unreleased — Takeoff text-note controls

- Kept the Text-note leader-arrow button and selected-arrow remove control at a fixed physical screen size throughout Takeoff pan/zoom gestures, without changing the note, leader geometry, export, or undo behavior.

## Unreleased — Whiteboard toolbar frame

- Matched the Whiteboard top toolbar shell to the estimating toolbar with a compact 58px desktop height, a subtle workspace-colored border, and no dark outline, while leaving every toolbar control unchanged.
- Replaced the selected-object × in the Whiteboard toolbar with a red **Remove** button positioned at the top-right of the selected file, note, arrow, or rectangle. The button keeps a fixed readable screen size as the board zoom changes. Removal retains the existing read-only guard, keyboard shortcut, save path, and undo/redo behavior.

## Unreleased — Sample plan loading

- Wait for sample PDF import to finish and always release the loading button on success, blocked imports, or errors. Show actionable download/import errors and bound sample downloads to 30 seconds.

## Unreleased — Calendar return and Pro test access

- Calendar authorization returns to Calendar instead of opening subscription/account screens, retains the project, and strips old checkout parameters. Fixed development remount handling of the reopen flag. Active Stripe sandbox subscriptions are recognized for local development testing without granting production licenses.

## Unreleased — Stripe sandbox subscriptions

- Added authenticated test-only Stripe Checkout for Estimating Pro monthly ($40) and yearly ($400), server-verified subscriptions, signed webhooks, customer portal, and sandbox status labels.

## Unreleased — Calendar-only authorization

- Calendar connection requests only Calendar read permissions, removes Drive settings from the Calendar panel, and disconnects Calendar without revoking existing Drive access. Fixed browser preflight headers required by the Supabase client.

## Unreleased — Google Calendar connection recovery

- Granted the server function the missing permission to save Google connection metadata, retained browser read-only access, and added specific Calendar authorization/service errors.

## Unreleased — Bid details in calendar

- Added a tall scrolling bid card with project, client/GC, contact, due time, amount, folder, document and invitation links, location, and meeting notes. Bid details can be edited with project/event editing access and persist in project metadata or the event description.

## Unreleased — Calendar event cards

- Clicking an event opens a scrollable detail card with dates, location, notes, safe links, attachments, and permitted edit/delete actions. Project deadlines open their project from the card; Google events remain read-only.

## Unreleased — Calendar dark appearance

- Styled the calendar with charcoal chrome, a near-black grid, subtle dividers, readable controls, and blue today markers in dark mode.

## Unreleased — Consistent text fields

- Unified text and number inputs and text areas with the project-name field style: thin gray borders, rounded corners, consistent padding, and visible keyboard focus, with light and dark editing surfaces matching the app theme.

## Unreleased — Unified save settings

- Replaced the project dropdown save actions with one **Save..** entry and removed Cloud projects. Added a centered settings panel with explained full/marked-pages-only options, editable filename, Save as, and dated backups that preserve the active file destination.

## Unreleased — Print plans

- Added Project > Print with individual page selection, PDF preview, quality, paper, layout, margins, grayscale, and independent markup/takeoff controls. Printer, copies, and duplex are selected in the browser print dialog.

## Unreleased — toolbar and Profile

- Restored the current-page highlight in the nested PDF page selector after the shared workspace dropdown theme had overridden ToolMenu's active background and border. Active rows now expose `aria-current` and retain a theme-aware accent in both light and dark modes.
- Required a save destination after the first plan import into a named local project, then immediately writes the complete `.otk`. Fast browser recovery still saves about a second after edits, while retained writable project files now receive coalesced background updates after 30 quiet seconds or at least every two minutes during continuous work; archive generation waits for idle time and never opens a background permission prompt.
- Reworked the current-sheet selector into collapsible PDF sets with pages nested directly under their source file. The active PDF expands automatically, other sets load their page count only when opened, favorites remain first, and collapsed files do not mount thousands of hidden page rows.
- Added markup operations to the shared chronological Undo/Redo history, including creation, deletion, movement, text/style edits, and text-leader placement, repointing, or removal. A selected text leader now shows a blue endpoint handle that can be dragged independently of its text box, while clicking the shaft still selects the note. A red × beside the selected arrow tip and a matching Markups-panel action remove only the leader; Undo restores it.
- Added a leader-arrow control to every canvas Text note. Arm it from the text box or its Markups row, then click the plan point the note should identify; Escape cancels targeting. The leader stays attached while the text box moves and is included in marked-page PDFs and Whiteboard imports.
- Linked canvas markup selection to the Markups panel. Selecting a note, callout, cloud, arrow, highlight, highlighter stroke, or stamp now highlights and scrolls its panel row into view; clicking a row selects the canvas markup so its existing text, color, style, weight, and RFI controls are immediately available.
- Replaced the five generic fresh-workspace conditions with three fence defaults: **Chain Link Fence**, **Wood Fence**, and **Aluminum Fence**. Existing projects and reusable condition libraries are not migrated or overwritten.
- Made the live Takeoff summary's left accent follow the selected condition's line color, updating immediately when the active condition or its color changes.
- Added **Download JSON File** directly below the Find summary. It exports the complete latest completed search from cached results with schema `1.1`, independent page/PDF rankings, zero-match searched PDFs, per-keyword totals, exact matched text and bounded context, available normalized coordinates/page metadata, navigation references, and deterministic construction categories. Rank, one-match filtering, and highlight visibility do not alter the export, and no PDF is rescanned.
- Simplified the top toolbar with a blueprint project selector, User Guide beside the profile, and closed-by-default Sheets/Takeoff tabs. The live zoom percentage now sits immediately left of User Guide instead of inside the Takeoff summary. Renamed the gallery button to Loaded files.
- Added a **Rank** control beside Find's Matching pages heading. It toggles the result list between normal plan order and highest-to-lowest per-page match count, with stable ordering when pages have equal totals.
- Added **Hide 1 match pages** to filter low-signal one-match pages out of Find's list and navigation without deleting their highlights. Find now requires whole-word boundaries, preventing terms such as **gate** from being counted inside **aggregate** or **gated**.
- Pages containing saved markups now receive an automatic blue pencil bookmark in sheet tabs and page menus. These pages join the Bookmarked group without changing manual star data; deleting the final markup removes the pencil and reveals any underlying manual star.
- Added collapsed-by-default PDF sets, explicit red removal buttons with page counts, and affected-page hover previews. Simplified gallery controls.
- Made Find matching-page results grow with the panel and added illustrated control help.

- Removed the Find panel's 760px height cap and expanded its Help tab with explanations for every control.

- Fixed Count PDF overlays so exported page PDFs, Marked Sets, and Whiteboard imports retain the same condition-colored square with a white outline shown on the Takeoff canvas instead of changing Count marks into circles.

- Raised takeoff markups above the selectable PDF text layer visually and in hit-testing. In Select mode, an overlapping note, callout, cloud, arrow, or highlight now receives the click/double-click first, while unobstructed PDF text remains selectable and copyable.

- Added a per-condition **No mark / Circle / X** marker selector for Linear takeoffs. **No mark** is the default, preserving existing plain-line conditions; optional screen-constant markers repeat along straight and curved runs, carry into flattened page/Marked Set/Whiteboard-import PDFs, and remain strictly visual so measurement geometry and LF totals are unchanged.

- Added owner-controlled application updates. Signed Windows installers now use a fixed GitHub Release feed, check on launch and every four hours, expose manual check/download controls in Profile, show download progress, and install only after the user confirms a restart. A tag-gated GitHub Actions workflow requires matching versions and Windows signing secrets before publishing the NSIS installer, differential block map, and update metadata. iOS remains on Apple's approved App Store update path.

- Added launch-ready Supabase/RevenueCat subscription infrastructure: server-owned per-user license records with read-own RLS, verified billing webhooks, authenticated entitlement refresh, Apple-native purchase/restore support, identified hosted checkout for Windows/web, and an opt-in sign-in/license gate that stays disabled until production configuration is complete. Production gating rejects sandbox transactions by default while preserving paid access through a recorded billing-grace period. Editing now additionally requires internet and a short server-owned one-computer lease; offline, unsubscribed, and second-computer sessions open read-only while retaining viewing and export. A persistence-level write guard backs up the disabled editing UI. Added the Capacitor iOS project, iOS sync/open scripts, Windows code-signing configuration, focused license tests, and a full release/setup checklist. No payment, Supabase, Apple, or signing secrets are committed.

- Added a hidden floating **Experimental tools** panel for deployment-facing cleanup. Three quick clicks or taps on the visually unchanged Beitzell Estimating logo toggle the panel. Report, Zone, AI, Revisions, Render settings, and the Command line retain their existing behavior there, while their former Takeoff-toolbar and canvas-rail positions close up naturally on desktop and mobile.

- Group estimating controls into Project, Sheets and Takeoff tabs, keeping logo/account outside.
- Preserve mounted control state and use scroll-safe dropdowns on mobile.
- Restyle Profile with account cards and configurable $40/$50/$60 subscription plans.
- Connect the billing adapter to RevenueCat and Supabase while retaining safe unconfigured behavior.

All notable changes to OpenTakeoff. Dates are release/merge dates on `main`.

## Unreleased

- Added exact page selection to Whiteboard's **PDF Export Pages** manager. **Select Content to Export** opens the manager; **Add Area** still creates a freeform crop, while **Select Pages** lets a user click any PDF or image card to add its exact content bounds and current PDF page. Linked entries follow moved cards, preserve separately selected pages from the same multipage PDF, avoid duplicates, persist with the project, and are removed with their source card. Closing the manager now hides every export outline and page label without deleting the saved selections, and its redundant “Whiteboard PDF” eyebrow was removed.
- Replaced the Whiteboard SOW panel's cropped legacy worksheet banner with the standalone Beitzell Fence Company logo. The default logo and editable takeoff title now use centered, matching horizontal insets in both the live panel and PDF exports.
- Fixed Whiteboard SOW line-item color palettes being clipped by the bottom of their panel. The full preset palette and custom-color control can now extend beyond the panel boundary while the panel retains its rounded header.

- Added persistent custom multipage Whiteboard PDF export. **Select Content to Export** creates any number of numbered, overlapping world-coordinate rectangles with move/resize handles; the **PDF Export Pages** manager supports rename, locate, reorder, duplicate, delete, per-page orientation, paper size, Standard/High/Maximum quality, preview, confirmed Clear All, and one-file export. Area geometry and settings save with local/cloud/`.otk` projects and participate in undo/redo. Exports clip every page exactly, omit all selection UI, preserve aspect ratio, render regions sequentially with progress/cancellation, retain per-source raster safeguards, and avoid the legacy 64-megapixel combined-board limit by processing each selected page independently.

- Made pages sent through **Import to Whiteboard** open at a full plan-scale board size and automatically fit the newly selected page to the Whiteboard viewport. Existing distant notes/SOW panels no longer shrink a new import into the whole-board overview, and the larger saved page footprint provides more usable detail before the 400% zoom ceiling.

- Fixed **Import to Whiteboard** text-note orientation on rotated PDF pages. Preserved vector pages now compensate markup text for the source page's 90°, 180°, or 270° PDF rotation while retaining the correct note position and horizontal note box.

- Moved the live condition/measurement summary from its floating top-right canvas overlay into the **Takeoff** toolbar tab. Scale prompts, drawing guidance, condition totals, shape count, zoom, One-Click status, and per-wall height editing remain available without covering the plan and now wrap with the toolbar on narrow screens.

- Fixed PDF export quality for construction drawings: **Import to Whiteboard** now preserves the original current PDF page as vector content and adds measurements/markups over it, eliminating the former Balanced-JPEG pass before HD export. Protected or unusually large pages fall back to the maximum safe HD raster. Compact and Balanced retain substantially clearer small text, while HD automatically fits oversized sheets to the safe 16-megapixel raster ceiling instead of failing because of rounded pixels or an enlarged Whiteboard card. Whiteboard now budgets the renderer's actual flattened pixels rather than its editor display size.

- Moved **Open ChatGPT ↗** and **Project Assistant** from the always-visible workspace overlay into the canvas **AI** Agent drawer. Opening Project Assistant closes that drawer before showing the resizable assistant, leaving the plan workspace unobstructed.
- Added a shared PDF quality chooser to **Project > Download this page** and every Whiteboard PDF export. Compact, Balanced, and HD show estimated output-size ranges before rendering, remember the latest choice, and report the actual completed size. Balanced/HD raise the flattened-plan raster budget for small construction callouts while the distribution PDF still drops source OCR/text, fonts, forms, annotation data, metadata, and complex resources. OpenTakeoff vector annotations stay sharp and lightweight; Whiteboard notes and SOW panels re-render at the chosen quality.

- Added separate ChatGPT choices without removing either workflow: **Open ChatGPT ↗** launches the regular `chatgpt.com` website in a new tab using the user's existing account, while **Project Assistant** retains the optional API-powered, resizable/dockable cross-workspace assistant. The direct ChatGPT link is also available from the assistant header. The project assistant's streamlined interface includes a normal message composer, prompt suggestions, New chat, collapsible Project context, compact conversation options, and assistant/user conversation styling. OpenAI credentials and model selection remain server-only; requests are size/rate/time limited, streamed, cancellable, and use `store: false`. Estimators explicitly choose page/project context and metadata sharing. A strict local tool registry grounds answers in bounded PDF text, existing Find/OCR keyword marks, authoritative takeoff/report totals, scales, SOW, whiteboard, calculators, RFIs, compact-project status, and revision summaries. Citations navigate back into OpenTakeoff. Supported bookmarks, metadata, SOW rows, and RFI drafts require approval, reject stale project state, and expose immediate Undo. Chat persistence is bounded, optional, additive, and key-free; unconfigured deployments continue normally.

- Added **Save project with marked pages only** for projects that exceed the 512 MB portable limit. Compact `.otk` files retain full-quality measured, marked, page-bookmarked, and revision-referenced PDF pages; omitted content becomes lightweight page-number-preserving placeholders. Reopened compact projects explain the limitation and provide **Import missing files** for a folder, original PDFs, or ZIP. Restoration requires exact filename, byte-size, and SHA-256 matches, supports partial recovery, updates revision metadata, and never attaches measurements to a different plan revision.

- Enabled explicit English spelling, grammar, and autocorrect assistance in Whiteboard SOW title and line-item editors, with browser correction suggestions available from underlined text.

- Added an independent Chain-Link Fence Post Calculator linked to completed Linear takeoffs. Square terminal/corner markers snap and drag along cumulative polyline distance; circular line posts are derived per section using `ceil(length / maximum spacing) - 1`, with a 10 ft default, metric display, closed-loop handling, visibility/size controls, dedicated undo/redo, project and `.otk` persistence, Report quantities, and exported PDF overlays. Existing linear geometry and totals remain unchanged.

- Added independent file favorites to the Sheets selector. Every loaded PDF now has its own star, favorite files group ahead of the remaining files without changing source order, and file favorites persist separately from page bookmarks through autosave, revisions, cloud/local storage, and portable `.otk` projects.

- Connected completed takeoff measurements to the Whiteboard SOW workflow. The first SOW panel now keeps one `[combined measurement] - condition name` line per condition instead of one row per measured segment. Precise LF values are summed before the final condition total rounds upward once; adding, editing, reassigning, or deleting measurements updates or removes that live total. Each segment retains its own persistent matching plan callout, whose condition-colored box and arrow point back to its measured geometry. Compound undo/redo restores the linked total and callouts, while manual and manually duplicated SOW rows remain independent. New automation still runs only at the completed-measurement commit, so condition setup, previews, copy/paste, hydration, and undo/redo do not create duplicates.

- Reduced exported PDF weight by flattening source plan/PDF pages into bounded JPEG images and re-encoding/downsampling Whiteboard image attachments when useful. Source OCR/search text, hidden text, embedded fonts, metadata, and complex page resources are left behind, while visible takeoff geometry, notes, SOW content, highlights, and markups remain export overlays.

- Fixed slow plan imports introduced by compatibility checking. Fast auto-detect now applies consistently to local drops, Google Drive selections, portable projects, saved-plan first use, and newly imported plans; it checks only the first page before opening and defers later-page rendering until navigation. Local and cloud imports also reuse the bytes already read for validation instead of reading large files twice. Explicit **Verify every page** behavior is unchanged, and OCR remains Find-only.

- Mapped the keyboard Left/Right Arrow keys to the Sheets toolbar's previous/next page controls. Navigation stays within the active PDF and is suppressed while typing, using menus or dialogs, editing an unfinished canvas interaction, or displaying sheets side by side.

- Added **Import to Whiteboard** to the Sheets toolbar. It creates a crisp one-page PDF from the currently focused page, including measured takeoff lines, saved markups/notes, and visible Find highlights, then opens that marked page through the normal Whiteboard attachment workflow. Automatic colored condition and quantity labels are omitted to avoid duplicating manually added notes.

- Reduced the default SOW worksheet width so it is proportionate to Whiteboard plan cards and lowered its minimum resize width. Its typography, line-item rows, padding, and branding header now use compact plan-scale dimensions on the board, with matching measurements in PDF exports, so a SOW does not visually overpower an adjacent construction sheet. Replaced its fixed combined branding banner with one framed header section containing a replaceable logo and persisted editable takeoff-title field; the divider makes the logo area independently resizable. The fixed “Project Estimating Worksheet” subtitle is removed, the **SOW** section heading is now editable, and screen plus PDF exports share the same layout. Split the SOW add action into **+ Line Item** and **+ Title**. Titles are bold black text without color controls and remain editable, reorderable, duplicable, persistent, and exportable alongside color-coded line items. Every title and line item now has an **AA** action to convert its text to uppercase through the normal undo/save path. Whiteboards can now hold multiple simultaneously visible SOW panels: add a blank panel from the toolbar, rename it in place, duplicate it as an independent offset copy, or delete it without reusing the same worksheet for another scope. Legacy scope tabs migrate into separate panels, and all panels participate in undo/redo, local/cloud/`.otk` persistence, and every Whiteboard PDF export mode.

- Saved plan projects now open with Fast auto-detect by default instead of rendering every page during every initialization. Successful compatibility checks are cached with a lightweight file signature and reused until the PDF changes; **Project > PDF opening & OCR** can restore strict every-page verification. Find OCR now has independent Automatic, Ask first, and Off preferences, with Ask first applying once to each search job.

- PDF compatibility checks no longer reject an entire plan set because one page cannot be painted by PDF.js. OpenTakeoff keeps any document with at least one renderable page available so readable pages can open and Find can continue extracting searchable text; wholly unreadable, invalid, password-protected, and unsupported-protection files remain blocked.
- Find now falls back to bundled, local browser OCR when a PDF page has no usable selectable text. Scanned plans can be searched and highlighted without an external OCR service, while normal text PDFs retain the faster text-layer path.
- Moved the two-point calibration instructions and real-length input into the **Takeoff** toolbar tab so the expanded top toolbar can no longer cover the feet/meters field.

- Added branded, movable and width-resizable Scope of Work panels as true Whiteboard objects. New projects receive one empty **Scope 1** panel; users can add, rename, duplicate, move, resize, and safely delete independent panels, plus add, edit, duplicate, delete, recolor, and reorder fully wrapped entries inside each one. Scope copy wraps only between complete words both on the board and in PDF exports. Panels use the full ten-color Whiteboard palette, follow pan/zoom, participate in undo/redo and all existing project save paths, and appear together in full, paginated, and selected-area PDF exports at their saved board positions and widths. Resize handles, editor-only footer controls, counts, and add buttons stay out of exported PDFs.

- Added **Export whiteboard as pages** beside the existing single-page action. It creates a multi-page Letter-landscape PDF for easier sharing and printing while preserving the Whiteboard's canonical arrangement, attachment crops, notes, arrows, and rectangles.

- Whiteboard full-page and selected-area PDF exports now share the exact logical attachment geometry used by the live board. PDF detail changes sharpness without moving content, fractional image crops retain their unrounded layout size, mobile file controls no longer change the exportable preview box, and drawing bounds retain complete arrowheads and outline strokes at page/selection edges.

- Fixed one-page and marked-set PDF annotations that exported as tiny, unwrapped single rows. Captions now use one bounded multi-line paper-backed box at 12 pt, retain every word across rotated/cropped pages, and use the same sheet-relative layout, stroke widths, and arrowheads on the estimating canvas so zoom accurately previews the download.

- Added a shared white four-bar loading indicator for longer plan loads and renders, Find scans, exports, and project saves.

- Reworked PDF Find into a persistent, movable, non-modal panel. Searches now start only after a scope button is pressed, results are grouped into a clickable page list with per-page keywords and counts, and the arrow controls move between matching pages while pan, zoom, and drawing tools remain usable. Added **Find in all plans**, **Find in this PDF set** for every page in the focused PDF, and **Find in this page** for the focused sheet. Every completed run is an additive, deduplicated Search marks job with independent visibility, removal, and highlight-color controls, plus Unmark/Mark all pages and Remove all actions.

- Made the Find panel resizable, moved its long usage guidance into a dedicated **Help** tab, and removed the nested scrollbar from Search-mark color rows so completed searches display in full.

- **Download this page** now includes the current page's visible Find-job keyword highlights in each job's selected color; the source PDF and saved project remain unchanged.

- Added a native Fence Material Calculator with seven extensible, rule-driven calculators; matching isometric fence previews with live quantity context; scoped shadcn/ui components; instant validation and order rounding; user presets/favorites; active-takeoff LF/EA import; project, cloud, and `.otk` persistence; and conversion of selected results into the existing Supporting Materials estimate lines.

- Simplified the empty landing page to its background and centered card. Added Open Recent shortcuts with saved author and last-modified details.

- Canvas tool icons no longer appear over the landing page or plan gallery on small screens; they render only while viewing a loaded plan.

- Hid project sharing controls, invitation inbox/badges, and in-app sharing instructions behind a disabled UI flag. Sharing implementation and stored data are retained.

- Improved responsive layout: capped the phone toolbar height to leave canvas space, normalized control sizing, expanded Cloud and User Guide to the viewport, and stacked cloud file details on phones.

- Added direct Google Drive project sharing with Google Picker, email notifications for new read permissions, a private in-app invitation inbox and Cloud badge, selective download/import, and automatic opening of the imported `.otk`. Files remain in the sender's Drive; no intermediate file-storage bucket is used. Requires the invitation migration and updated Drive function/Picker configuration.

- Moved open-sheet tabs beside Report and Schedule into the Draw menu’s Measure section.

- Added Blueprint, Forest, Graphite, and Classic Paper report themes, retaining custom JSON import and Reset.

- The empty Plan Set landing page uses React Bits Color Bends behind the onboarding panel, with the shared animated Estimating by Luis Garin wordmark in place of the blueprint icon. It stays off PDF and Whiteboard workspaces, pauses in hidden tabs, and stays still with reduced motion enabled.
- Theme palette control now opens logo color, effect, brightness, and speed settings, applied live to the real logo and saved locally.

- Cursor theme offers Default (original grayscale), Red, Blue, Pink, Orange, Purple, Green, and Yellow. It changes immediately and saves in this browser independently of logo colors; Reset logo keeps the cursor choice. Drawing, text, pan, and resize retain their cursor roles. Busy cursors use the included static fallbacks.

- Reorganized the in-app manual into 16 clickable topics with formatted instructions, relevant button references, and existing app screenshots and animation.

- Added Project → Open Recent and a centered User Guide with internal scrolling and app icon/button references.

- **Download this page** now keeps takeoff linework, notes, and markups while omitting automatic condition titles and SF/LF quantity labels. The full Marked Set export still includes those measurement labels.
- Exported markup captions now use a tightly fitted translucent paper background with a colored border, keeping notes and callouts readable over dense plan linework without an offset-looking box.
- On-canvas note and callout backgrounds use the browser's measured Inter glyph width plus even horizontal breathing room on both sides of captions.

### Added
- Whiteboard arrows are now normal selectable objects: a zoom-independent hit area covers the shaft and arrowhead, selected endpoints can be adjusted, whole arrows can be moved or deleted, and every edit participates in the existing undo/redo and save paths.
- Added a Whiteboard rectangle tool with a transparent colored outline, live drag preview in every direction, shared selection/move/delete behavior, edge/corner resize handles, persistence, and full/selected-area PDF export.
- Added non-destructive crop editing for pasted and imported Whiteboard images. Eight edge/corner handles, an outside-area mask, Apply/Cancel, re-cropping, undo/redo, backward-compatible crop metadata, and PDF export preserve the original embedded image while showing only the committed crop.
- Custom browser-local Ctrl+key shortcuts for every markup tool. Assign from **Draw > Markup**, see the active binding in the menu, and clear or remap it without changing project save files.
- Whiteboard export can now download the full board with the renamed **Export whiteboard as PDF** action or a user-drawn rectangular area. Cropped exports use the selected rectangle as page bounds and clip notes, file content and arrows without changing project save data.
- Colored arrow markup in both whiteboard and plan drawing: drag over whiteboard references with the selected palette color, or click two points using **Draw > Markup > Arrow** on a sheet. Whiteboard arrows persist compatibly in the existing optional project data and are included in PDF exports.
- Whiteboard arrows now layer above PDF/image cards. Whiteboard PDF exports include note titles, selected header colors and swatches, and the existing colored note body/text instead of exporting only the note-colored rectangle.
- Per-item whiteboard header colors: choose a palette color from each file or note header. Note titles are editable inline; note-body colors remain independent. Header colors and titles persist in local, portable, and cloud project data; older projects retain their original appearance.
- Project-aware Save and Drive organization: named `.otk` suggestions, one-click updates through retained browser file handles, explicit Save As, and stable-ID Google Drive folders named after the project with a portable archive plus on-demand `PDFs/` and `Assets/` subfolders. Cloud success now waits for every required upload.
- Project metadata management in the existing Project menu: required name, optional submission date, Ongoing/Needs revision/Done status, ISO creation and persisted-modification timestamps, `.otk` and cloud round-tripping, and backward-compatible defaults for older projects.

### Changed
- Condition-name fields now grow with longer names, and measurement hover cards wrap long condition titles/details into a compact box. Canvas Text notes support explicit and automatic line wrapping; Enter inserts a line break and Ctrl+Enter places the note.
- Enlarged the canvas Text note editor into a resizable multiline box for longer annotations, edit existing notes directly in place without a detached second field, and keep the editor inside the visible plan area when opened near an edge.
- Whiteboard PDF previews now support selectable 1×–3× render detail and an explicit refresh action. Rendered canvases are capped at 8 megapixels per page to balance clarity and browser memory.
- Local Save handles are now scoped to the project that selected them. Creating or opening another project clears the old association, so its first **Save project** opens a new named destination instead of overwriting the previous project's `.otk` file.
- Whiteboard zoom now reaches 400% using the zoom controls, mouse wheel, or pinch gesture.
- Drive downloads now reject malformed metadata with an actionable integrity error and recheck cancellation/account identity after the final IndexedDB write. Three new regression tests pass; local verification retains the same 14 pre-existing branding failures.
- Completed another local Drive review: validate null begin replies, retain gateway error classifications, and recheck cancellation/account identity after response-body reads. Four new regression tests pass; the setup guide now requires a dedicated Google Cloud project for independent Drive revocation and records the latest staging-readiness checks.
- Hardened the optional Drive client against truncated responses, changed sessions, non-progress and invalid completion acknowledgements; classify bodyless HTTP 429 responses as quota errors. Added five regression tests and independently reran local web, Edge, browser and Android compile checks. Existing branding-test failures and live acceptance requirements remain documented in the Drive guide.
- Expanded workspace drawers by 30% at the desktop baseline, with viewport-aware growth, mobile overlays, safe-area spacing and wrapping controls. Shared drawer/toolbar condition-name inputs are 50% wider; panel tabs, filters, resize preferences and measurement handlers are retained.
- Replaced startup artwork with SelfMadeSystem's Uiverse `warm-lion-64` pattern and Flaticon Blueprint icon 1373067. Updated web/PWA, Android splash/launcher densities and Windows Electron icons; included artwork credits and license notices.
- Low overview zoom now switches to an idle-built preview of each completed sheet raster at 30%, returning to the retained full-resolution raster at 40%. Diagnostics provides a persisted 10–100% Preview Resolution slider (50% default), with dynamic dimensions, RGBA-memory estimate, generation timing, debounced replacement, and no PDF.js rerender. The preview shares the sheet coordinate system, and the large stage only holds `will-change: transform` for an active zoom gesture.
- Added minimal Android PWA support: manifest metadata, branded 192px/512px home-screen icons, and a network-only service worker that never caches drawings or project data.
- Report now layers above the canvas toolbar arrow and floating controls; its menus and dialogs retain their internal stacking order.
- Mobile Report layout (screens up to 768px): wrapped controls, viewport-bounded menus, and labelled cards for condition totals, By Sheet, revisions, and materials. Desktop/print layout and report calculations/exports are unchanged.
- **Download this page** positions linear measurement chips closer to their measured lines while retaining a visible gap so labels do not cover the markup.
- Hid the original top Theme, Mode, Draw, and Edit controls and their empty separators. Side rails retain the shared actions and shortcuts; highlighter ink, size, and tip controls remain accessible in the side Draw menu.

### Added
- PDF text search from the sheet toolbar or `Ctrl+F` / `⌘F`: opens an undimmed, movable top-right cross-plan search with editable scope suggestions, scans every page in every loaded plan, highlights all matches, and navigates between results across sheets.
- Optional private Google Drive binary provider alongside Supabase Storage, with separate server-side OAuth, encrypted refresh/session credentials, bounded resumable transfers, hash-verified local cache, owner/editor/viewer authorization per request and explicit provider selection. Includes additive migration, Android system-browser/deep-link connection, focused tests and setup/live acceptance instructions. No deployment or live cross-device acceptance performed. Cloud toolbar uses the requested colored cloud icon; takeoff/PDF rendering is unchanged.
- Optional Supabase cloud layer: email/password accounts with email-code verification/recovery, private project browser and owner/editor/viewer sharing, stable UUIDs, version-checked saves and conflict choices. Existing local autosave, `.otk`, measurement math and PDF rendering remain in place. Content-hashed originals use private storage; oversized/failed uploads stay Local Only. Includes schema/RLS migration, public-only Vite environment validation, setup notes and local integration/security tests. Hosted deployment and physical Android verification remain required.
- Supabase Google sign-in on localhost/HTTPS: branded Continue with Google button, local-save flush before redirect, one-time PKCE return/session restoration, preserved workspace, and safe cancellation/error messages. No Google credentials in frontend configuration. Native wrappers without a browser/deep-link return bridge keep email sign-in and explain the Google limitation.
- **Save project** now asks for a filename and uses the browser's Save As picker to choose a location when available. Unsupported browsers use a named download. Cancelling the picker does not create a download; failed writes are reported without committing a partial archive.
- Star bookmarks on sheet tabs and page navigation rows, with a Bookmarked section in the open-sheet dropdown. Toggling a star keeps the menu and current page unchanged. Bookmarks survive closed tabs, autosave, revisions, and portable `.otk` files; long lists scroll within the remaining viewport space.
- **Project > Download this page** downloads the current sheet with all committed takeoff marks and markups as a one-page PDF, including sheets without marks. Reuses the marked-set renderer without its cover, schedule or sheet stamp; side-by-side exports the focused sheet only.
- Whiteboard **Export PDF** creates one content-fitted custom page from all notes and selected PDF/image content, independent of the camera. Preserves PDF vectors where possible, uses bounded high-resolution text/annotation rendering, and reports empty/overflowing/unsupported content instead of silently dropping it. Existing save files and takeoff rendering are unchanged.
- Project whiteboard for drag-and-drop PDFs/images and editable colored notes, with move/resize, PDF page navigation, pan/zoom, fit, and session undo/redo. Board data participates in autosave and revisions. Portable project format v2 packages original whiteboard attachments once across revisions, validates them on import, and still opens v1 files. Takeoff coordinates and plan rendering are unchanged.
- Portable `.otk` project files from the toolbar and Plan Set header. Save embeds original PDFs, annotations, calibration, tabs, and revisions; Open validates the archive and imports atomically into a separate local workspace without replacing existing projects or changing measurement/rendering logic.
- Optional virtual trackpad in the bottom-right controls: Trackpad Settings supplies a Show toggle plus live 50–100vw width, 40–150px height, and 35–100% opacity controls (75vw × 60px at 90% opacity by default), while relative touch/mouse aiming and tap-to-place continue through the existing canvas handlers, shared crosshair, and snapping.
- Synchronized black-and-gray palette Theme icon below Revisions in the bottom-right canvas rail, using the toolbar theme handler and current light/dark state.
- Icon-only Draw (pencil) and Edit menus above Finish/Pan in the canvas rail, sharing toolbar tool choices, edit actions, availability, and active tool state. Rail menus stay within the viewport and isolate canvas pointer events.
- Conditional checkmark Finish button above Pan in the bottom-left canvas controls, sharing the toolbar completion action and visibility, with a live accessible point count and isolated pointer events.
- Pan and Select square buttons above the bottom-left zoom controls, synchronized with toolbar MODE controls and existing keyboard shortcuts.

## 2026-07-21 — opentakeoff-mcp 0.6.0: sheet vision

### Added
- **`view_sheet` — the twelfth tool, and the agent's eyes: render any sheet (or a crop of it) to PNG with a calibrated measuring grid and a committed-shapes overlay.** Seeing wasn't the whole gap — measuring was. The workflow the description teaches: full-sheet overview first, then tight crops at higher `px` until dimension strings and room labels read cleanly; `region` is image px — the same space as every other tool — so a pixel located in the render maps straight into `one_click`, `measure_polygon`, or `read_sheet_text`. `overlay:true` burns the session's committed shapes into the render (human-affirmed ink solid, unreviewed machine shapes dashed — the same reading the canvas gives those states), so an agent can verify its own commits landed where it intended and sanity-check a trace that leaked or landed in casework. `grid` burns in a calibrated 1-ft/5-ft measuring grid with foot labels counted from the crop's corner — `"auto"` derives it from the sheet's set scale; before any scale is set, the drawing scale off the title block (`"1/4"`, `"3/16"`, `"0.25"`) works on its own — so an agent counts cells between walls exactly like an estimator scaling a plan, instead of eyeballing. The one image-reply tool (PNG content item + JSON meta text item; deliberately no `outputSchema` — image replies aren't structured output). Rendering rides the same optional native canvas as the sheet-image resource: platforms without it get a clean self-describing error and every other tool untouched. Grid math pinned by unit test (`1/4"` → 36 image px/ft at render scale 2.0; `"auto"` is the reciprocal of `upp` and agrees with the drawing scale on the demo plan); conformance covers the image reply shape, the crop/zoom meta, byte-level overlay proof, and the no-plan/unknown-sheet/degenerate-region/junk-grid error surfaces.

## 2026-07-21 — the Command box (RFC #59, slices 1–2)

### Added
- **A Command box in the toolbar — type a takeoff command, and it runs through the exact actions the buttons run.** `carpet one waste 7` activates (or creates) CPT-1 and sets its waste; `waste 12` patches the active condition; `label Phase 2` arms a shape label, learning it into the vocabulary if it's new; `clear label` disarms; `note verify seam direction with GC` drops a text markup on the focused sheet and opens the Markups dock. The grammar is deterministic — a pure transcript→intent parser (`web/src/lib/voiceIntent.ts`) with Div-9 tag synonyms ("carpet one" → CPT-1), number words, decimal and percent forms, homophone handling ("waist seven"), and hard rejection of anything ambiguous: garbage never guesses, it explains itself in red. Every parsed intent routes through a pure dispatcher (`web/src/lib/voiceActions.ts`) over the same capability calls the UI's own controls make — **no voice-only mutation path exists**, proven two ways in tests: ordered call-log equality, and voice-driven state deep-equaling the equivalent UI-driven state across every grammar production. This is the wiring for RFC #59's push-to-talk dictation — the on-device recognizer slice will feed the same box. Both slices contributed by @karthikyeluripati.

## 2026-07-21 — opentakeoff-mcp 0.5.0

### Added
- **`detect_rooms` — the eleventh tool: batch room detection from the sheet's own labels.** One call reads every room-number label off the sheet's text layer and runs the One-Click flood at each; only cleanly-traced rooms return (a leaking or dense-linework label is silently withheld, matching `one_click`'s precision stance). Same contract as `one_click`: px-only preview without a scale, per-room `area_sf`/`perimeter_lf` with one, `condition` commits every detected room with the standard agent/unreviewed provenance stamp, and a declared `outputSchema` like the other ten.
- **A per-tool conformance suite backs the whole surface** (`mcp/test/conformance.test.ts`, closes #27): every tool's valid replies are schema-validated, every misuse path is a clean `isError` + JSON `{error}`, schema-invalid arguments pin the SDK's `-32602` surface, and the session is proven to survive every failure. Runs in CI on Ubuntu and Windows.

## 2026-07-20

### Fixed
- **Jagged, blocky linework on very large ingested images.** An ingested image becomes a 1 px = 1 pt PDF page, so a 7920×5280 scan minted a 7920-point-wide page — and the base raster's fixed ×2 scale then built a 15840×10560 canvas (669 MB backing store). The pixels in it were actually crisp, but a canvas that size blows past Chrome's GPU budget, so the compositor silently displays a degraded low-res proxy: giant nearest-neighbor blocks at any zoom, on that sheet only. `autoRenderScale`'s floor no longer overrides the physical caps — oversized pages now render below the ×2 baseline, inside the 28 MP panel budget (the existing `factorFor` scale plumbing already handles non-baseline rasters), and deep zoom stays sharp through the detail-view re-render as usual. Regression-tested in `web/test/renderBudget.test.ts`.

### Tests
- **MCP tool-conformance suite — every tool, both directions** (`mcp/test/conformance.test.ts`, closes #27). Each of the eleven tools now has: a canonical valid call whose `structuredContent` is validated against the tool's declared output schema and byte-checked against the back-compat text item; semantic-misuse cases proving a clean `isError` + JSON `{error}` reply (no-plan gates, unknown sheets, degenerate calibrations, unenclosed one-click seeds, non-PDF documents, unwritable export paths); and schema-invalid-argument cases pinning the SDK's `-32602` input-validation surface — with follow-up calls proving the session survives every failure. Also covers title-block sheet addressing, exact scale math on the demo plan, deduct-role subtraction, provenance receipts on export, and `read_sheet_text` region windows.

### Added
- **Curved Line tool (`Q`)** — like Linear, but the line bends smoothly through your clicks: radius walls, curved transitions, winding corridors. A centripetal Catmull-Rom spline (`web/src/lib/curve.js`) passes through every clicked point; LF is priced at the **true curved length**, not the chords, and a condition thickness yields border SF exactly like Linear. The shape stores only the clicked control points — drag one later and the curve re-smooths — while rendering, hit-testing, thickness re-flow, and re-scale re-flow all measure the flattened spline (vertex-capped, render-invariant). Curved shapes ride the normal linear schema plus a `curved: true` flag (declared in `docs/CONTRIBUTION_SPEC.md`); older readers degrade to the straight polyline through the points.
- **`detect_rooms` — the MCP server's 11th tool: batch room detection from the sheet's own labels.** Reads every room-number label off a sheet's text layer (`134`, `139A`, `OFFICE 101`) and runs the existing One-Click flood at each one in a single call — one round-trip instead of `read_sheet_text` + reasoning + N `one_click` calls. Only cleanly-traced rooms come back; a label that leaks or lands in dense linework is silently withheld, matching `one_click`'s own precision stance. Same contract: no scale set returns px-only quantities per room; pass `condition` to commit every detected room under that finish tag with the standard agent/unreviewed provenance stamp. Pure core lives in `web/src/lib/detectRooms.ts`.
- **Local-first sync, continued (Slices 5b–7).** A conflict defer-gate (`web/src/lib/canvasBusy.ts`) holds a remote sync adopt until the canvas is genuinely idle — covering trace/calibrate/check in progress, One-Click review, an active drag, the open text editor, an in-flight OCR scan, and (extended in review) the in-canvas agent mid-run or its staged proposals, so a background sync can never wipe unsaved or unreviewed work. The sync layer itself is gated behind a build-time flag (`VITE_CLOUD_SYNC=1`), never a per-user toggle. `docs/SYNC_ARCHITECTURE.md` documents the design: IndexedDB canonical, revision-precondition conflict handling (remote wins on real divergence, local is snapshotted first — nothing lost silently), and a provider seam so Drive can be swapped for OneDrive/SharePoint later.
- **A no-waste "Labor view" for the Report's Columns picker.** One click hides the waste-baked columns (Waste %, SF w/Waste, SY w/Waste) and surfaces the raw **Total SF** column (previously opt-in only) — a standalone quantity view tied directly to conditions, for anyone attaching their own labor rates externally. **Reset** returns to the default view.
- **Flip Horizontal / Flip Vertical**, in the Edit menu. Mirrors the selected shape about its own bbox center — an isometry, so SF/LF never change. Routes through the existing shape-command layer, so undo/redo and provenance stamping come for free. No keyboard shortcut (the single-letter tool hotkeys don't guard Shift). The Edit menu also gained a **Redo** label — `⇧⌘Z` already worked, it just wasn't listed.

### Changed
- **Report quantities that carry waste now read "w/Waste," not "SF ordered."** On-screen table, CSV, and Excel: `SF w/Waste` / `SY w/Waste` / `Total SF w/Waste` / `LF w/Waste`. Only display strings moved — the underlying `total_sf_net`/`sy_net`/`lf_net` keys and the versioned JSON export are unchanged.

### Fixed
- **Zoomed-out pan flicker + laggy toolbars.** Panning while zoomed out was re-rendering the entire canvas component (including the full unmemoized shape/markup SVG overlay) on every ~90ms sync tick, even though nothing visible depended on the pan position — only scale-dependent stroke widths did. The tick now skips the state write when scale hasn't changed and the high-zoom detail view isn't engaged, so a pure pan at overview zoom is a true no-op on the React side.
- **Two conflicting `Content-Security-Policy` headers were shipping to production.** `netlify.toml` and `web/public/_headers` both set a CSP on `/*`; multiple CSP headers are each enforced by the browser as a per-directive intersection, and `netlify.toml`'s block predated the Google-sign-in work, so it would have silently stripped `accounts.google.com`/the webfonts origins back out — breaking sign-in and fonts with no visible error — the moment team cloud mode's env vars are set in production. `_headers` is now the single source of truth; its `connect-src` stays deliberately open (`* data: blob:`, not narrowed to Google-only) so the BYO-AI agent endpoint and the optional `/ai/*` contribute path — both user-configured to arbitrary origins by design — keep working. That trade-off (an XSS could exfiltrate the Google token to any origin) is documented explicitly in `_headers`.
- **`.nvmrc` had drifted to `20`** while `web/package.json`'s `engines` already required `>=24`, and CI hardcoded `node-version: 20` in two places rather than reading the pin. Both now read `24` / `node-version-file: .nvmrc`.
- **`mcp/server.json` still read `0.3.0`** while `mcp/package.json` was already at `0.4.0`. Version numbers now match.
- **`AGENTS.md` / `docs/DEPLOYMENT.md` misattributed this repo's production URL** as `takeoff.345flooring.com` — that's real, but it's a downstream fork's (`knmurphy/opentakeoff`) own deployment; its fork-specific docs rode along into this repo during the 2026-07-13 wholesale history merge and were never re-scoped. Both now correctly point at `opentakeoff.netlify.app`.

## 2026-07-19

### Added
- **Labor type & subfloor type on every condition.** Two free-text fields — Labor and Subfloor — live in the Supporting Materials panel, right above the material list; fill in whatever the bid needs (glue-down, float, nail-down… / ply, concrete slab, OSB…). Both round-trip through saved condition templates and surface as their own Report/CSV/XLSX columns once a project has a value typed in.

### Changed
- **"Assemblies" renamed to "Supporting Materials" throughout the app and docs** — the per-condition materials button/panel, `FEATURES.md`, `README.md`, and the user guide now consistently say Supporting Materials. No data-shape change: `condition.materials` was already the underlying field. The unbuilt Phase 3b roadmap item (a reusable named bundle of material lines) is renamed **Material Kits** to avoid colliding with this panel's name — see `docs/ESTIMATING_ROADMAP.md`.

## 2026-07-18

### Added
- **In-canvas takeoff agent — proposals with evidence, reviewed at an accept gate.** A docked Agent panel (right rail) takes a goal ("take off the carpet per the finish schedule on this sheet") and runs a client-side tool-use loop on the **bring-your-own-AI seam** (`lib/agentLoop.js` over `ai.js`'s new `chatWithTools`; Anthropic-style and OpenAI-style function calling, the user's own endpoint and key, zero hosting, zero telemetry; unconfigured builds show the honest empty state). The model never invents geometry — it aims a registry of the app's own deterministic tools (`lib/agentTools.js`): `list_sheets`, `read_sheet_text`, `read_schedule` (the schedule parser), `view_region` (rendered crop for scans/ambiguity), `one_click` (the flood engine, probe-only), `get_conditions` / `create_condition`, and `propose_shapes`. Results land as **dashed pencil proposals** citing whitelisted evidence (the matched schedule/room token and/or seed); the estimator accepts (per-proposal click, panel buttons, or ⏎ accept-all-visible — committing through the command layer with an `agent_v1` origin: `actor: "agent"`, `reviewed: true`, the frozen proposed ring), corrects (post-accept edits grade via `stampEdit` exactly like one-click), or rejects (**local only** — dismissed geometry never rides the contribution wire). The scale gate holds: tools refuse uncalibrated sheets with the MCP gate's refusal; the agent proposes, never assumes scale. `scripts/mock-agent-server.mjs` scripts a deterministic run against the real engines for keyless end-to-end testing.
- **`origin.evidence` joins the contribution vocabulary** (spec §5): `agent_v1` shapes may carry a **deep-whitelisted** `{schedule_row_tag?, matched_text?, seed_norm?}` — matched tokens only, 80-char cap, never sheet transcriptions; accept-gate timestamps stay local (the no-edit-timing rule). `pickOrigin` whitelists the sub-object key-by-key; `"agent_v1"` joins `origin.method` in the spec and the MCP `ShapeOrigin` type.
- **`opentakeoff.contribution.v2` — contributions carry provenance** (contribution.v2 PR-2, on the PR-1 provenance primitives). The Contribute payload now sends each shape's `id` (opaque durable UUID), `created_at`, and a **whitelisted** `origin` object (`pickOrigin` — registered keys only, never a spread): method, actor, reviewed/edited/edited-before-create/copied flags, one-click seed + trace parameters, per-kind correction tallies, and — for corrected machine shapes — the frozen `proposed_verts_norm`, so the machine's trace and the expert's fix ride side by side. New envelope fields: `generator_version` (inlined from `package.json` at build), per-sheet `scale_source` (provenance only — scale *values* never leave, and v1's `units_per_px`-free discipline tightens into an explicit MUST NOT), and aggregate `counters` (e.g. shapes deleted by origin method). The never-sent list is unchanged and now normative: no PDF, file names, project/client names, markup or label text, absolute coordinates, scale values, or edit timing beyond `created_at`.
- **`docs/CONTRIBUTION_SPEC.md`** — the normative wire + row contract: privacy invariants (including explicit disclosure of the durable-id linkage), field tables for `contribution.v2` and the `capture.v2` row, the provenance vocabulary registry with an IoU correction-magnitude recipe, dedup semantics, and the versioning policy (additive within a version; servers accept N and N−1).
- **Capture server banks `opentakeoff.capture.v2` rows** and accepts both `contribution.v2` and `contribution.v1` (anything else still 400s). Rows gain `shape_id`, `created_at`, verbatim `origin`, `scale_source` (joined from the payload's sheets), `generator_version`, and `contribution_schema` — all key-omitted when the wire didn't carry them; the row fingerprint is unchanged, so existing corpora can't double-bank. `summary`/`/health` gain an `origin_methods` count map, and the selftest grows a v2 triad (manual / clean one-click / corrected one-click must stay distinguishable), a v1-still-ingests check, and an unknown-schema rejection check.

### Changed
- **Capture rows default `origin_method` to `"unknown"`, not `"human"`.** A shape that recorded no provenance is a shape whose provenance we don't know — defaulting it to human would corrupt any human-vs-machine split trained on the corpus. Treat `"unknown"` as unlabeled.

### Docs
- **`docs/USER_GUIDE.md` rewritten as the full user manual** — zero-to-exported-takeoff coverage of every shipped feature (scale, conditions, every tool, One-Click review, command-layer undo/redo, markups/stamps/RFIs, report, revisions, Contribute, the in-canvas agent, MCP), with a code-verified keyboard reference.

## 2026-07-18 — opentakeoff-mcp 0.4.0

### Changed
- **MCP: shapes the server commits now tell the truth about who made them.** Previously, agent work banked as human work: one-click commits stamped `origin.reviewed: true` even though no human ever reviewed them, and `measure_polygon` / `measure_line` commits carried no `origin` at all — so downstream consumers (the capture/contribution pipeline included) defaulted them to human demonstrations. Now every shape the MCP server commits carries `actor: "agent"`; one-click commits stamp `reviewed: false` (an agent's un-reviewed trace is machine-proposed, exactly like a pending binder shape), and measure commits carry `origin: { method: "manual", actor: "agent" }` — agent-supplied coordinates are a hand trace by a machine hand. `Shape.origin` in `mcp/src/session.ts` is widened to the full contribution.v2 vocabulary (`method`, `actor`, `reviewed`, correction fields). **Behavioral change for anyone trusting `reviewed` or the human-by-default origin convention**: MCP-produced shapes no longer masquerade as human-reviewed work in exports or contributed corpora.

## 2026-07-17 — opentakeoff-mcp 0.3.0

### Added
- **MCP: dist smoke harness in CI, on Ubuntu and Windows** (@pollychen-lab, closes #30 and #38). `npm run smoke:dist` drives the compiled `dist/server.js` over stdio — initialize, tools/list, all ten tools by name, and a clean-JSON-RPC-stdout-wire assertion — and the mcp CI job now builds and smokes on both platforms.
- **MCP: one-click Claude Desktop install — the `.mcpb` bundle.** `npm run mcpb` stages the published-package surface with its production dependencies and an MCPB manifest, validates, and packs `opentakeoff-mcp.mcpb` (~9 MB); the release workflow builds and attaches it to every `mcp-v*` GitHub release. Platform-neutral by design: native optionals are excluded, so all ten tools and the text/metadata resources work everywhere and the sheet-image resource degrades gracefully.
- **MCP: typed tool results — `outputSchema` on all ten tools.** Every tool now declares its result schema (`mcp/src/outputs.ts`, mirrored from the session layer), and every reply carries the payload as `structuredContent` alongside the back-compat JSON text item. The SDK validates each reply against its schema on every call, so a reply that drifts from its contract fails loudly in the server's own test suite instead of silently in a client. Conformance test added: all ten schemas present, structured/text parity, error replies stay plain `isError`.

## 2026-07-17 — opentakeoff-mcp 0.2.0

### Added
- **MCP resources — browse a plan set before measuring** (flagship issue #29, reference implementation). A loaded plan exposes `takeoff://sheets` (index, sensible when empty), `takeoff://sheet/{page}` (metadata), `takeoff://sheet/{page}/text` (joined text), and `takeoff://sheet/{page}/image` (rendered PNG, long edge capped at 1568 px, lazily rendered and cached). `load_plan` announces the new surface via `resources/list_changed`. Rendering rides pdf.js's own optional `@napi-rs/canvas` — zero new dependencies, graceful degradation where the native binary is absent. Conformance suite in `mcp/test/resources.test.ts`.
- `.github/FUNDING.yml` — GitHub Sponsors manifest (button renders once Sponsors is enabled on the account).

### Changed
- **MCP releases move to the `mcp-v*` tag namespace** (`mcp-v0.2.0`). Bare `v*` tags are app releases — v0.2.0 and v0.3.0 already exist — so the registry-publish workflow now fires on `mcp-v*`, and the auto-created GitHub release is titled `opentakeoff-mcp <version>` to stay distinguishable in the shared release list.

## 2026-07-17

### Fixed
- **MCP: `mcpName` casing corrected to `io.github.Kentucky-ai/opentakeoff`** (0.1.3). The official MCP registry grants org namespaces with the org's exact GitHub casing and validates the npm `mcpName` with a case-sensitive match, so the lowercase form shipped in 0.1.2 could never pass both checks.

### Added
- **MCP: `mcp/server.json`** — the registry manifest (npm package `opentakeoff-mcp`, stdio transport) used by `mcp-publisher publish`.

## 2026-07-16

### Fixed
- **MCP: `serverInfo` reports the real package version on the wire.** Published `opentakeoff-mcp` 0.1.1 still announced `0.1.0` in the `initialize` response (the fix landed on `main` after the 0.1.1 publish); shipped as **0.1.2**.

### Added
- **MCP: `mcpName` identifier** in `mcp/package.json` — the ownership-verification field the official MCP registry validates for npm-hosted servers.

## 2026-07-15

### Added
- **`mcp/Dockerfile`** — a multi-stage container build for the MCP server (Node 20, non-root, repo root as the build context so the `../../web/src/lib` engine imports resolve). Self-host with `docker build -f mcp/Dockerfile -t opentakeoff-mcp .` then `docker run --rm -i opentakeoff-mcp`. Verified end to end: builds clean and `tools/list` returns all 10 tools over stdio.
- **`glama.json`** — Glama registry manifest naming the maintainer, so the server is claimable and listed at https://glama.ai/mcp/servers/Kentucky-ai/opentakeoff (claimed, quality-scored, installable, release `0.1.0`).

## 2026-07-13

### Changed
- **Snapshots modal retired — Revisions is the single surface over saved takeoffs.** The toolbar Snapshots modal and the Revisions rail panel (clock icon) listed the exact same records — both ride the store's `saveSnapshot`/`listSnapshots`/`getSnapshot`/`deleteSnapshot` primitives, so the Drive snapshot-sync layer is untouched. Revisions is a strict superset (compare any two, per-sheet and buy-list deltas, compare CSV, auto-banked restore), so the modal's toolbar button and component are removed; save / compare / restore / delete all live in the Revisions panel.

### Fixed
- **MCP package builds on Windows.** The build now uses a small Node script to copy the executable wrapper instead of Unix-only `cp` and `chmod` commands.
- **Capture server: a wedged synced share can't stall contributions.** A stalled sync client can leave a mirror-folder syscall hanging at the kernel — which no `try/except` catches. The `--mirror` copy now runs on an expendable thread with a wall-clock cap (`OPENTAKEOFF_MIRROR_TIMEOUT_S`, default 15s) and a 3-slot strand budget: a hung share strands at most 3 threads, then further mirror attempts skip outright until it recovers; the corpus write and the `/contribute` response are never held hostage. Selftest gains wedged-share checks.

## 2026-07-12 — v0.3.0

### Added
- **Excel (.xlsx) export** — the Report gains a real workbook next to CSV/JSON: **Summary** (per-condition breakdown + grand total), **By sheet** (base measured quantities per sheet × condition, for reconciling against the drawing set — multiplier and waste stay condition-level concerns), **Materials** (per-condition needs + the combined buy list), and **Shapes** (the per-shape audit trail; deducts carry their sign). A hand-rolled SpreadsheetML writer zipped with fflate (already a dependency, lazy-loaded at click time) — no SheetJS, no exceljs. Strings always go out as inline strings so a formula-shaped condition name stays inert text; numbers keep full precision in the cell with display rounding done by number-format styles, so the workbook shows what the report shows while staying exact for downstream arithmetic. Bold frozen headers, content-derived column widths, autofilter over the data rows only. Validated end-to-end with an independent parser (openpyxl).
- **Revisions** — bid revisions and addenda as data. Save the takeoff (conditions, shapes, markups) as a named revision (IndexedDB schema v2, new `revisions` store), then **compare any two — or a revision against the live takeoff — as quantity deltas** per condition, per sheet, and on the supporting-materials buy list, with a compare CSV export. The diff is deliberately quantity-level, not geometric: conditions pair by id with a finish-tag fallback (ordinal-keyed so duplicate tags can't collide), "changed" is judged at display precision so sub-display re-trace wobble reads unchanged, and a waste-only edit moves exactly one column — the ordered quantity. **Restore is never a one-way door**: it auto-banks the live takeoff as a revision first. New Revisions rail toggle (clock icon).

### Security
- **CSP + security headers on the deploy** (`netlify.toml`): `script-src 'self'` + wasm, no `unsafe-eval` (pdf.js verified working under it); `connect-src` stays open on purpose for the BYO-AI and capture seams. Verified enforcing with zero app violations.
- **Zip-ingest bounds** — the plan-set unzip path gains caps (entry count, shared decompressed budget, per-entry pre-decompression size, nesting depth) so a hostile archive can't balloon the browser.

### Fixed
- **Zoom/fit/dark buttons no longer fire the armed tool** — a left press on the canvas-corner button stack stopped propagating, so clicking ⌖/☾ mid-measure doesn't drop a stray vertex (the documented One-Click-through-zoom-button bug).
- **Autosave guards** — the hydration echo no longer re-saves what was just loaded, and a failed load leaves autosave **disarmed** with a banner instead of clobbering the saved takeoff with an empty state.

### CI
- Least-privilege workflow token (`permissions: contents: read`), `.nvmrc` (Node 20), and a single `npm run check` entry point.

## 2026-07-11

### Fixed
- **A wall height override now survives copy/paste — and an explicit 0 never falls back to the condition height.** Copy and duplicate dropped the `height_override` flag, and paste spread `height_ft` on truthiness, so a wall deliberately overridden to `0 ft` pasted with no height at all and silently recomputed at the condition height. Overrides now ride with their value through copy/duplicate/paste, and `recomputeShape`/`describeShape` honor an explicit override outright — even zero — while legacy shapes keep the condition fallback. (`verticalWallSf` is untouched on purpose: it estimates wall SF from floor perimeters at the condition height, display-only.)

## 2026-07-09

### Added
- **Live-measure cursor readout** (parity with the commercial sibling). While drawing a **Rectangle**, the cursor chip reads live `12′ 6″ × 10′ 0″ · 125 SF · 13.9 SY` (m² in metric); **Linear/Area/Surface** traces read the running segment length always, not just under the 45° lock. The chip turns **amber when a run reaches 12′** — broadloom roll width, a seam falls here.
- **MCP server.** [`mcp/`](mcp/README.md) puts the takeoff engine on stdio for your MCP client: ten tools — `load_plan`, `sheet_info`, `set_scale`, `one_click`, `measure_polygon`, `measure_line`, `takeoff_summary`, `export_takeoff`, `delete_shape`, `read_sheet_text` — over the same `web/src/lib` engine the canvas runs, so an agent's committed shapes are field-identical to the browser's and `export_takeoff` emits the app's own `opentakeoff.takeoff_canvas.v1` save payload. The app's rules carry over: detected scales are suggestions an agent must adopt explicitly, measures refuse without a per-sheet scale, a bare `one_click` returns px-only numbers with a warning, and every one-click shape carries its provenance receipt. Vector+text sheets only for now (scans report themselves plainly; the raster seam is marked). Full guide with an agent transcript in [`docs/MCP.md`](docs/MCP.md); CI grows an `mcp` job (typecheck + session/tool/e2e tests against the demo plan).
- **Bring-your-own-AI (opt-in, dormant by default).** A new `AI` toolbar button opens settings for an endpoint **you** provide — OpenAI-style (the default; local runtimes speak it and need no key) or Anthropic-style — with the model id and an optional key stored in this browser only. First consumer: **read scale with AI** — when the text regex finds no scale note (scans, rotated notes, image title blocks) and AI is configured, a chip offers to send ONE snapshot of the title-block region to your endpoint; the reply maps through the same boundary-guarded scale matcher as the text path (`scaleFromLabel` in `sheets.ts`) and lands in the existing suggestion flow — `AI read 1/4″ = 1′-0″ — use` — never auto-applied, and the acceptance guide bar still shows. Unconfigured builds add zero UI beyond the button and make zero AI network calls. No telemetry. Dark-mode snapshots are un-inverted before encoding. The seam (`visionQuery` in `web/src/lib/ai.js`) is generic so future consumers (finish classification, room labels) reuse it.
- **One-Click Area on scanned plans.** Scans have no vector linework, so the flood had nothing to bound it — clicks just failed. A new raster fallback (`web/src/lib/rastermask.ts`, pure typed arrays, zero new dependencies) reads the rendered pixels instead: grayscale with a polarity check (negative/blueprint scans invert), a Bradley-style adaptive mean threshold over an integral image (shaded rooms and uneven illumination read correctly) with an absolute dark floor (solid walls stay solid), and one binary closing to bridge faded-ink dropouts. The mask feeds the SAME flood/trace/simplify machinery as the vector path. Triggering is automatic and conservative: the op-list walk now measures placed-image coverage, and pixels engage only when a sheet is mostly image — scan wrappers run raster-primary; a mixed sheet (photo underlay beneath real linework) retries on pixels only after the vector flood fails; a pure-vector sheet never touches pixels. Raster results skip corner snapping (a scan has no true endpoints), carry `raster_traced: true` provenance, and the proposal readout badges them: *traced from scan pixels — verify edges before Create*. Verified end-to-end: a rasterized copy of the demo plan traces the same room within 1.5% of the vector path.
- **Check a dimension (K).** A read-only twin of Calibrate: click both ends of a printed dimension string and the bar reads `measures 12′ 4″ at 1/4″ = 1′-0″`. Type what the drawing says and a verdict chip grades the error — green ≤1% (scale checks out), amber ≤5% (re-check), red past that (wrong scale) — with a one-tap **Recalibrate to this** that reuses the calibration math. The live cursor chip shows the running length in feet-and-inches while you pick the second end.
- **Scale-acceptance guide.** Accepting a scale — the standard dropdown, the "plan says … — use" chip (hover previews it), calibration, or the check tool's recalibrate — drops an ephemeral calibrated ruler bar on the sheet (a round length sized to the zoom, with foot/meter ticks and the caption *a door opening is about 3′*). A 2×-off scale is visually obvious before anything gets traced. Auto-dismisses in 8 s or on the next action; never saved.
- New pure display helpers in `web/src/lib/units.ts`: `ftIn` (feet → `12′ 6″`), `fmtCheckLen`, and `parseLenInput` (accepts `12.5`, `12'6`, `12' 6"`, `12-6`, meters in metric) — node-tested.

### Changed
- **Public imagery re-captured from the live app.** The old hero card and One-Click GIF pre-dated the July 5 fill fixes and showed rooms with unfilled door-swing bites — the engine has been better than its own marketing since. The new captures show what a click actually does today: the same three patient rooms on the bundled VA plan trace **wall to wall** (163 → 154.6 SF, 162 → 184.6 SF, 161 → 240.7 SF; same 579.9 SF CPT-1 total), plus a VCT clean-linen room for contrast. New `docs/img/one-click-area.gif`, `docs/img/social-card.png`, `web/public/og-card.png`; alt text updated to match.
## 2026-07-08 (night)

### Added
- **The capture layer.** [`capture/capture_server.py`](capture/README.md) — a stdlib-only local server (no pip install) that banks the app's opt-in Contribute payloads as (geometry → label) training rows in a corpus **you** own: one JSONL row per labeled shape, content-hash dedup so re-contributions never duplicate, a verbatim payload archive, and an optional `--mirror` that copies the label file whole and atomically into a synced share (OneDrive / SharePoint / Dropbox) after every capture. `serve` / `summary` / `selftest` subcommands; wire-up is one `localStorage` line. The README gains an **Own your data** section, and the Contribute modal now points here when no endpoint is configured. When the endpoint is one **you** set in the browser (the self-capture flow), the modal drops the shared-model framing and reads as what it is — **Capture this takeoff**: your endpoint, shown inline, your corpus, nothing shared.
- **PR ground rules.** CONTRIBUTING.md documents how pull requests work here — one concern per PR, issue-first for big changes, conventional commit subjects, the vendor-neutral rule, and review etiquette. A CODEOWNERS file auto-requests maintainer review, CI grows a capture-selftest job, and `main` is protected by a ruleset (PRs only, green CI, no force-pushes).

## 2026-07-08 (later)

### Added
- **Zone check.** A new toolbar tool: trace a region — an apartment, a wing — like you'd trace a deduct, close it (⏎ / double-click / Finish), and a panel lists every condition inside with quantities **and its materials scaled to the zone**, computed by the same rules as the Report. Shapes count by their center point and glow cobalt so inclusion is visible. Nothing is saved: redraw replaces the zone, Esc or leaving the tool clears it.
- **Sheet levels.** Select sheets in the gallery → **Assign level…** ("L1", "Garage"). The gallery groups by level (unassigned last, title-block order within), cards wear a level chip, and tabs + the page picker carry the label. Stored with the project.
- **Condition plays.** **⭑ Save play** stores a tuned condition — appearance, waste, full materials list — in this browser; **Plays ▾** applies it as a fresh condition on any project. No geometry or ids travel; re-saving a name replaces it.

### Fixed
- The live readout is height-capped with internal scroll so fully populated totals never cover the right-edge panel rail.

## 2026-07-07

### Added
- **Per-material coverage presets.** The adhesive-only trowel picker grew into per-material-type presets (new pure lib `web/src/lib/coverage.js`): adhesives get real trowel-notch and roller options (PSA through coarse wood notches, SF/gal), and mortar/thinset lines get their own trowel presets (SF per 50-lb bag). All values are generic industry-typical spread rates — always verify against the product data sheet.
- **Grout calculator.** A grout line now derives its coverage from tile geometry instead of an opaque number: enter tile length × width × thickness, joint width (1/32″–1/2″), and bag size inline on the material row, and the SF/bag rate plus a show-your-work note (e.g. `12×24×3/8″ @ 1/8″ · 25 lb`) fill in automatically. The CT-1 starter condition ships with the derived rate.

### Changed
- The old `fine` / `medium` / `standard` / `coarse` trowel preset labels retire in favor of explicit notch sizes. Materials that saved one of those labels keep their note and coverage rate — the picker just no longer pre-selects it.
## 2026-07-08

### Added
- **Metric units for EU plans.** A `ft`/`m` toggle beside the scale picker switches the whole display layer: readouts, shape chips, the takeoffs panel, the Report, CSV, and the Marked Set legend read in m² / m (the SY column retires in metric). Calibrate by typing **meters**, and the scale list gains the ratio presets — 1:20, 1:25, 1:50, 1:75, 1:100, 1:125, 1:200, 1:250, 1:500 — which auto-detect from title blocks too. All stored data stays in feet internally, so toggling units never rewrites a takeoff. Supporting-material coverage rates stay as entered (SF/LF-based) for now.
- **Fleur-de-lis hatch.** A new pattern takes the Sand/dots slot in the picker (16 stays 16); anything already painted with dots keeps rendering.
- **Highlighter strokes are pickable.** With Select, click a stroke (cobalt glow), drag to move it, Backspace/Delete to remove it.

## 2026-07-07

### Added
- **Highlighter.** A freehand marker under Markup (`H`): press and drag to paint — real ink feel, stroke after stroke, no dialog between strokes. A style popover under the Markup menu offers five inks (yellow default), **F/M/B** tip sizes, and a **chisel or round** nib (remembered per browser). Strokes capture with distance thinning, preview imperatively (no React render per move), stick to their sheet, scale with the plan like drawn ink, and **export into the Marked Set PDF** in their own color (chisel = ribbon fill, round = round-cap stroke). Because press-drag paints, press-drag panning is unavailable while the highlighter is armed — Space/middle/right-drag still pan. The pure stroke geometry (`thinStroke`, `strokePathD`, `chiselRibbon`) lives in `web/src/lib/geometry.js` with tests.

### Changed
- **Hatch patterns redesigned.** The 16 condition hatches retuned as a set: two stroke weights (dense/dual-family patterns draw lighter so nothing shouts), per-pattern tile sizes, even pitches, and ~8–16% ink coverage across the board — brick now staggers like running bond, plank reads as long boards, checker/dots/speckle calmed. Dark view gets brighter stroke alphas baked into the pattern. The Marked Set PDF's hatch approximations follow the new pitches. A hidden `?hatchqa` QA wall renders every pattern at three scales in two colors for future retunes.
- **Hatch picker reorganized.** A 4×4 grid of larger swatches with a caption line that names the pattern under the cursor (or the current selection) — no more squinting at a 26px tile.
- **"Cut Out" is now "Eraser".** The toolbar menu and its tools read Erase shape / Erase rectangle (`D` / `⇧D`). Labels only — the takeoff math is unchanged, and existing deduct shapes are untouched.

## 2026-07-05 (evening)

### Fixed
- **No more flashing when zoomed in.** Past ~115% zoom, every pan or zoom settle used to wipe the sharp detail overlay and let pdf.js paint its white page background straight onto the screen while it re-rendered — a white blink on every touch, blinding in dark view, and the sync loop could fire it several times per gesture. The detail region now renders into an offscreen buffer and swaps in atomically: the previous crisp crop stays up until its replacement is fully painted, and identical re-requests are dropped.
- **Dark view sticks at high zoom.** Toggling ☾ while a detail re-render was in flight skipped the visible layer (its inverted-state record was cleared at render start), so the screen stayed light and the toggle looked dead. The record now lives with the pixels — the toggle always flips what you see.
- **One-Click Area now traces rooms with solid (poché) walls under a tile grid.** Plans that draw walls as filled shapes — like the bundled VA sample's tiled toilet rooms — used to come back as "dense linework" guards: the wall's short outline edges sat exactly on the tile pitch, classified as hatch, and the escalated fill leaked through what is actually solid ink. Filled-not-stroked outlines are now never hatch-transparent, and a row spanning far beyond the pattern's median row stays a hard boundary. The failing click (tiled toilet, one click) now returns the room — verified end-to-end on the sample plan and locked in with a regression test.

## 2026-07-05

### Fixed
- **One-Click Area works on hatched rooms.** Hatch/poché linework used to be burned into the flood-fill's boundary mask exactly like walls, so a click inside a hatched room got trapped between hatch lines — and a wall-to-wall tile grid silently returned one tile as if it were the room. The extractor now emits per-segment metadata (paint op, curve chords, device line width), a classifier marks families of regularly-pitched overlapping parallel rows as hatch, and the fill escalates: strict pass first (identical to the old behavior), hatch-transparent retry only when the strict pass comes back trapped or predominantly hatch-bounded. A failed escalation returns the strict result — a misclassified wall can never make the tool worse. Also fixed: geometry inside form XObjects now lands where it draws (their matrix was ignored).

### Added
- **Dark view (negative print).** ☾ in the zoom cluster — sheet pixels inverted in place (one difference-with-white pass; no CSS filter layers, so dark composites exactly like light), hatches and fills get dark-tuned alphas, and the setting persists per browser.
- **Marked Set PDF export.** One click in the Takeoff report downloads a distribution-ready PDF, built entirely in the browser: every sheet carrying takeoffs or markups with the work burned in as drawn — condition colors, clipped hatch linework, per-shape quantity chips, count markers, cobalt markups — plus a legend cover with per-condition net totals, waste-adjusted order quantities, and a by-sheet breakdown. Exports in your current view: dark canvas → dark PDF (inverted raster base, true-color overlays).

### Changed
- Quantity math now has one home: the HUD and Takeoffs panel read the same `conditionTotals()` rules the Report uses (still scoped to the visible sheets), and the vertical-wall metric moved to `totals.js` with tests.
- Pure canvas geometry (angle lock, hit-testing, snap grid, star/cloud paths, metrics) extracted to `web/src/lib/geometry.js` with its own test file; 12 unused icons pruned; `MAX_GROUP` now lives once in `lib/sheets.ts`.

## 2026-07-02

### Fixed
- **Conditions are always visible at every zoom.** The canvas zooms via a CSS transform on the stage div, which never enters the SVG's coordinate system — so `vector-effect="non-scaling-stroke"` (used on every shape) was a silent no-op: outlines went sub-pixel-invisible at overview zoom and fat at deep zoom. Every screen-relative stroke/dash/handle size now divides by the stage scale, and below 35% zoom a shape's hatch fill (which aliases into invisible sub-pixel mush) swaps for a clear solid tint of its condition color — the marked-up set reads like a map from fit-to-sheet.
- **The overlay tracks your gestures live.** Labels, outlines, and the low-zoom tint now update ~11×/s *during* a pan or pinch instead of snapping into place 80 ms after you stop; drag-pan coalesces to one transform write per frame; the detail view waits out active gestures so its crop is never wiped mid-pinch.

### Changed
- **Hi-Res is now an auto quality budget — and works in side-by-side groups.** The fixed 1.75× raster multiplier is gone; a hi-res sheet re-rasters to a ~28-megapixel budget (~112 MB), which bounds memory well enough that the old single-sheet-only restriction is lifted. Crispness past 1:1 still comes from the vector detail view, which now engages devicePixelRatio-aware (no upscaled-soft band on Retina displays) — and the deep-zoom ceiling more than doubles (`MAX_SCALE` 14 → 32). Quantities are unaffected: geometry is stored normalized and the raster scale cancels in the math.
- **Panel toggles moved to a right-edge rail.** The markup and takeoffs buttons left the toolbar for a slim vertical rail on the canvas edge (zoom-cluster style), so the toolbar never wraps onto an extra row on narrow windows; the takeoffs panel docks beside the rail and its lit toggle closes it.

## 2026-07-01

### Added
- **45°/90° angle lock (polar tracking).** While tracing Area / Linear / Surface / Deduct (and the calibration line), the segment locks to the 45° family (0°, 45°, 90°, 135° across the sheet) whenever the cursor comes within ~4° of an axis — and **the click commits the exactly-on-axis point**, so walls come out dead square. Hold **⇧** to force the lock at any cursor angle. New **45°** toolbar toggle (on by default) next to Snap; endpoint Snap takes priority over the angle lock.
- **The crosshair is the cursor.** The OS pointer hides in draw modes; full-page **luminous cobalt aim hairlines** (1.5px core, fine white edge, soft bloom) meet at the house **star mark**, and in-progress work draws in the instrument's own cobalt (committed shapes keep their condition color). Lock feedback is quiet: the star swells and glows, the hairlines deepen, the **solid** (dash-free) preview line thickens, and a chip by the cursor reads the locked angle plus the live segment length — or `snap` when an endpoint snap wins. Design intentionally avoids viewer-style chrome: three heavier drafts (frosted reticle, magnifying loupe, glass pickets) were cut the same night in favor of this instrument feel.

### Docs
- New `CHANGELOG.md`, `AGENTS.md` (map of the repo for coding agents), `FEATURES.md` (capability → code), `web/public/llms.txt`, and GitHub issue/PR templates.
- User guide: new "Angle lock (45°/90°)" section + ⇧ shortcut row.

## 2026-06-28
- **Crisp detail-view canvas** — past ~1.15× zoom the visible region re-renders straight from the PDF vectors at the current zoom (Bluebeam/AutoCAD-style), so deep zoom never pixelates.

## 2026-06-23
- **Bundled sample plan** — a real (public, architect-sealed) medical-center floor finish plan with one-click **Load sample plan**; social card + README hero.

## 2026-06-19 → 06-22
- **WD-1 hardwood condition + assemblies** — trowel-aware adhesive, sealer/poly finish assemblies with real coverage rates (vendor-neutral).
- **Takeoffs panel** — edit assemblies and delete conditions inline.
- README rewrite, user guide + screenshots, one-click Netlify deploy button, SEO/OG pass.

## 2026-06-18
- **Relicensed MIT → Apache-2.0** (PRs #1–#2).
- **Supporting materials (assemblies) per condition** — coverage rate + basis → rounded order quantities; full condition edit/delete.
- **Ingest** — PDFs, images, and `.zip` plan sets through one in-browser path.

## 2026-06-15
- **Initial release** — open-source PDF takeoff canvas for flooring: One-Click Area, manual measure kit, per-sheet scale (auto-detect + calibrate), conditions with CAD hatches, waste %, reports with SF/SY/LF/EA and CSV/JSON export, client-only storage.

### Cloud project library (unreleased)

- Hide idle Local Only when Drive is connected; preserve active sync/error statuses.
- Simplify This project, add complete-folder ZIP export, scoped folder browsing/search, persistent authors and synced-folder opening without a Drive API binary download.
- New Drive projects use Estimate save data/Projects; retain existing stable project folder identities and legacy Supabase workflows. Updated Drive Edge Function required; no deployment included.

- Selecting a local Drive folder now displays its actual contents immediately, with subfolder navigation, search and direct `.otk` opening.

- Cloud Projects now starts with authentication or source-folder selection instead of automatically listing cloud projects; accessible saved folders reopen directly.

- Add an Open project button beside every `.otk` in the selected-folder browser.

- Put local `.otk` files first; sort project folders by newest contained-file change. Show modification dates and saved editor names, with explicit Unknown fallbacks. Preserve editor metadata on saves separately from author metadata.

- Add Create New Source Folder alongside Locate, with fixed Estimate save data/Projects initialization, existing-folder reuse, cancellation/error handling, and automatic persistent selection.

- Add a clickable account avatar/name beside the logo and enrich Profile with the avatar, email, editable name and logout. Saved names immediately update the header.

### Custom interface accent
- Added an automatically saved color picker and Reset accent control to the Theme panel, with contrasting button text.

The hatch pattern picker opens above the canvas and stays within the window, including when used in the toolbar or docked conditions panel.

After sign-in, a welcome screen replaces the automatic Drive folder prompt. Free accounts see a view-only message and Get Premium opens subscription options; active subscribers see a welcome-back message.

User Guide is now in the top bar, immediately left of the profile, and stays available across toolbar tabs.

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

- Set up Supabase subscription and license-session tables and deployed the authenticated billing endpoint. Subscription and session checks can read existing entitlements before RevenueCat checkout is configured; accounts without a record are treated as unsubscribed.
- Added Project calendar with month navigation, project due dates, Google Calendar authorization, calendar selection, event display, and duplicate-safe manual deadline syncing.

- Added a visible Sign in button to the empty workspace landing card, opening the existing account login form.

- Initial Google sign-in now requests Calendar permissions and securely saves the approved connection, removing the separate Calendar sign-in step.

- Fixed Google calendars disappearing after login or reopening Calendar: automatically reload connected calendars and restore per-account visibility selections.

- Google Calendar events now use Google calendar colors and individual event color overrides, including text colors.


Google Calendar editing: approve editing access in Calendar Settings. Use + Google event to create events; open an event and choose Edit to change dates, location, description, Google color, recurrence, attendees, reminders, visibility, availability, or RSVP. The editor supports duplicate, move, and confirmed deletion; recurring occurrences and the full series are separate edit choices. Drag and resize writable Google events to reschedule. Manage Google calendars in Settings provides creation, renaming, colors, quick-add, availability, preferences, sharing, and confirmed secondary-calendar deletion. Google account permissions are enforced on the server and stale event changes are rejected with version checks. Invitation/update emails are opt-in. Existing read-only authorizations continue to display events until editing permission is approved. Administrative ownership transfer, primary-calendar clearing, and webhook channel management are not exposed in the app.

- Google event descriptions display readable text with paragraph breaks and links in the editor. Unchanged descriptions retain original formatting when saving other fields.
