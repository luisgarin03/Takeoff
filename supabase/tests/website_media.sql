begin;
do $$ begin
 if not exists(select 1 from storage.buckets where id='website-media' and public and file_size_limit=10485760 and allowed_mime_types=array['image/png','image/jpeg','image/webp']) then raise exception 'Website bucket configuration failed'; end if;
 if (select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname in ('Website media public read','Website admins insert media','Website admins update media')) <> 3 then raise exception 'Website media policies missing'; end if;
end $$;
set local role anon;
select count(*) as visible_images from storage.objects where bucket_id='website-media';
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
do $$ begin
 begin
  insert into storage.objects(bucket_id,name) values('website-media','homepage');
  raise exception 'Non-admin upload was allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
