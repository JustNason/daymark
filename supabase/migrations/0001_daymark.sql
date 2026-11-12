create extension if not exists pgcrypto;

create type public.task_status as enum ('backlog','todo','in_progress','in_review','completed');
create type public.task_priority as enum ('low','medium','high','urgent');
create type public.integration_provider as enum ('schoology','discord');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '', avatar_url text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  timezone text not null default 'UTC', theme text not null default 'dark' check (theme in ('dark','light','system')),
  week_starts_on smallint not null default 1 check (week_starts_on between 0 and 6),
  date_format text not null default 'MMM d, yyyy', time_format text not null default '12h',
  workday_start time not null default '09:00', workday_end time not null default '17:00',
  default_calendar_view text not null default 'week', updated_at timestamptz not null default now()
);
create table public.projects (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, description text not null default '', color text not null default '#6e78ff', icon text not null default 'folder',
  status text not null default 'active' check(status in ('active','completed','archived')),
  start_date date, target_date date, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.tasks (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check(length(trim(title)) between 1 and 300), description text not null default '',
  status public.task_status not null default 'todo', priority public.task_priority not null default 'medium',
  project_id uuid references public.projects(id) on delete set null,
  course_id uuid, assignment_id uuid, category text, start_at timestamptz, due_at timestamptz,
  estimated_minutes integer check(estimated_minutes is null or estimated_minutes > 0), actual_minutes integer,
  recurrence text, source text not null default 'manual' check(source in ('manual','assignment','ai')),
  completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.subtasks (
  id uuid primary key default gen_random_uuid(), task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, title text not null, is_completed boolean not null default false,
  position integer not null default 0, created_at timestamptz not null default now()
);
create table public.task_comments (
  id uuid primary key default gen_random_uuid(), task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, body text not null check(length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.tags (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null, color text not null default '#8585a5', unique(user_id,name)
);
create table public.task_tags (
  task_id uuid not null references public.tasks(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key(task_id,tag_id)
);
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  title text not null, description text not null default '', location text, category text not null default 'event',
  color text not null default '#6e78ff', starts_at timestamptz not null, ends_at timestamptz not null,
  timezone text not null default 'UTC', recurrence_rule text, project_id uuid references public.projects(id) on delete set null,
  course_id uuid, reminder_minutes integer[], external_id text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(ends_at > starts_at), unique(user_id, external_id)
);
create table public.scheduled_work_sessions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  starts_at timestamptz not null, ends_at timestamptz not null, status text not null default 'planned' check(status in ('planned','done','skipped')),
  proposal_id uuid, created_at timestamptz not null default now(), check(ends_at > starts_at)
);
create table public.courses (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid, external_id text, section_external_id text, name text not null,
  selected boolean not null default false, auto_import boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,external_id,section_external_id)
);
create table public.assignments (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null, integration_id uuid,
  external_id text, title text not null, description text not null default '', url text,
  original_due_at timestamptz, original_available_at timestamptz, original_max_points numeric, original_completed boolean,
  personal_title text, personal_description text, personal_due_at timestamptz, personal_completed boolean,
  ignored_at timestamptz, imported_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(user_id,integration_id,external_id)
);
alter table public.tasks add constraint tasks_course_fk foreign key(course_id) references public.courses(id) on delete set null;
alter table public.tasks add constraint tasks_assignment_fk foreign key(assignment_id) references public.assignments(id) on delete set null;
alter table public.calendar_events add constraint events_course_fk foreign key(course_id) references public.courses(id) on delete set null;
create table public.external_integrations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  provider public.integration_provider not null, status text not null default 'disconnected',
  encrypted_credentials text, connected_at timestamptz, last_synced_at timestamptz, last_error text,
  created_at timestamptz not null default now(), unique(user_id,provider)
);
alter table public.courses add constraint courses_integration_fk foreign key(integration_id) references public.external_integrations(id) on delete set null;
alter table public.assignments add constraint assignments_integration_fk foreign key(integration_id) references public.external_integrations(id) on delete set null;
create table public.integration_sync_logs (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  integration_id uuid references public.external_integrations(id) on delete set null,
  status text not null, items_seen integer not null default 0, items_changed integer not null default 0,
  message text, started_at timestamptz not null default now(), finished_at timestamptz
);
create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  in_app_enabled boolean not null default true, push_enabled boolean not null default false,
  discord_enabled boolean not null default false, email_enabled boolean not null default false,
  discord_user_id text,
  reminder_minutes integer[] not null default array[1440,120], quiet_start time, quiet_end time,
  daily_summary boolean not null default false, weekly_summary boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null, title text not null, body text not null default '', target_url text,
  read_at timestamptz, dedupe_key text, created_at timestamptz not null default now(), unique(user_id,dedupe_key)
);
create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(), notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, channel text not null,
  status text not null default 'queued', attempts integer not null default 0, scheduled_for timestamptz not null,
  sent_at timestamptz, last_error text, unique(notification_id,channel)
);
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique, p256dh text not null, auth_secret text not null, created_at timestamptz not null default now()
);
create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Planning session', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.ai_messages (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, role text not null check(role in ('user','assistant','tool')),
  content text not null, created_at timestamptz not null default now()
);
create table public.ai_scheduling_proposals (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade, status text not null default 'pending' check(status in ('pending','accepted','rejected','expired')),
  proposal jsonb not null, created_at timestamptz not null default now(), decided_at timestamptz
);

