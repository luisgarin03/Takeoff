-- Trials belong to accounts, never to browser storage or editable profiles.
create table public.otk_user_trials (
  user_id uuid primary key references auth.users(id) on delete cascade,
  started_at timestamptz not null,
  ends_at timestamptz not null,
  check (ends_at = started_at + interval '30 days')
);
alter table public.otk_user_trials enable row level security;
revoke all on public.otk_user_trials from public, anon, authenticated;
grant select on public.otk_user_trials to service_role;

create function public.otk_start_new_user_trial()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.otk_user_trials(user_id, started_at, ends_at)
  values(new.id, new.created_at, new.created_at + interval '30 days')
  on conflict(user_id) do nothing;
  return new;
end;
$$;
revoke all on function public.otk_start_new_user_trial() from public, anon, authenticated;
-- New signups only: existing accounts and paid subscriptions are unchanged.
create trigger otk_new_user_trial after insert on auth.users
for each row execute function public.otk_start_new_user_trial();
