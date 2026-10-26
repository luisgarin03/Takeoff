-- Calendar data only. Construction documents and project archives remain local.
create table public.calendars (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (length(trim(name)) between 1 and 120), description text not null default '' check(length(description)<=4000),
 color text not null default '#4f73bd' check(color ~ '^#[0-9a-fA-F]{6}$'),
 visibility text not null default 'private' check(visibility in ('private','shared')),
 is_personal boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index calendar_personal_owner on public.calendars(owner_id) where is_personal;
create table public.calendar_members (
 id uuid primary key default gen_random_uuid(), calendar_id uuid not null references public.calendars(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in ('owner','editor','viewer')), created_at timestamptz not null default now(), unique(calendar_id,user_id)
);
create index calendar_member_user on public.calendar_members(user_id,calendar_id);
create function public.otk_calendar_role(p_id uuid) returns text language sql stable security definer set search_path = '' as $$
 select case when c.owner_id=auth.uid() then 'owner' else
 (select m.role from public.calendar_members m where m.calendar_id=c.id and m.user_id=auth.uid()) end
 from public.calendars c where c.id=p_id
$$;
revoke all on function public.otk_calendar_role(uuid) from public;
grant execute on function public.otk_calendar_role(uuid) to authenticated;
create table public.calendar_events (
 id uuid primary key default gen_random_uuid(), calendar_id uuid not null references public.calendars(id) on delete cascade,
 title text not null check(length(trim(title)) between 1 and 250), description text not null default '' check(length(description)<=20000),
 location text not null default '' check(length(location)<=1000), start_time timestamptz not null, end_time timestamptz not null,
 timezone text not null default 'UTC' check(length(timezone)<=100), all_day boolean not null default false,
 recurrence_rule text check(length(recurrence_rule)<=4000), category text not null default 'General' check(length(category)<=80),
 color text check(color ~ '^#[0-9a-fA-F]{6}$'), source text not null default 'supabase' check(source in ('supabase','project')),
 external_event_id text check(length(external_event_id)<=500), created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(end_time>start_time),
 unique(calendar_id,source,external_event_id)
);
create index calendar_event_range on public.calendar_events(calendar_id,start_time,end_time);
create table public.calendar_attachments (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.calendar_events(id) on delete cascade,
 provider text not null default 'google_drive' check(provider='google_drive'), provider_file_id text not null check(length(provider_file_id) between 1 and 255),
 filename text not null check(length(filename) between 1 and 500), mime_type text not null check(length(mime_type)<=255),
 external_url text not null check(external_url ~ '^https://(drive|docs)\.google\.com/'), created_at timestamptz not null default now(), unique(event_id,provider,provider_file_id)
);
create index calendar_attachment_event on public.calendar_attachments(event_id);
create table public.google_connections (
 owner_id uuid primary key references auth.users(id) on delete cascade, email text not null default '',
 granted_scopes text[] not null default '{}', status text not null default 'disconnected' check(status in ('connected','disconnected','revoked')),
 selected_calendar_ids text[] not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create function public.otk_calendar_touch() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name='calendars' then
  if new.owner_id<>old.owner_id or new.is_personal<>old.is_personal then raise exception 'Calendar ownership is immutable'; end if;
 elsif tg_table_name='calendar_events' then
  if new.created_by<>old.created_by or new.calendar_id<>old.calendar_id then raise exception 'Event ownership is immutable'; end if;
 end if;
 new.updated_at=clock_timestamp(); return new;
end $$;
create trigger calendar_touch before update on public.calendars for each row execute function public.otk_calendar_touch();
create trigger calendar_event_touch before update on public.calendar_events for each row execute function public.otk_calendar_touch();
alter table public.calendars enable row level security;
alter table public.calendar_members enable row level security;
alter table public.calendar_events enable row level security;
alter table public.calendar_attachments enable row level security;
alter table public.google_connections enable row level security;
revoke all on public.calendars, public.calendar_members, public.calendar_events, public.calendar_attachments, public.google_connections from anon, authenticated;
grant select,insert,update,delete on public.calendars,public.calendar_members,public.calendar_events,public.calendar_attachments to authenticated;
grant select on public.google_connections to authenticated;
create policy calendar_read on public.calendars for select to authenticated using(public.otk_calendar_role(id) is not null);
create policy calendar_create on public.calendars for insert to authenticated with check(owner_id=auth.uid() and not is_personal);
create policy calendar_edit on public.calendars for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy calendar_delete on public.calendars for delete to authenticated using(owner_id=auth.uid() and not is_personal);
create policy member_read on public.calendar_members for select to authenticated using(public.otk_calendar_role(calendar_id) is not null);
create policy member_create on public.calendar_members for insert to authenticated with check(public.otk_calendar_role(calendar_id)='owner' and role in ('editor','viewer'));
create policy member_update on public.calendar_members for update to authenticated using(public.otk_calendar_role(calendar_id)='owner') with check(public.otk_calendar_role(calendar_id)='owner' and role in ('editor','viewer'));
create policy member_delete on public.calendar_members for delete to authenticated using(public.otk_calendar_role(calendar_id)='owner');
create policy event_read on public.calendar_events for select to authenticated using(public.otk_calendar_role(calendar_id) is not null);
create policy event_create on public.calendar_events for insert to authenticated with check(public.otk_calendar_role(calendar_id) in ('owner','editor') and created_by=auth.uid());
create policy event_update on public.calendar_events for update to authenticated using(public.otk_calendar_role(calendar_id) in ('owner','editor')) with check(public.otk_calendar_role(calendar_id) in ('owner','editor'));
create policy event_delete on public.calendar_events for delete to authenticated using(public.otk_calendar_role(calendar_id) in ('owner','editor'));
create policy attachment_read on public.calendar_attachments for select to authenticated using(exists(select 1 from public.calendar_events e where e.id=event_id and public.otk_calendar_role(e.calendar_id) is not null));
create policy attachment_create on public.calendar_attachments for insert to authenticated with check(exists(select 1 from public.calendar_events e where e.id=event_id and public.otk_calendar_role(e.calendar_id) in ('owner','editor')));
create policy attachment_update on public.calendar_attachments for update to authenticated using(exists(select 1 from public.calendar_events e where e.id=event_id and public.otk_calendar_role(e.calendar_id) in ('owner','editor'))) with check(exists(select 1 from public.calendar_events e where e.id=event_id and public.otk_calendar_role(e.calendar_id) in ('owner','editor')));
create policy attachment_delete on public.calendar_attachments for delete to authenticated using(exists(select 1 from public.calendar_events e where e.id=event_id and public.otk_calendar_role(e.calendar_id) in ('owner','editor')));
create policy google_connection_read on public.google_connections for select to authenticated using(owner_id=auth.uid());
create function public.otk_provision_calendar() returns public.calendars language plpgsql security definer set search_path='' as $$
declare result public.calendars;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 insert into public.calendars(owner_id,name,is_personal) values(auth.uid(),'My calendar',true)
 on conflict(owner_id) where is_personal do update set owner_id=excluded.owner_id returning * into result;
 return result;
end $$;
revoke all on function public.otk_provision_calendar() from public;
grant execute on function public.otk_provision_calendar() to authenticated;
-- RLS filters realtime row delivery. Minimal notifications trigger authorized refetches.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
 alter publication supabase_realtime add table public.calendars,public.calendar_events,public.calendar_members,public.calendar_attachments;
 end if;
end $$;
