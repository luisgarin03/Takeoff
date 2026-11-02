-- Website administration: additive, read-only access to existing application data.
begin;
create table if not exists public.otk_website_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.otk_website_admins enable row level security;
revoke all on public.otk_website_admins from public, anon, authenticated;
-- Membership is managed only by a database administrator, never by browser metadata.
insert into public.otk_website_admins(user_id)
select id from auth.users where id = 'ba46cc62-8212-493b-8cf5-2410ff6ed29e'
and email_confirmed_at is not null on conflict do nothing;

create or replace function public.otk_website_is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists (
  select 1 from public.otk_website_admins a join auth.users u on u.id=a.user_id
  where a.user_id=auth.uid() and u.email_confirmed_at is not null
  and (u.banned_until is null or u.banned_until < now())
 );
$$;
revoke all on function public.otk_website_is_admin() from public, anon;
grant execute on function public.otk_website_is_admin() to authenticated;

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
   'trials',(select count(*) from public.otk_user_trials where ends_at>now()),
   'projects',(select count(*) from public.otk_projects where deleted_at is null)
  ),
  'total',(select count(*) from auth.users u left join public.otk_profiles p on p.id=u.id
   where position(lower(p_search) in lower(coalesce(u.email,'')||' '||coalesce(p.display_name,'')))>0),
  'users',coalesce((select jsonb_agg(to_jsonb(rows)) from (
   select u.id,u.email,coalesce(nullif(p.display_name,''),u.raw_user_meta_data->>'name','') as display_name,
    u.created_at,u.last_sign_in_at,s.status as subscription_status,s.plan_id,s.provider,s.current_period_end,
    t.started_at as trial_started_at,t.ends_at as trial_ends_at,
    (select count(*) from public.otk_projects j where j.owner_id=u.id and j.deleted_at is null) as projects
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
