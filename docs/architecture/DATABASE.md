# Database

PostgreSQL schema on Supabase. **The SQL migrations are the source of truth**
for everything in this document; when this file and
[`supabase/migrations/0001_daymark.sql`](../../supabase/migrations/0001_daymark.sql)
disagree, the migration wins and this file is stale — report it.

**Migration inventory (2026-11-17):** one migration, `0001_daymark.sql`
(205 lines), plus non-schema SQL in `supabase/cron/notifications.sql` (cron
job) and `supabase/tests/rls_isolation.sql` (manual test). There is no
`supabase/config.toml`; apply via the Supabase SQL editor (see
[DEPLOYMENT.md](../operations/DEPLOYMENT.md)).

## Entity overview

```mermaid
erDiagram
    auth_users ||--o| profiles : "id PK"
    auth_users ||--o| user_preferences : "user_id PK"
    auth_users ||--o| notification_preferences : "user_id PK"
    auth_users ||--o{ projects : "user_id"
    auth_users ||--o{ tasks : "user_id"
    projects ||--o{ tasks : "project_id (set null)"
    tasks ||--o{ subtasks : "cascade"
    tasks ||--o{ task_comments : "cascade"
    tasks ||--o{ task_tags : ""
    tags ||--o{ task_tags : ""
    courses ||--o{ tasks : "course_id (set null)"
    assignments ||--o{ tasks : "assignment_id (set null)"
    auth_users ||--o{ calendar_events : "user_id"
    projects ||--o{ calendar_events : "project_id (set null)"
    auth_users ||--o{ scheduled_work_sessions : "user_id, task_id"
    tasks ||--o{ scheduled_work_sessions : "cascade"
    external_integrations ||--o{ courses : "integration_id (set null)"
    external_integrations ||--o{ assignments : "integration_id (set null)"
    courses ||--o{ assignments : "course_id (set null)"
    auth_users ||--o{ external_integrations : "user_id, unique(provider)"
    external_integrations ||--o{ integration_sync_logs : "integration_id"
    auth_users ||--o{ notifications : "user_id"
    notifications ||--o{ notification_deliveries : "cascade, unique(channel)"
    auth_users ||--o{ push_subscriptions : "user_id"
    auth_users ||--o{ ai_conversations : "unused"
    ai_conversations ||--o{ ai_messages : "unused"
    auth_users ||--o{ ai_scheduling_proposals : "user_id"
```

## Tables (21)

All primary keys are UUID; every user-owned table has `user_id` →
`auth.users(id) ON DELETE CASCADE` (account deletion cascades).

| Group | Tables | Purpose |
| --- | --- | --- |
| Account | `profiles`, `user_preferences` | display name; timezone/theme/week-start/workday preferences |
| Work | `projects`, `tasks`, `subtasks`, `task_comments`, `tags`, `task_tags` | tasks have `status` (backlog/todo/in_progress/in_review/completed enums), `priority`, estimates, `source` (manual/assignment/ai) |
| Calendar | `calendar_events`, `scheduled_work_sessions` | events with timezone/recurrence fields; approved planner blocks (`status` planned/done/skipped) |
| Coursework | `courses`, `assignments` | sync flags on courses; assignments carry immutable `original_*` snapshots **and** independent `personal_*` overrides |
| Integrations | `external_integrations`, `integration_sync_logs` | per `(user_id, provider)` connection state + encrypted token blob + sync history |
| Notifications | `notification_preferences`, `notifications`, `notification_deliveries`, `push_subscriptions` | channel prefs, in-app history, per-channel delivery queue, web-push endpoints |
| AI | `ai_conversations`, `ai_messages`, `ai_scheduling_proposals` | **first two are dead schema** (never referenced in `src/`); proposals are written on approve/reject |

Column-level detail is intentionally not duplicated here — read the
migration (205 lines).

## Relationships and integrity design

- Ordinary FKs: `ON DELETE SET NULL` for optional links (task→project,
  task→course/assignment, integration→courses/assignments), `CASCADE` for
  owned children (subtasks, comments, deliveries, messages).
- **Composite ownership constraints (migration:142-165):** `UNIQUE(user_id, id)`
  on seven parent tables plus composite FKs such as
  `subtasks(user_id, task_id) → tasks(user_id, id)`. This makes it
  *impossible to attach a row to another user's parent* even if RLS were
  bypassed. Keep this pattern for every new parent/child pair.
- Notable columns: `scheduled_work_sessions.proposal_id` has **no FK**;
  `push_subscriptions.endpoint` is globally unique; `notifications.dedupe_key`
  unique per user; `calendar_events.external_id` unique per user.
