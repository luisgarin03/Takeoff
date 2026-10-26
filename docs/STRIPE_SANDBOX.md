# Stripe sandbox subscriptions

Web subscriptions use Stripe Checkout through the authenticated `otk-stripe` Supabase function. Native purchases retain the existing store adapter. The endpoint accepts only `sk_test_` or `rk_test_` keys and rejects live Checkout Sessions and live webhook events.

| App ID | Price | Period |
| --- | --- | --- |
| estimating_pro_monthly | USD 40 | Monthly |
| estimating_pro_yearly | USD 400 | Yearly |

The server supplies prices; browser amounts are never trusted. Recurring inline prices are created during Checkout.

## Setup

1. Apply `supabase/migrations/202610250002_stripe_test_billing.sql`. It retains existing records, adds the Stripe provider, and creates an RLS-protected server-only customer mapping.
2. Store `STRIPE_TEST_SECRET_KEY` as a Supabase Edge Function secret. Never put it in Vite variables, source code, chat, or browser storage.
3. Set `OTK_BILLING_ALLOWED_ORIGINS` to exact app origins. Return URLs must match this list.
4. Deploy `otk-stripe` with `--no-verify-jwt`. All non-webhook routes validate Supabase bearer tokens through `getUser()`. Deploy the updated `otk-billing` too, which retains Stripe records and permits SDK CORS headers.
5. Add a Stripe sandbox webhook at `https://oeprbftxfnksgdqztezq.supabase.co/functions/v1/otk-stripe?action=webhook` for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, and `invoice.payment_failed`. Store its signing secret as `STRIPE_TEST_WEBHOOK_SECRET` in Supabase.

Authenticated refresh verifies subscriptions directly with Stripe, so returning to the app can synchronize a test purchase before a webhook is configured. Webhooks are needed for updates while the app is closed. Replayed and out-of-order events reread Stripe state. Unknown customer mappings are ignored.

## Test

Sign in, open Profile → Subscription, and choose Monthly or Yearly. Checkout must say test mode. Use Stripe's test card `4242 4242 4242 4242`, a future expiration date, and any three-digit CVC. Do not enter real card details. Return to the app and reopen Profile; focus refresh verifies Stripe and shows a sandbox subscription. Canceling Checkout never grants access. Manage Subscription opens Stripe's customer portal; configure the portal in the sandbox dashboard if requested.

Sandbox rows remain labeled `environment=sandbox` and cannot replace production entitlements. Production license enforcement continues rejecting sandbox licenses unless explicitly enabled through existing sandbox-license settings. Test purchases do not silently grant production editing access.

## Validation and limits

`web/test/stripeBilling.test.ts` covers fixed prices, ownership, live-mode rejection, redirects, authoritative refresh, replayed events, duplicate active subscriptions, and production entitlement protection. Existing subscription tests cover adapter delegation. Run `npm run check` in `web` before publishing.

Live purchases require a separately reviewed configuration and release. No live API key is supported by this endpoint.

References: [Stripe subscription Checkout](https://docs.stripe.com/payments/checkout/build-subscriptions), [testing](https://docs.stripe.com/testing), [webhook verification](https://docs.stripe.com/webhooks/signature).
