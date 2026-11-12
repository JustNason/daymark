-- Run after the migration in a disposable Supabase test project.
-- Creates two Auth identities, then verifies the signed-in JWT can only read its own project.
begin;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
insert into auth.users(id,aud,role,email,encrypted_password,created_at,updated_at)
values ('00000000-0000-0000-0000-000000000001','authenticated','authenticated','rls-a@example.invalid','',now(),now()),
       ('00000000-0000-0000-0000-000000000002','authenticated','authenticated','rls-b@example.invalid','',now(),now())
on conflict(id) do nothing;
insert into public.projects(id,user_id,name) values
('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','A project'),
('10000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','B project')
on conflict(id) do nothing;
set local role authenticated;
do $$ begin
  if (select count(*) from public.projects) <> 1 then raise exception 'RLS read isolation failed'; end if;
  if exists(select 1 from public.projects where user_id <> auth.uid()) then raise exception 'RLS leaked another user row'; end if;
end $$;
rollback;
