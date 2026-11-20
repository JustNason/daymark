-- Add indexes identified by the query-path audit. All are additive and safe
-- for existing rows; concurrently is intentionally omitted because Supabase
-- SQL Editor may execute this file in a transaction.
CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON public.push_subscriptions (user_id);

CREATE INDEX IF NOT EXISTS tasks_user_assignment_idx
  ON public.tasks (user_id, assignment_id)
  WHERE assignment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS subtasks_task_id_idx
  ON public.subtasks (task_id);

CREATE INDEX IF NOT EXISTS task_comments_task_id_idx
  ON public.task_comments (task_id);
