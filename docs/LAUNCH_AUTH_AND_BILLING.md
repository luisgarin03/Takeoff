# Launch authentication, subscriptions, and installers

OpenTakeoff now has a production-oriented account and entitlement boundary:

- Supabase Auth owns account identity. The Supabase user UUID is also the RevenueCat App User ID.
- RevenueCat owns App Store and web/desktop purchases under one entitlement.
- `public.otk_subscriptions` is the server-owned license record. Authenticated clients may read only their own row and cannot insert, update, or delete billing data.
- The `otk-billing` Edge Function verifies RevenueCat webhooks, refreshes the authoritative subscriber, and updates the license row with the service role.
- `VITE_REQUIRE_ACTIVE_LICENSE=1` enables the launch gate. It is deliberately `0` in the example until the live services and products pass acceptance testing.

No card data, RevenueCat secret, webhook secret, Supabase service-role key, Apple signing key, or Windows signing key belongs in a `VITE_*` variable or in Git.

## 1. Supabase production setup

1. Create the production Supabase project and enable email/password authentication. Configure the public Site URL and allowed redirect URLs for the deployed HTTPS site.
2. Apply every file in `supabase/migrations/`, including `202610210001_billing_entitlements.sql` and `202610210002_license_sessions.sql`.
3. Set the server secrets shown in `supabase/functions/.env.example`. Use exact production origins in `OTK_BILLING_ALLOWED_ORIGINS`; do not use `*`. Keep `capacitor://localhost` for iOS and `opentakeoff://app` for the signed Windows wrapper.
4. Deploy `otk-billing`. Its gateway JWT check is intentionally disabled because RevenueCat webhooks have no Supabase JWT. The handler verifies webhook HMAC/authorization itself and manually validates user refresh JWTs with `auth.getUser()`.
5. Configure the RevenueCat webhook URL as `https://YOUR_PROJECT.supabase.co/functions/v1/otk-billing?action=webhook`.
6. Enable HMAC signing in RevenueCat and store the same random signing secret as `REVENUECAT_WEBHOOK_SIGNING_SECRET`. Send sandbox and production events to separate Supabase projects, or keep the recorded `environment` visible during staged testing.

## 2. RevenueCat and store catalog

Create one RevenueCat project, one entitlement (the example uses `opentakeoff_pro`), and separate iOS and web apps. Create Starter, Professional, and Business monthly products, attach all three to the entitlement, and add them to the current offering.

Keep these identifiers synchronized:

- `REVENUECAT_PLAN_MAP` on the Edge Function maps store product identifiers to `starter`, `professional`, or `business`.
- `VITE_REVENUECAT_PACKAGE_STARTER`, `VITE_REVENUECAT_PACKAGE_PROFESSIONAL`, and `VITE_REVENUECAT_PACKAGE_BUSINESS` identify packages in the current offering.
- `VITE_REVENUECAT_ENTITLEMENT_ID` must match the server secret `REVENUECAT_ENTITLEMENT_ID`.
- `VITE_REVENUECAT_IOS_API_KEY` is RevenueCat's public iOS SDK key. `REVENUECAT_SECRET_API_KEY` is server-only.

For Windows/web, create a production RevenueCat Web Purchase Link and set `VITE_REVENUECAT_WEB_PURCHASE_URL` to its base URL. The client adds the signed-in Supabase UUID as the required final path component and uses `package_id` to select the chosen plan. Never ship the sandbox purchase URL.

Apple treats feature-unlocking subscriptions as digital purchases. Keep the iOS products available through Apple In-App Purchase; do not replace the iOS purchase action with a desktop-only external checkout. The app includes Restore Purchases on native builds.

## 3. Enable the production license gate

Populate `web/.env.local` or the equivalent deployment/build secrets from `web/.env.example`. Test sign-up, email confirmation, sign-in, purchase, renewal, cancellation, expiration, billing issue, restore, reinstall, a second device, and a different account.

Only after those tests pass, build with `VITE_REQUIRE_ACTIVE_LICENSE=1`. Production builds must keep `VITE_ALLOW_SANDBOX_LICENSES=0`; use `1` only for dedicated StoreKit/RevenueCat test builds.

