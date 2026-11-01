-- Explicitly move an authenticated account's editing lease to its current session.
create function public.otk_transfer_license_session(
  p_user_id uuid, p_device_id uuid, p_device_name text, p_lease_seconds integer default 120
)
returns table(granted boolean, active_device_name text, active_lease_expires_at timestamptz)
language sql security definer set search_path = public as $$
  insert into public.otk_license_sessions as sessions
    (user_id, device_id, device_name, lease_expires_at, last_seen_at)
  values (p_user_id, p_device_id, left(coalesce(p_device_name, ''), 120),
    now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 120), 300))), now())
  on conflict(user_id) do update set device_id = excluded.device_id,
    device_name = excluded.device_name, lease_expires_at = excluded.lease_expires_at,
    last_seen_at = excluded.last_seen_at
  returning true, sessions.device_name, sessions.lease_expires_at;
$$;
revoke all on function public.otk_transfer_license_session(uuid, uuid, text, integer) from public, anon, authenticated;
grant execute on function public.otk_transfer_license_session(uuid, uuid, text, integer) to service_role;
