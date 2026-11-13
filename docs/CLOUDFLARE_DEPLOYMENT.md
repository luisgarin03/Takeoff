## Cloudflare deployment

The OpenTakeoff app is served by the `takeoff` Cloudflare Worker at `https://app.estimating.studio`. Worker configuration is in `web/wrangler.jsonc`; it sets the Worker name, account, route, assets directory, and compatibility date. In Cloudflare Workers Builds, use `luisgarin03/Takeoff`, root directory `web`, build command `npm run build`, and deploy command `npx wrangler deploy --assets ./dist`. Wrangler reads the compatibility date from `web/wrangler.jsonc`, so local and Cloudflare builds use the same setting.

### Shared office/home source

Use `production/cloudflare-app` as the one shared office/home branch. The office checkout and home checkout should never carry separate unpublished versions of the same work. Work on one computer at a time:

1. Check `git status --short --branch` and safely commit or preserve any in-progress edits.
2. Switch to `production/cloudflare-app` and run `git pull --ff-only` before editing.
3. Run `npm run check` from `web`, commit completed work, then push to `origin production/cloudflare-app`.
4. On the other computer, pull the branch with `--ff-only` before editing. Do not cherry-pick.

For a fresh home-PC clone, create the tracking branch with:

```powershell
git switch --track -c production/cloudflare-app origin/production/cloudflare-app
```

### Verify the live version

After each push, confirm Cloudflare shows a successful build for the pushed Git commit and that the resulting Worker version is active in Production. A failed build, a manually deployed version without a commit reference, or disagreement between the dashboard status and Wrangler output is not proof that the intended source is live. Inspect the production deployment and active traffic before calling the source and Cloudflare versions synchronized.

Keep secrets and local environment files out of Git. The app's public local configuration is read from `web/.env.local`; privileged keys must never be placed in `VITE_*` variables. Browser-local projects and suppliers remain in their browser origin, so use the app's export/import workflow to move those data between localhost and the hosted site.
