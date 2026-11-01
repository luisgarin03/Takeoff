-- Grant existing accounts without a subscription their first 30-day trial.
-- Never renew or extend a trial that already exists.
insert into public.otk_user_trials(user_id, started_at, ends_at)
select users.id, now(), now() + interval '30 days'
from auth.users as users
where not exists (
  select 1 from public.otk_subscriptions as subscriptions
  where subscriptions.user_id = users.id
    and (subscriptions.status in ('active', 'trialing', 'grace')
      or (subscriptions.status in ('canceled', 'billing_issue')
        and subscriptions.current_period_end > now()))
)
on conflict(user_id) do nothing;
