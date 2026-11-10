create table public.otk_stripe_live_customers (
 user_id uuid primary key references auth.users(id) on delete cascade,
 customer_id text not null unique check(customer_id like 'cus_%'),
 created_at timestamptz not null default now()
);
alter table public.otk_stripe_live_customers enable row level security;
revoke all on public.otk_stripe_live_customers from public, anon, authenticated;
grant select, insert, update on public.otk_stripe_live_customers to service_role;
