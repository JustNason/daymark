-- Extension pairing data is only accessed through server-side service-role
-- routes. RLS remains enabled and ownership scoped for defense in depth.
create table public.schoology_extension_pairing_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.schoology_extension_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz
);

alter table public.schoology_extension_pairing_codes enable row level security;
create policy schoology_pairing_owner on public.schoology_extension_pairing_codes
  for all using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
alter table public.schoology_extension_tokens enable row level security;
create policy schoology_extension_token_owner on public.schoology_extension_tokens
  for all using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create table public.extension_pair_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null,
  attempts integer not null default 1
);
alter table public.extension_pair_rate_limits enable row level security;

create or replace function public.consume_schoology_pairing_code(
  p_code_hash text,
  p_token_hash text,
  p_token_expires_at timestamptz
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare owner_id uuid;
begin
  update public.schoology_extension_pairing_codes
     set consumed_at = now()
   where code_hash = p_code_hash
     and consumed_at is null
     and expires_at > now()
   returning user_id into owner_id;
  if owner_id is null then return null; end if;

  insert into public.schoology_extension_tokens(user_id, token_hash, expires_at)
  values(owner_id, p_token_hash, p_token_expires_at);
  insert into public.external_integrations(user_id, provider, status, connected_at, last_error)
  values(owner_id, 'schoology', 'connected', now(), null, null)
  on conflict(user_id, provider) do update
    set status = 'connected', connected_at = now(), last_error = null;
  return owner_id;
end;
$$;

create or replace function public.allow_schoology_pair_attempt(p_key_hash text)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare row_value public.extension_pair_rate_limits%rowtype;
begin
  delete from public.extension_pair_rate_limits
   where window_started_at < now() - interval '1 hour';
  insert into public.extension_pair_rate_limits(key_hash, window_started_at, attempts)
  values(p_key_hash, now(), 1)
  on conflict(key_hash) do update
    set attempts = case
      when public.extension_pair_rate_limits.window_started_at < now() - interval '15 minutes' then 1
      else public.extension_pair_rate_limits.attempts + 1
    end,
    window_started_at = case
      when public.extension_pair_rate_limits.window_started_at < now() - interval '15 minutes' then now()
      else public.extension_pair_rate_limits.window_started_at
    end
  returning * into row_value;
  return row_value.attempts <= 10;
end;
$$;

revoke all on function public.consume_schoology_pairing_code(text,text,timestamptz) from public, anon, authenticated;
revoke all on function public.allow_schoology_pair_attempt(text) from public, anon, authenticated;
revoke all on public.schoology_extension_pairing_codes, public.schoology_extension_tokens, public.extension_pair_rate_limits from public, anon, authenticated;
grant execute on function public.consume_schoology_pairing_code(text,text,timestamptz) to service_role;
grant execute on function public.allow_schoology_pair_attempt(text) to service_role;
grant select, insert, update, delete on public.schoology_extension_pairing_codes, public.schoology_extension_tokens, public.extension_pair_rate_limits to service_role;

create index schoology_extension_tokens_owner_idx
  on public.schoology_extension_tokens(user_id, created_at desc);
create index schoology_pairing_codes_expiry_idx
  on public.schoology_extension_pairing_codes(expires_at)
  where consumed_at is null;
