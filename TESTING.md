# Testing

## Commands

`npm run typecheck`, `npm test`, `npm run build`, and `npm run test:e2e`.

## Required coverage

- Unit: scheduling order, working-hour bounds, conflict avoidance, split sessions, daylight-saving and timezone boundaries, recurrence/date helpers, and Zod input validation.
- Integration: account lifecycle, task/project/calendar persistence, RLS isolation across two users, assignment sync idempotency and personal override preservation, proposal acceptance/rejection, and notification retry/deduplication.
- End-to-end: register/login, task create/edit/complete/delete, board status move, event create/reschedule, project creation, assignment import, notification preference changes, proposal accept/reject, settings persistence, mobile layout, and logout/relogin.
- Provider tests: run only with explicitly configured Schoology/Discord/email/push accounts; otherwise use deterministic mocks and report live verification as pending.

Never mark an integration live-tested from a mocked test. Preserve sanitized test logs and record date/provider/environment.
