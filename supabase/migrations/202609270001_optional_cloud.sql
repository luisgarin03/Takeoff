-- Optional Supabase backend. No existing OpenTakeoff tables or data are changed.
create table public.otk_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (length(display_name) <= 120),
  created_at timestamptz not null default now()
);
create table public.otk_projects (
  id uuid primary key,
  owner_id uuid not null references auth.users(id),
  name text not null check (length(name) between 1 and 200),
  schema_version integer not null default 1 check (schema_version = 1),
  project_state jsonb not null,
  version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index otk_projects_owner on public.otk_projects(owner_id, updated_at desc);
create table public.otk_project_members (
  project_id uuid not null references public.otk_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('editor','viewer')),
  created_at timestamptz not null default now(),
  primary key(project_id,user_id)
);
create index otk_members_user on public.otk_project_members(user_id,project_id);
create table public.otk_project_files (
  project_id uuid not null references public.otk_projects(id) on delete cascade,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  original_filename text not null check (length(original_filename) between 1 and 1024),
  mime_type text not null,
  size bigint not null check (size > 0),
  storage_path text generated always as (project_id::text || '/' || sha256) stored,
  uploaded boolean not null default false,
  created_at timestamptz not null default now(),
  primary key(project_id,sha256), unique(storage_path)
);

