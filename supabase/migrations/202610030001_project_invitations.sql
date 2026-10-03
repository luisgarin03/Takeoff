-- Invitations contain references to the sender's Drive files, never file copies.
create table public.otk_project_invitations (
  id uuid primary key,
  sender_id uuid not null references auth.users(id),
  sender_email text not null,
  recipient_email text not null,
  project_name text not null,
  files jsonb not null,
  state text not null default 'draft' check(state in ('draft','ready','revoked')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now()+interval '30 days',
  imported_at timestamptz,
  email_sent_at timestamptz
);
create index otk_invitations_recipient on public.otk_project_invitations(recipient_email,created_at desc);
create index otk_invitations_sender on public.otk_project_invitations(sender_id,created_at desc);
alter table public.otk_project_invitations enable row level security;
create function public.otk_verified_email() returns text language sql stable security definer set search_path='' as $$
  select lower(email) from auth.users where id=auth.uid() and email_confirmed_at is not null
$$;
revoke all on function public.otk_verified_email() from public;
grant execute on function public.otk_verified_email() to authenticated;
grant select on public.otk_project_invitations to authenticated;
grant all on public.otk_project_invitations to service_role;
create policy invitations_read on public.otk_project_invitations for select to authenticated using(
  sender_id=auth.uid() or (state='ready' and expires_at>now() and recipient_email=public.otk_verified_email())
);
-- All mutations use the authenticated Edge Function after Drive checks. The
-- service-role-only reservation serializes rate checks and prevents email abuse.
create function public.otk_reserve_invitation(p_row jsonb) returns void language plpgsql security definer set search_path='' as $$
declare sender uuid := (p_row->>'sender_id')::uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(sender::text,0));
  if (select count(*) from public.otk_project_invitations where sender_id=sender and created_at>now()-interval '1 day')>=20 then raise exception 'OTK_RATE'; end if;
  insert into public.otk_project_invitations(id,sender_id,sender_email,recipient_email,project_name,files)
    values((p_row->>'id')::uuid,sender,p_row->>'sender_email',p_row->>'recipient_email',p_row->>'project_name',p_row->'files');
end $$;
revoke all on function public.otk_reserve_invitation(jsonb) from public,anon,authenticated;
grant execute on function public.otk_reserve_invitation(jsonb) to service_role;
