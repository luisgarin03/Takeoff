-- Additive optional Drive provider. Existing projects/files remain in Supabase.
alter table public.otk_projects add column file_provider text not null default 'supabase'
  check (file_provider in ('supabase','google_drive'));
alter table public.otk_projects add column file_provider_locked boolean not null default false;
update public.otk_projects p set file_provider_locked=true
  where exists(select 1 from public.otk_project_files f where f.project_id=p.id);
alter table public.otk_project_files add column storage_provider text not null default 'supabase'
  check (storage_provider in ('supabase','google_drive'));
alter table public.otk_project_files add column provider_file_id text;
alter table public.otk_project_files add column provider_folder_id text;
alter table public.otk_project_files add column provider_owner_id uuid references auth.users(id);
alter table public.otk_project_files add column file_kind text not null default 'originals'
  check (file_kind in ('originals','whiteboard','attachments'));

-- Encrypted credentials and resumable URLs are server-only, NEVER file metadata.
create table public.otk_drive_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  google_sub text, email text,
  token_cipher text, status text not null default 'disconnected', oauth_nonce text,
  root_folder_id text, updated_at timestamptz not null default now()
);
create table public.otk_drive_oauth (
  state_hash text primary key, user_id uuid not null references auth.users(id) on delete cascade,
  verifier_cipher text not null, return_url text not null,
  expires_at timestamptz not null
);
create table public.otk_drive_uploads (
  project_id uuid not null, sha256 text not null,
  session_cipher text, lease_id uuid, lease_until timestamptz,
  primary key(project_id,sha256),
  foreign key(project_id,sha256) references public.otk_project_files(project_id,sha256) on delete cascade
);
alter table public.otk_drive_connections enable row level security;
alter table public.otk_drive_oauth enable row level security;
alter table public.otk_drive_uploads enable row level security;
revoke all on public.otk_drive_connections,public.otk_drive_oauth,public.otk_drive_uploads from public,anon,authenticated;
grant all on public.otk_drive_connections,public.otk_drive_oauth,public.otk_drive_uploads to service_role;
grant select on public.otk_projects,public.otk_project_members to service_role;
grant select,update on public.otk_project_files to service_role;

create function public.otk_set_file_provider(p_id uuid,p_provider text)
returns public.otk_projects language plpgsql security definer set search_path='' as $$
declare p public.otk_projects;
begin
  select * into p from public.otk_projects where id=p_id for update;
  if not found or public.otk_role(p_id) is distinct from 'owner' then raise exception 'OTK_ACCESS'; end if;
  if p_provider is null or p_provider not in ('supabase','google_drive') then raise exception 'OTK_FORMAT'; end if;
  if p.file_provider=p_provider then return p; end if;
  if p.file_provider_locked or exists(select 1 from public.otk_project_files where project_id=p_id)
    then raise exception 'OTK_PROVIDER_LOCKED'; end if;
  if p_provider='google_drive' and not exists(select 1 from public.otk_drive_connections where user_id=auth.uid() and status='connected' and token_cipher is not null)
    then raise exception 'OTK_DRIVE_CONNECT'; end if;
  update public.otk_projects set file_provider=p_provider where id=p_id returning * into p;
  return p;
end $$;

create or replace function public.otk_register_file(p_id uuid,p_hash text,p_name text,p_type text,p_size bigint)
returns void language plpgsql security definer set search_path='' as $$
declare p public.otk_projects; f public.otk_project_files;
begin
  select * into p from public.otk_projects where id=p_id for update;
  if coalesce(public.otk_role(p_id),'') not in ('owner','editor') then raise exception 'OTK_ACCESS'; end if;
  if p_type not in ('application/pdf','image/png','image/jpeg','image/webp','image/gif','image/bmp') then raise exception 'OTK_FORMAT'; end if;
  if p.file_provider='google_drive' and p_size>2147483648 then raise exception 'OTK_DRIVE_SIZE'; end if;
  insert into public.otk_project_files(project_id,sha256,original_filename,mime_type,size,storage_provider,provider_owner_id,file_kind)
    values(p_id,p_hash,p_name,p_type,p_size,p.file_provider,
      case when p.file_provider='google_drive' then p.owner_id else null end,
      case when exists(select 1 from jsonb_array_elements(p.project_state->'plans') r where r->>'sha256'=p_hash) then 'originals' else 'whiteboard' end)
    on conflict(project_id,sha256) do nothing;
  select * into f from public.otk_project_files where project_id=p_id and sha256=p_hash;
  if f.size<>p_size or f.mime_type<>p_type then raise exception 'OTK_FORMAT'; end if;
  update public.otk_projects set file_provider_locked=true where id=p_id;