-- Helpers avoid recursive RLS on the project/member relationship. Never accept
-- a user id from the client: identity is always the verified JWT's auth.uid().
create function public.otk_role(p_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select case when p.owner_id = auth.uid() then 'owner' else m.role end
  from public.otk_projects p left join public.otk_project_members m
    on m.project_id = p.id and m.user_id = auth.uid()
  where p.id = p_id and p.deleted_at is null
$$;
create function public.otk_owns(p_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.otk_projects where id = p_id and owner_id = auth.uid())
$$;

alter table public.otk_profiles enable row level security;
alter table public.otk_projects enable row level security;
alter table public.otk_project_members enable row level security;
alter table public.otk_project_files enable row level security;
create policy profiles_read on public.otk_profiles for select to authenticated using (
  id = auth.uid() or exists(select 1 from public.otk_projects p where p.owner_id = otk_profiles.id and public.otk_role(p.id) is not null)
  or exists(select 1 from public.otk_project_members m where m.user_id = otk_profiles.id and public.otk_role(m.project_id) is not null)
);
create policy profiles_insert on public.otk_profiles for insert to authenticated with check(id = auth.uid());
create policy profiles_update on public.otk_profiles for update to authenticated using(id = auth.uid()) with check(id = auth.uid());
create policy projects_read on public.otk_projects for select to authenticated using(public.otk_role(id) is not null or public.otk_owns(id));
create policy members_read on public.otk_project_members for select to authenticated using(public.otk_role(project_id) is not null);
create policy files_read on public.otk_project_files for select to authenticated using(public.otk_role(project_id) is not null or public.otk_owns(project_id));
-- Clients cannot bypass compare-and-swap by issuing a direct table update.
revoke all on public.otk_projects, public.otk_project_members, public.otk_project_files from anon, authenticated;
grant select on public.otk_projects, public.otk_project_members, public.otk_project_files to authenticated;
grant select, insert, update on public.otk_profiles to authenticated;

create function public.otk_save_project(p_id uuid, p_expected bigint, p_state jsonb)
returns public.otk_projects language plpgsql security definer set search_path = '' as $$
declare result public.otk_projects; title text;
begin
  if auth.uid() is null then raise exception 'OTK_AUTH'; end if;
  if p_state->>'schema' is distinct from 'opentakeoff.cloud.v1'
    or p_state->'annotations'->>'schema' is distinct from 'opentakeoff.takeoff_canvas.v1'
    or p_state->'annotations'->>'project_id' is distinct from p_id::text
    or jsonb_typeof(p_state->'annotations'->'shapes') is distinct from 'array'
    or jsonb_typeof(p_state->'annotations'->'conditions') is distinct from 'array'
    or jsonb_typeof(p_state->'plans') is distinct from 'array'
    or jsonb_typeof(p_state->'snapshots') is distinct from 'array'
    or octet_length(p_state::text) > 33554432 then raise exception 'OTK_FORMAT'; end if;
  title := coalesce(nullif(trim(p_state->'annotations'->>'project_name'),''),'Untitled project');
  if length(title) > 200 then raise exception 'OTK_NAME'; end if;
  if p_expected = 0 then
    insert into public.otk_projects(id,owner_id,name,project_state)
      values(p_id,auth.uid(),title,p_state) on conflict(id) do nothing returning * into result;
    if found then return result; end if;
  end if;
  select * into result from public.otk_projects where id=p_id for update;
  if not found or result.deleted_at is not null or public.otk_role(p_id) is null then raise exception 'OTK_ACCESS'; end if;
  if public.otk_role(p_id) not in ('owner','editor') then raise exception 'OTK_READ_ONLY'; end if;
  if result.version is distinct from p_expected then raise exception 'OTK_CONFLICT'; end if;
  update public.otk_projects set project_state=p_state,name=title,version=version+1,updated_at=clock_timestamp()
    where id=p_id returning * into result;
  return result;
end $$;

create function public.otk_share_project(p_id uuid, p_email text, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare target uuid;
begin
  if public.otk_role(p_id) is distinct from 'owner' then raise exception 'OTK_ACCESS'; end if;
  if p_role not in ('editor','viewer') or p_role is null then raise exception 'OTK_ROLE'; end if;
  select id into target from auth.users where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null;
  if target is null then raise exception 'OTK_MEMBER'; end if;
  if target=auth.uid() then raise exception 'OTK_OWNER'; end if;
  insert into public.otk_project_members(project_id,user_id,role) values(p_id,target,p_role)
    on conflict(project_id,user_id) do update set role=excluded.role;
end $$;
create function public.otk_remove_member(p_id uuid, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if public.otk_role(p_id) is distinct from 'owner' then raise exception 'OTK_ACCESS'; end if;
  delete from public.otk_project_members where project_id=p_id and user_id=p_user;
end $$;
create function public.otk_delete_project(p_id uuid, p_expected bigint)
returns void language plpgsql security definer set search_path = '' as $$
declare v bigint;
begin
  if not public.otk_owns(p_id) then raise exception 'OTK_ACCESS'; end if;
  select version into v from public.otk_projects where id=p_id for update;
  if v is distinct from p_expected then raise exception 'OTK_CONFLICT'; end if;
  update public.otk_projects set deleted_at=coalesce(deleted_at,now()),updated_at=now() where id=p_id;
end $$;

create function public.otk_purge_project(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.otk_owns(p_id) then raise exception 'OTK_ACCESS'; end if;
  perform 1 from public.otk_projects where id=p_id and deleted_at is not null for update;
  if not found then raise exception 'OTK_ACCESS'; end if;
  -- Storage API removal must finish first; never orphan billable objects.
  if exists(select 1 from storage.objects where bucket_id='otk-project-files' and split_part(name,'/',1)=p_id::text)
    then raise exception 'OTK_FILES_REMAIN'; end if;
  delete from public.otk_projects where id=p_id;
end $$;

create function public.otk_register_file(p_id uuid, p_hash text, p_name text, p_type text, p_size bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(public.otk_role(p_id),'') not in ('owner','editor') then raise exception 'OTK_ACCESS'; end if;
  if p_type not in ('application/pdf','image/png','image/jpeg','image/webp','image/gif','image/bmp') then raise exception 'OTK_FORMAT'; end if;
  insert into public.otk_project_files(project_id,sha256,original_filename,mime_type,size)
    values(p_id,p_hash,p_name,p_type,p_size) on conflict(project_id,sha256) do nothing;
end $$;
create function public.otk_finish_file(p_id uuid, p_hash text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(public.otk_role(p_id),'') not in ('owner','editor') then raise exception 'OTK_ACCESS'; end if;
  if not exists(select 1 from storage.objects where bucket_id='otk-project-files' and name=p_id::text||'/'||p_hash)
    then raise exception 'OTK_FILE_MISSING'; end if;
  update public.otk_project_files set uploaded=true where project_id=p_id and sha256=p_hash;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('otk-project-files','otk-project-files',false,50000000,
  array['application/pdf','image/png','image/jpeg','image/webp','image/gif','image/bmp']);
create policy otk_files_download on storage.objects for select to authenticated using (
  bucket_id='otk-project-files' and exists(select 1 from public.otk_project_files f
    where f.storage_path=objects.name and (public.otk_role(f.project_id) is not null or public.otk_owns(f.project_id)))
);
create policy otk_files_upload on storage.objects for insert to authenticated with check (
  bucket_id='otk-project-files' and exists(select 1 from public.otk_project_files f
    where f.storage_path=objects.name and public.otk_role(f.project_id) in ('owner','editor'))
);
-- Immutable content-addressed objects: no UPDATE policy, even for editors.
create policy otk_files_delete on storage.objects for delete to authenticated using (
  bucket_id='otk-project-files' and exists(select 1 from public.otk_projects p
    where split_part(objects.name,'/',1)=p.id::text and public.otk_owns(p.id) and p.deleted_at is not null)
);

revoke all on function public.otk_role(uuid), public.otk_owns(uuid), public.otk_save_project(uuid,bigint,jsonb),
  public.otk_share_project(uuid,text,text), public.otk_remove_member(uuid,uuid), public.otk_delete_project(uuid,bigint),
  public.otk_register_file(uuid,text,text,text,bigint), public.otk_finish_file(uuid,text), public.otk_purge_project(uuid) from public, anon;
grant execute on function public.otk_role(uuid), public.otk_owns(uuid), public.otk_save_project(uuid,bigint,jsonb),
  public.otk_share_project(uuid,text,text), public.otk_remove_member(uuid,uuid), public.otk_delete_project(uuid,bigint),
  public.otk_register_file(uuid,text,text,text,bigint), public.otk_finish_file(uuid,text), public.otk_purge_project(uuid) to authenticated;
