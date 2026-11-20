-- Enable the existing owner policy on profiles and restrict the privileged
-- notification queue worker RPC to the service role.
alter table public.profiles enable row level security;

revoke all on function public.claim_notification_deliveries(integer)
  from public, anon, authenticated;
grant execute on function public.claim_notification_deliveries(integer)
  to service_role;
