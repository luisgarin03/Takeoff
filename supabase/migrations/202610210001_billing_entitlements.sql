-- Server-owned cross-platform subscriptions and license entitlements.
-- RevenueCat is the purchase source; Supabase Auth is the account identity.
create table public.otk_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'inactive' check (status in ('active','trialing','grace','canceled','expired','inactive','billing_issue')),
  plan_id text not null default '' check (length(plan_id) <= 80),
  provider text not null default 'revenuecat' check (provider = 'revenuecat'),
  product_id text not null default '' check (length(product_id) <= 255),
  store text not null default '' check (length(store) <= 40),
  entitlement_id text not null check (length(entitlement_id) between 1 and 120),
  revenuecat_customer_id text not null check (length(revenuecat_customer_id) between 1 and 255),
  subscription_id text not null default '' check (length(subscription_id) <= 255),
  current_period_end timestamptz,
  will_renew boolean not null default false,
  environment text not null default 'production' check (environment in ('production','sandbox')),
  last_event_id text not null default '' check (length(last_event_id) <= 255),
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.otk_billing_events (
  id text primary key check (length(id) between 1 and 255),
  event_type text not null check (length(event_type) between 1 and 120),
  user_id uuid references auth.users(id) on delete set null,
  environment text not null default 'production' check (environment in ('production','sandbox')),
  received_at timestamptz not null default now()
);

alter table public.otk_subscriptions enable row level security;
alter table public.otk_billing_events enable row level security;

create policy subscriptions_read_own on public.otk_subscriptions
  for select to authenticated using (user_id = auth.uid());

-- Browser/mobile clients can read only their own entitlement. Only the service
-- role used by the billing Edge Function can insert or update these records.
revoke all on public.otk_subscriptions, public.otk_billing_events from anon, authenticated;
grant select on public.otk_subscriptions to authenticated;

create index otk_billing_events_received on public.otk_billing_events(received_at desc);

