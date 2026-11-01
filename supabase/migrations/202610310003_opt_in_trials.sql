-- New accounts explicitly start their trial; existing trial dates stay intact.
drop trigger if exists otk_new_user_trial on auth.users;
grant insert on public.otk_user_trials to service_role;
