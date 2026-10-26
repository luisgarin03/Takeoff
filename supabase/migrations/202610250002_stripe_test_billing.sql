-- Retain existing entitlements; add Stripe as a supported purchase source.
alter table public.otk_subscriptions drop constraint otk_subscriptions_provider_check;
alter table public.otk_subscriptions add constraint otk_subscriptions_provider_check check(provider in ('revenuecat','stripe'));
create table public.otk_stripe_customers (
 user_id uuid primary key references auth.users(id) on delete cascade,
 customer_id text not null unique check(customer_id like 'cus_%'),
 environment text not null default 'sandbox' check(environment='sandbox'),
 created_at timestamptz not null default now()
);
alter table public.otk_stripe_customers enable row level security;
revoke all on public.otk_stripe_customers from public,anon,authenticated;
grant all on public.otk_stripe_customers to service_role;
grant select,insert,update on public.otk_subscriptions,public.otk_billing_events to service_role;
