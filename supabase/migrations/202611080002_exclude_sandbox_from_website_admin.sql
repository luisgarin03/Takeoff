-- Exclude sandbox subscriptions from live admin reporting.
CREATE OR REPLACE FUNCTION public.otk_website_admin_data(p_search text DEFAULT ''::text, p_page integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
   'subscriptions',(select count(*) from public.otk_subscriptions where environment is distinct from 'sandbox' and status in ('active','trialing','grace') and (current_period_end is null or current_period_end>now())),
   'trials',(select count(*) from public.otk_user_trials where ends_at>now())
  ),
  'total',(select count(*) from auth.users u left join public.otk_profiles p on p.id=u.id
   where position(lower(p_search) in lower(coalesce(u.email,'')||' '||coalesce(p.display_name,'')))>0),
  'users',coalesce((select jsonb_agg(to_jsonb(rows)) from (
   select u.id,u.email,coalesce(nullif(p.display_name,''),u.raw_user_meta_data->>'name','') as display_name,
    u.created_at,u.last_sign_in_at,s.status as subscription_status,s.plan_id,s.provider,s.current_period_end,
    t.started_at as trial_started_at,t.ends_at as trial_ends_at
   from auth.users u left join public.otk_profiles p on p.id=u.id
   left join public.otk_subscriptions s on s.user_id=u.id and s.environment is distinct from 'sandbox'
   left join public.otk_user_trials t on t.user_id=u.id
   where position(lower(p_search) in lower(coalesce(u.email,'')||' '||coalesce(p.display_name,'')))>0
   order by u.created_at desc,u.id limit 50 offset p_page*50
  ) rows),'[]'::jsonb)
 ) into result;
 return result;
end;
$function$;
