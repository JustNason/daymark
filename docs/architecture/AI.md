# Contextual AI

Daymark provides suggestions inside existing workflows. The deterministic
scheduler remains authoritative, and AI suggestions never write to tasks,
subtasks, coursework, or calendar data. Users review and explicitly accept any
proposed fields or steps in the workspace UI.

## Provider behavior

- `AI_BASE_URL` and `AI_MODEL` enable an optional OpenAI-compatible
  `/chat/completions` endpoint. `AI_API_KEY` is optional for local endpoints
  and remains server-only.
- Local Ollama may be used during development. A localhost URL is treated as
  unconfigured on Vercel because a serverless function cannot reach a
  developer's computer. Non-local endpoints must use HTTPS.
- No provider credentials means the feature returns deterministic suggestions
  where possible, or an honest unavailable state. No paid provider is enabled
  by default.
- Model requests are sent only when the user explicitly opts in from the
  current workflow. The UI explains that submitted task/coursework text may be
  sent to the configured endpoint. Without that opt-in, the API does not call
  a model even when configured.

## Features

`POST /api/ai/context` accepts one of `quick_add`, `breakdown`, `explain`,
`next_action`, or `coursework_steps`. It returns a validated suggestion and
the provider used. Deterministic quick-add parsing recognizes common relative
dates, weekday names, 24-hour ISO dates, local times, and priority phrases;
requested durations in minutes or hours; unrecognized dates stay unset. Task breakdown and coursework steps use
deterministic generic guidance when no provider is used. The Today next-action
hint ranks incomplete tasks by deadline and priority, then favors tasks whose
estimated duration fits the largest remaining gap in the user's workday after
calendar events and planned work sessions. A model can only improve a
next-action explanation. Plan explanations through `POST /api/ai/plan` never
affect the deterministic slot output.

Every request is authenticated with the user's session. Inputs and outputs
have schema and size limits, model calls have a short timeout, malformed model
responses fall back to deterministic results, and a per-user in-memory cap
allows 12 requests per hour per running server instance. That cap is
best-effort in serverless deployments because instances do not share memory;
provider calls are also bounded by explicit opt-in, input size, and output
size. These endpoints do not persist AI conversations or suggestions.

## Privacy and safety

The route sends only the context supplied for the selected feature. For
example, quick add sends its single text input, coursework assistance sends
only the selected assignment fields, and schedule explanation sends the
deterministic plan excerpt. Unrelated assignments and conversations are not
queried or included. Provider output is parsed as JSON, validated with Zod,
and discarded on any mismatch. Quick Add keeps due date, priority, and
estimated duration from the deterministic parser even when a model is enabled,
so the model cannot invent a deadline or override parsed task facts. AI has no
database write path.

## Verification

Automated unit tests cover deterministic date/priority parsing, next-action
selection, step fallback, missing provider configuration, unreachable local
Ollama on Vercel, provider failures, and malformed or non-string model output.
No live model provider is configured or verified by these tests.
