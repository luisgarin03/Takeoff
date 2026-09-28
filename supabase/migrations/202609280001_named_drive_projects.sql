-- Human-readable Google Drive organization while stable project/file IDs remain canonical.
alter table public.otk_project_files drop constraint if exists otk_project_files_file_kind_check;
alter table public.otk_project_files add constraint otk_project_files_file_kind_check
  check (file_kind in ('archive','originals','whiteboard','attachments'));

create or replace function public.otk_register_file(p_id uuid,p_hash text,p_name text,p_type text,p_size bigint)
returns void language plpgsql security definer set search_path='' as $$
declare p public.otk_projects; f public.otk_project_files; kind text;
begin
  select * into p from public.otk_projects where id=p_id for update;
  if coalesce(public.otk_role(p_id),'') not in ('owner','editor') then raise exception 'OTK_ACCESS'; end if;
  kind := case
    when p.project_state->'archive'->>'sha256'=p_hash then 'archive'
    when exists(select 1 from jsonb_array_elements(p.project_state->'plans') r where r->>'sha256'=p_hash) then 'originals'
    else 'whiteboard' end;
  if p_type not in ('application/octet-stream','application/pdf','image/png','image/jpeg','image/webp','image/gif','image/bmp')
    or (kind='archive' and (p_type<>'application/octet-stream' or p_name!~* '\.otk$')) then raise exception 'OTK_FORMAT'; end if;
  if p.file_provider='google_drive' and p_size>2147483648 then raise exception 'OTK_DRIVE_SIZE'; end if;

  -- A project has one logical portable archive. On rename/save, carry its
  -- stable Drive identity to the new content hash and retire the old row.
  if kind='archive' then
    select * into f from public.otk_project_files where project_id=p_id and file_kind='archive' order by uploaded desc limit 1;
    if found and f.sha256<>p_hash then
      delete from public.otk_project_files where project_id=p_id and file_kind='archive';
      insert into public.otk_project_files(project_id,sha256,original_filename,mime_type,size,storage_provider,provider_owner_id,file_kind,provider_file_id,provider_folder_id,uploaded)
        values(p_id,p_hash,p_name,p_type,p_size,p.file_provider,case when p.file_provider='google_drive' then p.owner_id else null end,
          kind,f.provider_file_id,f.provider_folder_id,false);
    end if;
  end if;
  insert into public.otk_project_files(project_id,sha256,original_filename,mime_type,size,storage_provider,provider_owner_id,file_kind)
    values(p_id,p_hash,p_name,p_type,p_size,p.file_provider,case when p.file_provider='google_drive' then p.owner_id else null end,kind)
    on conflict(project_id,sha256) do update set original_filename=excluded.original_filename;
  select * into f from public.otk_project_files where project_id=p_id and sha256=p_hash;
  if f.size<>p_size or f.mime_type<>p_type then raise exception 'OTK_FORMAT'; end if;
  update public.otk_projects set file_provider_locked=true where id=p_id;
end $$;
