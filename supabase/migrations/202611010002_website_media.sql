begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('website-media','website-media',true,10485760,array['image/png','image/jpeg','image/webp'])
on conflict(id) do nothing;
create policy "Website media public read" on storage.objects for select to anon,authenticated using(bucket_id='website-media');
create policy "Website admins insert media" on storage.objects for insert to authenticated with check(bucket_id='website-media' and name='homepage' and public.otk_website_is_admin());
create policy "Website admins update media" on storage.objects for update to authenticated using(bucket_id='website-media' and name='homepage' and public.otk_website_is_admin()) with check(bucket_id='website-media' and name='homepage' and public.otk_website_is_admin());
commit;
