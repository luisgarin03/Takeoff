# Toolbar and subscription integration

The toolbar is `BeitzellToolbar`, composed with the original JSX and handlers
from `TakeoffCanvas`. Panels stay mounted when hidden. Tabs only change toolbar
visibility; they do not navigate, reload or select a drawing tool. Clicking the
selected tab deselects it and collapses all panels; the header stays visible. Arrow keys,
Home and End select tabs. Dropdowns portal outside scrollable panels and close
on tab changes, scrolling or resizing. Existing canvas rail tools stay in place.

## Control inventory and destination checklist

- [x] BrandText logo → header, outside tabs (logo settings unchanged).
- [x] Supabase profile/sign-in → header, outside tabs; same Profile dialog.
- [x] Legacy Google AccountChip (email, sync note, sign out) → header, outside tabs.
- [x] Project menu → Project: New, Edit details/status/due date, Save, Save as,
  Open, Open Recent, Cloud projects, Download this page, conditional Return to
  default workspace; all existing disabled/busy states preserved.
- [x] Whiteboard (when previously visible) → Project.
- [x] Close cloud project, team Projects, browse team projects link → Project,
  with existing visibility conditions.
- [x] Saving/saved indicator and hidden sheet-file input → Project.
- [x] User Guide dialog → Project.
- [x] Sheets gallery button → Sheets.
- [x] Previous/next sheet → Sheets.
- [x] Sheet menu → Sheets: page/level selection, bookmarks, files, ungroup,
  regroup, gallery.
- [x] Open-sheet chips → Sheets: select, bookmark, side-by-side, close.
- [x] Open/bookmarked-sheet jump menu → Sheets, retaining all generated entries.
- [x] Report (including existing export/report dialog) → Takeoff.
- [x] Zone, Snap, 45° guides → Takeoff.
- [x] Render settings → Takeoff: per-sheet Hi-Res, fill sensitivity slider and
  Strict/Balanced/Aggressive detents.
- [x] Conditional phase/area label selector → Takeoff.
- [x] Typed Command input → Takeoff, including unfinished text across tab switches.
- [x] Units toggle and Scale menu → Takeoff: revert, detected scale and preview,
  standard scales, two-point calibration, dimension check, mismatch indicator.
- [x] Conditional Finish, Create, and markup placement guidance → Takeoff.
- [x] Condition palette → Takeoff: activation/reassignment, double-click editor,
  1–9 hints, drag-to-pin/reorder, unpin, full/empty states, add condition.
- [x] ConditionAppearanceEditor → Takeoff, unchanged component and callbacks
  (finish-tag rename, multiplier, waste %, line colors, fill colors/No fill,
  hatch picker, line style, height, thickness and configured condition attributes).
- [x] Previously hidden duplicates of Pan/Select, Measure, Cut Out, Markup/style,
  Edit menus remain hidden; their visible canvas-rail counterparts are unchanged.
- [x] Find dialog remains independent of selected toolbar tab.
- [x] Toolbar visibility toggle and optional compact conditions strip unchanged.

Existing dropdowns, native tooltips, project/save dialogs, report, gallery and
account authentication flow remain attached to their original handlers.

## Profile

`CloudProjects` still owns authentication, display-name draft/save, errors,
notices, focus handling and logout. `ProfileAccountSection` presents the real
Supabase identity, editable display name, read-only email, Subscription, and
Account cards. No invented company, preferences, user, or plan features.

## Billing: not connected

Supabase auth, profiles, project data and Drive functions exist. There is no
billing provider, billing table, checkout endpoint or billing webhook in this
repository. No migration was added. The default service returns no subscription
and the UI displays Free / No active subscription. Choosing a plan explains the
missing integration; it never changes an entitlement or stores payment details.

`src/lib/subscriptions.js` is the single display catalog: Starter USD 40/month,
Professional USD 50/month, Business USD 60/month. Names and prices are provisional.
The `createBillingService(adapter)` contract separates account lookup, checkout
and optional management. The production default is deliberately unconfigured.

To connect real billing:

