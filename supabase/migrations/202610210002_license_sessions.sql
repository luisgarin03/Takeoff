-- A short server-owned editing lease enforces one active computer per account.
-- Other signed-in computers may still open the app, but the client puts them
-- in read-only mode until this lease expires.  Keeping the lease short means a
-- crashed or sleeping computer cannot lock the account indefinitely.
create table public.otk_license_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  device_id uuid not null,
  device_name text not null default '' check (length(device_name) <= 120),
  lease_expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.otk_license_sessions enable row level security;
revoke all on public.otk_license_sessions from anon, authenticated;

-- The billing Edge Function calls this with the authenticated user's id.  The
-- function serializes competing claims on that user's primary-key row.  A
-- device may renew its own lease; a different device may claim it only after
-- the prior lease expires.
create or replace function public.otk_claim_license_session(
  p_user_id uuid,
  p_device_id uuid,
  p_device_name text,
  p_lease_seconds integer default 120
)
returns table (
  granted boolean,
  active_device_name text,
  active_lease_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row public.otk_license_sessions%rowtype;
  safe_seconds integer := greatest(30, least(coalesce(p_lease_seconds, 120), 300));
begin
  insert into public.otk_license_sessions as sessions (
    user_id, device_id, device_name, lease_expires_at, last_seen_at
  ) values (
    p_user_id,
    p_device_id,
    left(coalesce(p_device_name, ''), 120),
    now() + make_interval(secs => safe_seconds),
    now()
  )
  on conflict (user_id) do update set
    device_id = excluded.device_id,
    device_name = excluded.device_name,
    lease_expires_at = excluded.lease_expires_at,
    last_seen_at = excluded.last_seen_at
  where sessions.device_id = excluded.device_id
     or sessions.lease_expires_at <= now()
  returning sessions.* into current_row;

  if found then
    return query select true, current_row.device_name, current_row.lease_expires_at;
    return;
  end if;

  select * into current_row
  from public.otk_license_sessions
  where user_id = p_user_id;

  return query select false, current_row.device_name, current_row.lease_expires_at;
end;
$$;

revoke all on function public.otk_claim_license_session(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.otk_claim_license_session(uuid, uuid, text, integer) to service_role;

create index otk_license_sessions_expiry on public.otk_license_sessions(lease_expires_at);