With the flag off, the current local-first app behavior remains unchanged. With it on,
users must sign in and the app claims a short server-owned editing lease. Full editing
requires all three conditions: a reachable license server, an active subscription, and
no other computer holding that account's lease. Offline, unsubscribed, expired, and
second-computer sessions open the workspace in read-only mode; viewing and export stay
available. The client renews its two-minute lease every 45 seconds, so a crashed or
sleeping machine releases the editing seat without an administrator. Canceled
subscriptions retain editing only through their recorded paid-through date. Local
project files are never deleted by the gate.

Deploy both billing migrations, including `202610210002_license_sessions.sql`. Keep
`OTK_ALLOW_SANDBOX_LICENSES=false` in production. The editing lease is claimed only by
the authenticated `otk-billing` Edge Function; browser clients cannot write session rows.

## 4. iOS release

The generated Capacitor project is in `web/ios/`. From a Mac with the current Xcode supported by Capacitor:

```bash
cd web
npm ci
npm run ios:sync
npm run ios:open
```

In Xcode:

1. Select the `App` target and assign the Apple Developer team.
2. Confirm the final bundle ID (currently `com.opentakeoff.app`) matches App Store Connect and RevenueCat before the first release; changing it later creates a different app.
3. Enable the In-App Purchase capability and use automatic signing or the organization's distribution profile.
4. Create the auto-renewable subscriptions in App Store Connect, add the In-App Purchase key to RevenueCat, and test with a StoreKit configuration plus an App Store sandbox account.
5. Set version/build numbers, archive a generic iOS device build, validate, and upload through Xcode Organizer.

After App Store Connect assigns the public listing, set `VITE_IOS_APP_STORE_URL`
to its `https://apps.apple.com/...` URL. Profile then includes an **Open App Store**
button. You remain in control of each iOS release through App Store Connect; Apple
reviews the update and users install it through the normal App Store update channel.

An `.ipa` cannot be signed on Windows. A Mac/Xcode runner and Apple Developer/App Store Connect credentials are required for the final archive and submission.

## 5. Windows release and installer

The NSIS x64 installer is built from `web/`:

```powershell
npm ci
$env:CSC_LINK = "C:\secure\codesigning.pfx"
$env:CSC_KEY_PASSWORD = "use-a-secret-store"
$env:WINDOWS_PUBLISHER_NAME = "Exact certificate publisher"
npm run dist:win
```

The installer appears in `release/` as `Beitzell Estimating-Setup-x64.exe`. Omit the certificate variables only for internal smoke builds; Windows will show an unknown-publisher warning. Verify Authenticode after building and timestamp the signature through the certificate provider. Installer upgrades preserve `%LOCALAPPDATA%\OpenTakeoff`, including local projects.

Production installers also contain an owner-controlled update channel fixed to the
public `luisgarin03/Takeoff` GitHub Releases feed. Configure the `release` GitHub
environment secrets `WINDOWS_CSC_LINK`, `WINDOWS_CSC_KEY_PASSWORD`, and
`WINDOWS_PUBLISHER_NAME`. Bump `web/package.json`, merge the verified change, then push
the matching version tag (for example, `v0.2.0`). The `Publish Windows app update`
workflow reruns the complete check, signs the app, and publishes the NSIS installer,
block map, and `latest.yml`. Installed apps check on startup and every four hours, but
download and restart only when the user requests them. Never embed a GitHub token in
the installer; the update repository must remain public.

## 6. Release acceptance checklist

- Production Supabase migrations and Edge Function deployed.
- RLS proves one account cannot read another account's subscription.
- RevenueCat webhook rejects missing/invalid HMAC and accepts a signed replay idempotently.
- Sandbox purchases cover all three plans; production URL contains no sandbox token.
- iOS purchase, cancel, restore, reinstall, and cross-device login tested on physical devices.
- Active users can edit on one computer, a second computer stays read-only, and the second gains editing only after the first lease expires.
- Disconnecting the network immediately changes an open workspace to read-only; reconnecting does not edit until the entitlement and session are reverified.
- App Review receives a working review account and visible subscription products.
- Windows installer is signed, installed, upgraded, and uninstalled on clean Windows 10 and 11 machines.
- A signed older Windows build discovers a tagged release, downloads it, and installs it only after the user confirms **Restart and install**.
- License gate is enabled only in the signed production builds.
- Privacy policy, terms, support URL, subscription terms, screenshots, and store metadata are final.

