# ESTIMATING website and admin

## Start
Double-click **Start-ESTIMATING.cmd** in this folder. It checks Node.js 24+, initializes dependencies, starts the website in a hidden background process, and opens Website and Admin. Run it again to reopen an existing server.

- Website: http://127.0.0.1:5174/landing
- Admin: http://127.0.0.1:5174/dashboard
- Users: http://127.0.0.1:5174/users

PowerShell: `./Start-ESTIMATING.ps1 -NoBrowser` or `./Start-ESTIMATING.ps1 -Port 5175`.
Logs: `.runtime/server.log` and `.runtime/server-error.log`.

## Supabase
Connected to the existing **OpenTakeoff** project, `oeprbftxfnksgdqztezq`.
Dashboard and Users show live account counts, active subscription/trial counts, cloud project counts, and a paginated searchable user list. No production user/subscription mutation controls are included. Other cloned admin pages are explicitly marked template demos.

Sign in using your existing OpenTakeoff account. The initial administrator is **luisgarin003@gmail.com**. Website sessions use their own browser storage key. Signing out here signs out this website locally.

Supabase public URL and publishable key are stored in ignored `vite-version/.env.local`. No service-role key is included in browser code. On a fresh copy the startup script can copy only public Supabase settings from the existing app's `web/.env.local`; otherwise fill these in using `.env.example`.

For Google sign-in, Supabase Authentication > URL Configuration must allow `http://127.0.0.1:5174/dashboard` (and any alternate development port). Add your deployed website callback URL before hosting it. Email/password sign-in works independently of OAuth redirect configuration.

The additive admin database migration has already been applied. To reinitialize intentionally, run `./Initialize-Database.ps1` while authenticated with the Supabase CLI. Startup never reapplies migrations or resets existing production data. The functions check an explicit, server-owned `otk_website_admins` allowlist on every request. They return only account, entitlement, and project-count fields, never project contents or authentication secrets.

Manage allowlisted administrators through Supabase SQL Editor, using the confirmed user's UUID from Authentication > Users:

```sql
insert into public.otk_website_admins(user_id) values ('USER-UUID') on conflict do nothing;
-- Revoke access:
delete from public.otk_website_admins where user_id = 'USER-UUID';
```

Database permission tests: `supabase db query --linked --file supabase/tests/website_admin.sql`.
Client validation: `npm run lint` and `npm run build` in `vite-version`.

## Source
Cloned from https://github.com/shadcnstore/shadcn-dashboard-landing-template (MIT; see License.md). The active Vite version contains Frontier landing and Chronicle admin. The original Next.js variant is retained separately.
Shared ESTIMATING toolbar and neutral buttons support light/dark mode. Marketing copy and the additional cloned apps remain template content. ## Cloudflare production

- Website: https://estimating.studio (also https://www.estimating.studio)
- Admin: https://estimating.studio/dashboard
- Takeoff app: https://app.estimating.studio
- Website Worker: estimating-website
- App Worker: takeoff

The website Worker owns the root/www custom domains; takeoff owns only app.estimating.studio. Do not restore the old root-domain routes to the takeoff Worker. Supabase's site URL is app.estimating.studio, and the allowlist includes both website-admin and app callbacks.

To redeploy, run `npm run deploy` inside `vite-version` after `npx wrangler login`. Build uses ignored `.env.local`; configure the same public build variables if connecting a Git build later. Production database initialization is separate from deployment and is already complete.
