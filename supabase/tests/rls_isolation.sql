-- Disposable Supabase database only. Run after applying every migration.
-- Execute as postgres (for example, the SQL editor's postgres role): the test
-- inserts synthetic Auth users, checks ACL metadata, then SET ROLE authenticated.
-- The transaction rolls back all users and records, including trigger output.
begin;

do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass) then
    raise exception 'profiles RLS is disabled';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'profile_owner' and cmd = 'ALL'
      and qual like '%auth.uid()%' and with_check like '%auth.uid()%'
  ) then
    raise exception 'profile_owner policy is missing or does not enforce auth.uid() for reads and writes';
  end if;
end $$;

do $$
declare
  fn_oid oid := 'public.claim_notification_deliveries(integer)'::regprocedure;
begin
  if has_function_privilege('anon', fn_oid, 'EXECUTE') then
    raise exception 'anon can execute claim_notification_deliveries(integer)';
  end if;
  if has_function_privilege('authenticated', fn_oid, 'EXECUTE') then
    raise exception 'authenticated can execute claim_notification_deliveries(integer)';
  end if;
  if not has_function_privilege('service_role', fn_oid, 'EXECUTE') then
    raise exception 'service_role cannot execute claim_notification_deliveries(integer)';
  end if;
  if exists (
    select 1
    from pg_proc p,
      lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl
    where p.oid = fn_oid and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'PUBLIC retains EXECUTE on claim_notification_deliveries(integer)';
  end if;
end $$;

insert into auth.users(id, aud, role, email, encrypted_password, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'rls-a@example.invalid', '', '{"full_name":"RLS User A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'rls-b@example.invalid', '', '{"full_name":"RLS User B"}', now(), now())
on conflict (id) do nothing;

insert into public.projects(id, user_id, name) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'A project'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'B project')
on conflict (id) do nothing;
insert into public.tasks(id, user_id, title, project_id) values
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'A task', '10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'B task', '10000000-0000-0000-0000-000000000002')
on conflict (id) do nothing;
insert into public.subtasks(id, task_id, user_id, title) values
  ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'A child'),
  ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'B child')
on conflict (id) do nothing;

-- Prove the Auth insert trigger still bootstraps both profiles before testing
-- requests under the authenticated role.
do $$
begin
  if (select count(*) from public.profiles where id in (
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002'
  )) <> 2 then
    raise exception 'bootstrap_profile did not create both test profiles';
  end if;
end $$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
set local role authenticated;

do $$
declare
  affected integer;
begin
  if (select count(*) from public.profiles) <> 1
     or not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'User A profile SELECT did not return exactly User A''s row';
  end if;
  if exists (select 1 from public.profiles where id = '00000000-0000-0000-0000-000000000002') then
    raise exception 'User A can SELECT User B profile';
  end if;

  update public.profiles set display_name = 'User A updated' where id = auth.uid();
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'User A cannot UPDATE own profile'; end if;

  update public.profiles set display_name = 'Unauthorized change'
    where id = '00000000-0000-0000-0000-000000000002';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'User A updated User B profile (% rows)', affected; end if;

  begin
    insert into public.profiles(id, display_name)
    values ('00000000-0000-0000-0000-000000000002', 'Impersonated');
    raise exception 'User A inserted a profile with User B identity';
  exception when insufficient_privilege then
    null; -- Expected RLS WITH CHECK rejection (SQLSTATE 42501).
  end;

  delete from public.profiles where id = '00000000-0000-0000-0000-000000000002';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'User A deleted User B profile (% rows)', affected; end if;

  if (select count(*) from public.projects) <> 1
     or exists (select 1 from public.projects where user_id <> auth.uid()) then
    raise exception 'Cross-user project SELECT isolation failed';
  end if;
  if (select count(*) from public.subtasks) <> 1
     or exists (select 1 from public.subtasks where user_id <> auth.uid()) then
    raise exception 'Cross-user child-table SELECT isolation failed';
  end if;

  begin
    insert into public.subtasks(user_id, task_id, title)
    values (auth.uid(), '20000000-0000-0000-0000-000000000002', 'Cross-owner attach');
    raise exception 'Composite ownership constraint allowed a cross-user child attach';
  exception when foreign_key_violation then
    null; -- Expected composite FK rejection, not a weakened constraint.
  end;
end $$;

rollback;
