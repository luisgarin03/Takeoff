begin;
do $$ declare payload jsonb; begin
 perform set_config('request.jwt.claim.sub','','true');
 if public.otk_website_is_admin() then raise exception 'Anonymous caller became admin'; end if;
 begin
  perform public.otk_website_admin_data('',0);
  raise exception 'Unauthorized request was allowed';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001','true');
 if public.otk_website_is_admin() then raise exception 'Non-admin became admin'; end if;
 begin
  perform public.otk_website_admin_data('',0);
  raise exception 'Non-admin request was allowed';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub','ba46cc62-8212-493b-8cf5-2410ff6ed29e','true');
 if not public.otk_website_is_admin() then raise exception 'Owner access failed'; end if;
 payload := public.otk_website_admin_data('',0);
 if (payload->'stats'->>'users')::int < 1 then raise exception 'Live user count failed'; end if;
 if jsonb_array_length(payload->'users') > 50 then raise exception 'Pagination limit failed'; end if;
 payload := public.otk_website_admin_data('no-such-user-website-test-9f731',0);
 if (payload->>'total')::int <> 0 then raise exception 'Search filter failed'; end if;
 if has_table_privilege('authenticated','public.otk_website_admins','INSERT') then raise exception 'Allowlist is browser editable'; end if;
 if has_function_privilege('anon','public.otk_website_admin_data(text,integer)','EXECUTE') then raise exception 'Anonymous execute granted'; end if;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
do $$ begin
 if public.otk_website_is_admin() then raise exception 'Role access check failed'; end if;
 begin
  perform public.otk_website_admin_data('',0);
  raise exception 'Authenticated non-admin was allowed';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