end $$;

create or replace function public.otk_finish_file(p_id uuid,p_hash text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if coalesce(public.otk_role(p_id),'') not in ('owner','editor') then raise exception 'OTK_ACCESS'; end if;
  if exists(select 1 from public.otk_project_files where project_id=p_id and sha256=p_hash and storage_provider='google_drive')
    then raise exception 'OTK_ACCESS'; end if; -- Only the verified server upload may finish Drive files.
  if not exists(select 1 from storage.objects where bucket_id='otk-project-files' and name=p_id::text||'/'||p_hash)
    then raise exception 'OTK_FILE_MISSING'; end if;
  update public.otk_project_files set uploaded=true where project_id=p_id and sha256=p_hash;
end $$;

create or replace function public.otk_purge_project(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.otk_owns(p_id) then raise exception 'OTK_ACCESS'; end if;
  perform 1 from public.otk_projects where id=p_id and deleted_at is not null for update;
  if not found then raise exception 'OTK_ACCESS'; end if;
  if exists(select 1 from storage.objects where bucket_id='otk-project-files' and split_part(name,'/',1)=p_id::text)
    or exists(select 1 from public.otk_project_files where project_id=p_id and storage_provider='google_drive' and provider_file_id is not null)
    or exists(select 1 from public.otk_drive_uploads where project_id=p_id and lease_until>now())
    then raise exception 'OTK_FILES_REMAIN'; end if;
  delete from public.otk_projects where id=p_id;
end $$;

-- Atomic, single-use OAuth state and short transfer leases, callable only on the backend.
create function public.otk_drive_claim_oauth(p_hash text) returns setof public.otk_drive_oauth
language sql security definer set search_path='' as $$
  delete from public.otk_drive_oauth where state_hash=p_hash and expires_at>now() returning *
$$;
create function public.otk_drive_lease(p_id uuid,p_hash text,p_lease uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  insert into public.otk_drive_uploads(project_id,sha256,lease_id,lease_until)
    values(p_id,p_hash,p_lease,now()+interval '180 seconds')
    on conflict(project_id,sha256) do update set lease_id=excluded.lease_id,lease_until=excluded.lease_until
    where otk_drive_uploads.lease_until is null or otk_drive_uploads.lease_until<now();
  return found;
end $$;
revoke all on function public.otk_drive_claim_oauth(text),public.otk_drive_lease(uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.otk_drive_claim_oauth(text),public.otk_drive_lease(uuid,text,uuid) to service_role;
revoke all on function public.otk_set_file_provider(uuid,text) from public,anon;
grant execute on function public.otk_set_file_provider(uuid,text) to authenticated;

-- Do not let legacy storage policies grant access to a Drive-backed row.
alter policy otk_files_download on storage.objects using (
  bucket_id='otk-project-files' and exists(select 1 from public.otk_project_files f where f.storage_provider='supabase'
    and f.storage_path=objects.name and (public.otk_role(f.project_id) is not null or public.otk_owns(f.project_id)))
);
alter policy otk_files_upload on storage.objects with check (
  bucket_id='otk-project-files' and exists(select 1 from public.otk_project_files f where f.storage_provider='supabase'
    and f.storage_path=objects.name and public.otk_role(f.project_id) in ('owner','editor'))
);