1. Choose a provider and create recurring USD prices. Map catalog IDs to trusted
   provider price IDs on the server; never trust a client-supplied amount.
2. Add authenticated checkout and customer-portal endpoints. Verify the session
   server-side and bind each customer to that account; do not trust a supplied
   user ID alone. Keep provider secrets on the server. Collect cards only through
   provider-hosted checkout.
3. Store server-owned subscription records keyed by authenticated user ID. Suggested
   fields: subscriptionStatus, subscriptionPlan, subscriptionPrice,
   subscriptionInterval, subscriptionProvider, subscriptionCustomerId,
   subscriptionId, subscriptionCurrentPeriodEnd. Restrict client reads to the owner
   and deny client writes to entitlement fields. Do not use editable user metadata.
4. Verify provider webhook signatures and process events idempotently. Update
   records for activation, renewal, cancellation, failure and expiration. Checkout
   redirects alone must never activate a plan.
5. Implement the adapter's getSubscription(userId), checkout(userId, planId), and
   optional manageSubscription(userId). Checkout and management perform safe
   provider navigation; the read method returns the authoritative record or null
   (errors must reject, not masquerade as Free). Wire the configured service into
   SubscriptionSection and refresh status after returning from checkout.
6. Test real sandbox checkout, rejected payments, webhook retries, cross-account
   access, cancellation, portal return, offline/error handling and status refresh.

No production payment or database changes are included in this UI refactor.

## Changed files

| File | Purpose |
| --- | --- |
| `web/src/components/BeitzellToolbar.jsx` | Three collapsible tabs, keyboard navigation, mounted panels, header slots |
| `web/src/styles/toolbarTabs.css` | Scoped responsive toolbar styling |
| `web/src/pages/TakeoffCanvas.jsx` | Move existing JSX into toolbar slots without changing handlers |
| `web/src/components/ToolMenu.jsx` | Scroll-safe toolbar portals and dismissal |
| `web/src/components/ProfileAccountSection.jsx` | Profile and Account cards using existing callbacks |
| `web/src/components/SubscriptionSection.jsx` | Current status, plan cards, unavailable-checkout feedback |
| `web/src/lib/subscriptions.js` | Central catalog and typed billing adapter contract |
| `web/src/components/CloudProjects.jsx` | Compose Profile presentation into the existing account dialog |
| `web/src/styles/cloud.css` | Scoped Profile and pricing-card styles |
| `web/test/subscriptions.test.ts` | No fake activation; authenticated adapter delegation |
| `README.md` | Feature description |
| `docs/USER_GUIDE.md` | Toolbar toggle and Subscription instructions |
| `CHANGELOG.md` | Change summary |
| `docs/TOOLBAR_SUBSCRIPTIONS.md` | Control inventory, integration contract and validation notes |

## Validation (2026-10-05)

- Typecheck and lint pass. Production build passes with the existing chunk-size
  and mixed static/dynamic `fflate` import warnings.
- Full suite: 1,078 pass, 12 fail out of 1,090. The same 12 failures reproduce on
  unmodified commit `5d9313b`: 11 branding/golden-output expectations and one Drive
  archive restore assertion. Both new subscription tests pass.
- All 208 existing canvas JSX event-handler attributes match the original source.
- Toolbar and Profile layout checked in Chromium at 320, 360, 390, 430, 768, 1024,
  and 1440px in light and dark themes; no document-level horizontal overflow.
- Browser checks cover toolbar keyboard selection, collapse/reopen, header
  persistence, menu positioning/dismissal, and command-draft retention.
- Estimating smoke test: set scale, toggle units/snap/angle, trace and commit an
  area (44.9 SF), open Report, download and reopen a project. The archive was
  parsed independently and retains its shape, PDF, scale and name. No JavaScript
  or console errors were recorded during this run.
- Profile presentation was exercised in an isolated browser fixture: field edits,
  save/logout callbacks, Subscription expansion, all three paid-plan actions and
  unchanged Free status. Live authenticated profile writes were not attempted.
- No production checkout, migrations, deployment or live account changes performed.
