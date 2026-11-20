-- Browser extension device flow. The extension keeps both polling and API
-- secrets locally; only their hashes are stored by Daymark.
create table public.schoology_extension_flows (
  flow_hash text primary key,
  poll_token_hash text not null,
  extension_token_hash text not null unique,
  user_id uuid references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  approved_at timestamptz
);

alter table public.schoology_extension_flows enable row level security;
revoke all on public.schoology_extension_flows from public, anon, authenticated;
grant select, insert, update, delete on public.schoology_extension_flows to service_role;

create index schoology_extension_flows_expiry_idx
  on public.schoology_extension_flows(expires_at);

create or replace function public.authorize_schoology_extension_flow(
  p_flow_hash text,
  p_user_id uuid,
  p_token_expires_at timestamptz
) returns boolean
language plpgsql security definer set search_path = '' as $$
declare flow_row public.schoology_extension_flows%rowtype;
begin
  select * into flow_row
    from public.schoology_extension_flows
   where flow_hash = p_flow_hash
   for update;
  if not found or flow_row.expires_at <= now() then return false; end if;

  -- Make a retry by the same signed-in user safe after a lost HTTP response.
  if flow_row.status = 'approved' then
    return flow_row.user_id = p_user_id;
  end if;
  if flow_row.status <> 'pending' then return false; end if;

  update public.schoology_extension_flows
     set user_id = p_user_id, status = 'approved', approved_at = now()
   where flow_hash = p_flow_hash;

  insert into public.schoology_extension_tokens(user_id, token_hash, expires_at)
  values(p_user_id, flow_row.extension_token_hash, p_token_expires_at);

  insert into public.external_integrations(user_id, provider, status, connected_at, last_error)
  values(p_user_id, 'schoology', 'connected', now(), null)
  on conflict(user_id, provider) do update
    set status = 'connected', connected_at = now(), last_error = null;
  return true;
end;
$$;

revoke all on function public.authorize_schoology_extension_flow(text, uuid, timestamptz)
  from public, anon, authenticated;
grant execute on function public.authorize_schoology_extension_flow(text, uuid, timestamptz)
  to service_role;
