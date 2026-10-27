-- Only the authenticated server function manages connection metadata.
-- Browser roles retain their existing owner-only SELECT policy.
grant select, insert, update on public.google_connections to service_role;
