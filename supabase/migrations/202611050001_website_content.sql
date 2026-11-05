begin;

create table if not exists public.otk_website_content (
  id text primary key check (id = 'published'),
  content jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  constraint otk_website_content_size check (pg_column_size(content) <= 2097152)
);
alter table public.otk_website_content enable row level security;
revoke all on public.otk_website_content from public;
grant select on public.otk_website_content to anon, authenticated;
grant insert, update on public.otk_website_content to authenticated;

create policy "Published website content is public" on public.otk_website_content
  for select to anon, authenticated using (id = 'published');
create policy "Website admins publish content" on public.otk_website_content
  for insert to authenticated with check (id = 'published' and public.otk_website_is_admin() and updated_by = auth.uid());
create policy "Website admins update content" on public.otk_website_content
  for update to authenticated using (id = 'published' and public.otk_website_is_admin())
  with check (id = 'published' and public.otk_website_is_admin() and updated_by = auth.uid());

update storage.buckets
set allowed_mime_types = array['image/png','image/jpeg','image/webp','image/gif','image/svg+xml']
where id = 'website-media';
create policy "Website admins upload content images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'website-media' and name like 'content/%' and public.otk_website_is_admin());

create or replace function public.otk_website_admin_data(p_search text default '', p_page integer default 0)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
 if not public.otk_website_is_admin() then
  raise exception 'Administrator access required' using errcode='42501';
 end if;
 if p_page is null or p_page < 0 or p_page > 100000 or p_search is null or length(p_search)>200 then
  raise exception 'Invalid pagination or search';
 end if;
 select jsonb_build_object(
  'stats',jsonb_build_object(
   'users',(select count(*) from auth.users),
   'subscriptions',(select count(*) from public.otk_subscriptions where status in ('active','trialing','grace') and (current_period_end is null or current_period_end>now())),
   'trials',(select count(*) from public.otk_user_trials where ends_at>now())
  ),
  'total',(select count(*) from auth.users u left join public.otk_profiles p on p.id=u.id
   where position(lower(p_search) in lower(coalesce(u.email,'')||' '||coalesce(p.display_name,'')))>0),
  'users',coalesce((select jsonb_agg(to_jsonb(rows)) from (
   select u.id,u.email,coalesce(nullif(p.display_name,''),u.raw_user_meta_data->>'name','') as display_name,
    u.created_at,u.last_sign_in_at,s.status as subscription_status,s.plan_id,s.provider,s.current_period_end,
    t.started_at as trial_started_at,t.ends_at as trial_ends_at
   from auth.users u left join public.otk_profiles p on p.id=u.id
   left join public.otk_subscriptions s on s.user_id=u.id
   left join public.otk_user_trials t on t.user_id=u.id
   where position(lower(p_search) in lower(coalesce(u.email,'')||' '||coalesce(p.display_name,'')))>0
   order by u.created_at desc,u.id limit 50 offset p_page*50
  ) rows),'[]'::jsonb)
 ) into result;
 return result;
end;
$$;
revoke all on function public.otk_website_admin_data(text,integer) from public, anon;
grant execute on function public.otk_website_admin_data(text,integer) to authenticated;

notify pgrst, 'reload schema';
commit;
