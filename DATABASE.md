# Database

Apply migrations in order from `supabase/migrations/`. `0001_daymark.sql` creates the initial schema.

## Tables

- `profiles`, `user_preferences`: account-facing name and display/calendar preferences.
- `projects`, `tasks`, `subtasks`, `tags`, `task_tags`: user work organization and status.
- `calendar_events`, `scheduled_work_sessions`: external commitments and approved focused-work blocks.
- `external_integrations`, `integration_sync_logs`, `courses`, `assignments`: provider connection state, synchronization history, course sections, and source/personal assignment fields.
- `notification_preferences`, `notifications`, `notification_deliveries`, `push_subscriptions`: channel preferences, in-app history, queued deliveries, and browser endpoints.
- `ai_conversations`, `ai_messages`, `ai_scheduling_proposals`: user-owned planning history and approval records.

All primary keys are UUIDs. User-owned records use `user_id` with cascading deletion from `auth.users`; dependent records cascade from their owner. Integrations use `(user_id, provider)` uniqueness, and imported coursework uses source identifiers to avoid duplicate sync records. Calendar ranges are stored as `timestamptz` with a timezone field for display and recurrence interpretation.

## RLS

RLS is enabled on every public user-owned table. Policies use the authenticated user ID for both reads/writes and inserts/updates. `profiles` uses its primary key as the ownership column. Never disable RLS to repair a client query. Add new tables to the migration's ownership policy list before exposing them.

## Indexes

Indexes cover task status/due date, event and work-session time windows, assignment due dates, unread notifications, queued delivery due time, and integration sync history. Keep date-range queries bounded.

## Secret material

`external_integrations.encrypted_credentials` contains only AES-GCM ciphertext and nonce/tag envelope; `INTEGRATION_ENCRYPTION_KEY` must be a random 32-byte key. Rotating it requires decrypt/re-encrypt migration while the old key remains available. Never return this column in app API responses.