- **No CHECK constraints** on `notification_deliveries.channel/status`,
  `notifications.kind`, or `external_integrations.status` (free-form text).

## Indexes (explicit)

| Index | Serves |
| --- | --- |
| `tasks(user_id, due_at) WHERE status <> 'completed'` | deadline queries |
| `tasks(user_id, status, updated_at DESC)` | board/list |
| `calendar_events(user_id, starts_at, ends_at)` | calendar ranges |
| `scheduled_work_sessions(user_id, starts_at, ends_at)` | planner ranges |
| `assignments(user_id, coalesce(personal_due_at, original_due_at))` | assignment due lists |
| `notifications(user_id, created_at DESC) WHERE read_at IS NULL` | unread badge |
| `notification_deliveries(status, scheduled_for) WHERE status IN ('queued','retry')` | cron claim |
| `integration_sync_logs(user_id, started_at DESC)` | sync history |

*Missing indexes identified by audit (recommendation backlog):*
`push_subscriptions(user_id)` (queried per delivery), `tasks(user_id,
assignment_id)` (queried per assignment during sync), `subtasks(task_id)`,
`task_comments(task_id)`.

## RLS and ownership

- RLS is enabled by a `DO` loop over a **20-table list** (migration:196-201)
  creating policy `owner_all`
  (`USING`/`WITH CHECK user_id = (select auth.uid())`), plus policy `profile_owner`
  on `profiles` (migration:202).
- **VERIFIED GAP — `profiles` RLS is not enabled.** The loop list omits
  `profiles` and no other statement enables RLS on it, so `profile_owner` is
  inert: any authenticated client can read/modify any user's `profiles` row
  through PostgREST. (The client compounds this by reading the profile with
  no owner filter, `src/app/app/page.tsx:3030`.) Fixing this requires a new
  migration — out of scope for the documentation task; tracked in
  [BACKLOG.md](../product/BACKLOG.md). **Never disable RLS to repair a
  client query; add new tables to the migration's ownership list before
  exposing them.**
- All policies are permissive with no `TO` clause; `auth.uid()` is NULL for
  `anon`, so anon sees nothing (subject to the profiles gap above).
- `supabase/tests/rls_isolation.sql` verifies cross-user read isolation on
  `projects` only (manual; nothing runs it automatically — see
  [TESTING.md](../development/TESTING.md)).

## Functions and triggers

| Object | Definition | Notes |
| --- | --- | --- |
| `claim_notification_deliveries(batch_size)` | `SECURITY DEFINER`, `search_path=''`, `FOR UPDATE SKIP LOCKED`, caps batch at 100, sets `processing` + `attempts+1` (migration:176-185) | **VERIFIED GAP:** no `REVOKE EXECUTE` (grants at :204-205 cover tables only); Postgres default grants EXECUTE to PUBLIC and Supabase exposes it over `/rpc/`. Exploitability depends on project defaults — verify live, then revoke to `service_role` only |
| `bootstrap_profile()` trigger | `AFTER INSERT ON auth.users` → creates `profiles`, `user_preferences`, `notification_preferences` (migration:187-194) | the only trigger |

No views exist in the schema.

## Dead or unused schema (verified 2026-11-17)

No code reference exists for: `tags`, `task_tags` (no UI), `ai_conversations`,
`ai_messages` (no chat surface); stored-but-unread columns: `in_app_enabled`,
`daily_summary`, `weekly_summary` (worker ignores them), `week_starts_on`
(UI saves it; all computations hardcode Monday), `tasks.completed_at`,
`tasks.recurrence`, `calendar_events.recurrence_rule/location/category`,
`projects.start_date/icon`, `user_preferences.date_format/time_format/
default_calendar_view`, `assignments.ignored_at`/`personal_completed`
(read but never settable). These are candidates for wiring up or removing —
see [BACKLOG.md](../product/BACKLOG.md).

## Secret material

`external_integrations.encrypted_credentials` contains only AES-256-GCM
ciphertext + nonce/tag envelope; `INTEGRATION_ENCRYPTION_KEY` must be a random
32-byte key. Rotating it requires a decrypt/re-encrypt migration while the
old key remains available. Never return this column in app API responses
(no route currently does — verified).

## Ownership

- Schema changes: migration-only, additive where possible, reviewed against
  this document in the same change (see [AGENTS.md](../../AGENTS.md)).
- The project owner approves any change to RLS policy structure, cascading
  deletes, or encryption handling.