-- Composite ownership constraints prevent a valid UUID belonging to another user from being attached.
alter table public.projects add constraint projects_owner_id_unique unique(user_id,id);
alter table public.tasks add constraint tasks_owner_id_unique unique(user_id,id);
alter table public.courses add constraint courses_owner_id_unique unique(user_id,id);
alter table public.assignments add constraint assignments_owner_id_unique unique(user_id,id);
alter table public.external_integrations add constraint integrations_owner_id_unique unique(user_id,id);
alter table public.notifications add constraint notifications_owner_id_unique unique(user_id,id);
alter table public.ai_conversations add constraint conversations_owner_id_unique unique(user_id,id);
alter table public.subtasks add constraint subtasks_task_owner_fk foreign key(user_id,task_id) references public.tasks(user_id,id) on delete cascade;
alter table public.task_comments add constraint task_comments_task_owner_fk foreign key(user_id,task_id) references public.tasks(user_id,id) on delete cascade;
alter table public.task_tags add constraint task_tags_task_owner_fk foreign key(user_id,task_id) references public.tasks(user_id,id) on delete cascade;
alter table public.tags add constraint tags_owner_id_unique unique(user_id,id);
alter table public.task_tags add constraint task_tags_tag_owner_fk foreign key(user_id,tag_id) references public.tags(user_id,id) on delete cascade;
alter table public.tasks add constraint tasks_project_owner_fk foreign key(user_id,project_id) references public.projects(user_id,id) on delete no action;
alter table public.tasks add constraint tasks_course_owner_fk foreign key(user_id,course_id) references public.courses(user_id,id) on delete no action;
alter table public.tasks add constraint tasks_assignment_owner_fk foreign key(user_id,assignment_id) references public.assignments(user_id,id) on delete no action;
alter table public.calendar_events add constraint events_project_owner_fk foreign key(user_id,project_id) references public.projects(user_id,id) on delete no action;
alter table public.calendar_events add constraint events_course_owner_fk foreign key(user_id,course_id) references public.courses(user_id,id) on delete no action;
alter table public.scheduled_work_sessions add constraint sessions_task_owner_fk foreign key(user_id,task_id) references public.tasks(user_id,id) on delete cascade;
alter table public.courses add constraint courses_integration_owner_fk foreign key(user_id,integration_id) references public.external_integrations(user_id,id) on delete no action;
alter table public.assignments add constraint assignments_course_owner_fk foreign key(user_id,course_id) references public.courses(user_id,id) on delete no action;
alter table public.assignments add constraint assignments_integration_owner_fk foreign key(user_id,integration_id) references public.external_integrations(user_id,id) on delete no action;
alter table public.notification_deliveries add constraint deliveries_notification_owner_fk foreign key(user_id,notification_id) references public.notifications(user_id,id) on delete cascade;
alter table public.ai_messages add constraint messages_conversation_owner_fk foreign key(user_id,conversation_id) references public.ai_conversations(user_id,id) on delete cascade;

create index tasks_user_due_idx on public.tasks(user_id,due_at) where status <> 'completed';
create index tasks_user_status_idx on public.tasks(user_id,status,updated_at desc);
create index events_user_range_idx on public.calendar_events(user_id,starts_at,ends_at);
create index sessions_user_range_idx on public.scheduled_work_sessions(user_id,starts_at,ends_at);
create index assignments_user_due_idx on public.assignments(user_id,coalesce(personal_due_at,original_due_at));
create index notifications_unread_idx on public.notifications(user_id,created_at desc) where read_at is null;
create index delivery_due_idx on public.notification_deliveries(status,scheduled_for) where status in ('queued','retry');
create index sync_logs_user_started_idx on public.integration_sync_logs(user_id,started_at desc);

create or replace function public.claim_notification_deliveries(batch_size integer default 40)
returns setof public.notification_deliveries language sql security definer set search_path = '' as $$
  with picked as (
    select id from public.notification_deliveries
    where status in ('queued','retry') and scheduled_for <= now()
    order by scheduled_for for update skip locked limit greatest(1,least(batch_size,100))
  )
  update public.notification_deliveries d set status='processing', attempts=attempts+1
  from picked where d.id=picked.id returning d.*;
$$;

create function public.bootstrap_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id,display_name) values(new.id, coalesce(new.raw_user_meta_data ->> 'full_name','')) on conflict do nothing;
  insert into public.user_preferences(user_id) values(new.id) on conflict do nothing;
  insert into public.notification_preferences(user_id) values(new.id) on conflict do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.bootstrap_profile();

do $$ declare t text; begin
  foreach t in array array['user_preferences','projects','tasks','subtasks','task_comments','tags','task_tags','calendar_events','scheduled_work_sessions','courses','assignments','external_integrations','integration_sync_logs','notification_preferences','notifications','notification_deliveries','push_subscriptions','ai_conversations','ai_messages','ai_scheduling_proposals'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy owner_all on public.%I for all using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',t);
  end loop;
end $$;
create policy profile_owner on public.profiles for all using(id=(select auth.uid())) with check(id=(select auth.uid()));

grant usage on schema public to authenticated;
grant select,insert,update,delete on all tables in schema public to authenticated;
