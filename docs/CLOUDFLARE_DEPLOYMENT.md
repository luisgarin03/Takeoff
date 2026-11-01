## Cloudflare deployment

The current web build is hosted by the `takeoff` Cloudflare Worker. Its custom domains are `https://estimating.studio` and `https://www.estimating.studio`; the fallback URL is `https://takeoff.luisgarin003.workers.dev`. Configuration lives in `web/wrangler.jsonc`.

Deploy from `web/` after checks finish (do not build and upload concurrently):

```powershell
npm run check
npx wrangler deploy
```

The build reads public Supabase configuration from `web/.env.local`. Keep privileged keys out of VITE variables. Supabase Auth uses `https://estimating.studio` as its site URL and allows both custom domains plus the Worker URL as redirects. Edge functions merge `OTK_DEPLOYMENT_ALLOWED_ORIGINS` into their existing origin allowlists, preserving previous deployments. DNS registration/propagation can delay a newly purchased domain even after Cloudflare reports the custom domain attached.

Browser-local projects and custom suppliers remain in the browser origin where they were created. Export/import local projects to move them from localhost to the hosted site.


The dedicated source backup and Cloudflare production branch is `opentakeoff-cloudfare` in `luisgarin03/Takeoff`. Keep secrets and local environment configuration outside Git. Marketing pages should be a separate project folder (for example `website/`) in this repository, deployed independently of the `web/` app.
