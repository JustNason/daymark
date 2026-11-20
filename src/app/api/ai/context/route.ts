import { NextResponse } from "next/server";
import { requireUser } from "@/lib/require-user";
import {
  contextInputSchema,
  constrainQuickAddSuggestion,
  deterministicSuggestion,
  suggestionSchemas,
} from "@/lib/ai/context";
import { getAIProvider, requestStructuredSuggestion } from "@/lib/ai/provider";
import { consumeAIRequest } from "@/lib/ai/rate-limit";

const promptFor = (feature: string) => {
  switch (feature) {
    case "quick_add":
      return "Turn the user's short request into a proposed task. Preserve the intended meaning. Return title, description, ISO 8601 dueAt or null, priority (low/medium/high/urgent), and estimatedMinutes (15..1440). Never invent an exact deadline if none is present; use null. This is a proposal only.";
    case "breakdown":
      return "Suggest 3 to 6 concise, actionable subtasks for the single task provided. Do not add unrelated tasks or dates.";
    case "coursework_steps":
      return "Suggest 3 to 6 manageable steps for the one coursework assignment provided. Use only its supplied title, description, and due date. Do not infer or expose other coursework.";
    case "explain":
      return "Explain the supplied deterministic schedule in 1 to 3 sentences. Refer only to supplied tasks and slots. Do not add commitments, alter dates, or imply that data has been saved.";
    default:
      return "Explain why the selected task is a reasonable next action using only its supplied priority and due date. Preserve taskId and title exactly. Return a short reason.";
  }
};

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const rawBody = await request.text();
  if (rawBody.length > 20_000) {
    return NextResponse.json(
      { error: "AI request is too large" },
      { status: 413 },
    );
  }
  if (!consumeAIRequest(auth.user.id)) {
    return NextResponse.json(
      { error: "AI suggestion limit reached. Try again later." },
      { status: 429 },
    );
  }
  const parsed = contextInputSchema.safeParse(
    (() => {
      try {
        return JSON.parse(rawBody);
      } catch {
        return null;
      }
    })(),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid AI suggestion request" },
      { status: 400 },
    );
  const payload = parsed.data;
  if (payload.feature === "quick_add" && payload.input.timezone) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: payload.input.timezone });
    } catch {
      return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
    }
  }

  const baseSuggestion = deterministicSuggestion(payload);
  const provider = getAIProvider();
  const optedIn =
    "allowExternalProvider" in payload.input &&
    payload.input.allowExternalProvider === true;
  if (!baseSuggestion || !optedIn || !provider.configured) {
    return NextResponse.json({
      feature: payload.feature,
      configured: provider.configured,
      provider: "deterministic",
      suggestion: baseSuggestion,
    });
  }

  const outputSchema = suggestionSchemas[payload.feature];
  const result = await requestStructuredSuggestion(
    promptFor(payload.feature),
    payload.input,
    outputSchema,
  );
  if (!result) {
    return NextResponse.json({
      feature: payload.feature,
      configured: true,
      provider: "deterministic",
      suggestion: baseSuggestion,
      fallback: true,
    });
  }
  const validated = outputSchema.safeParse(result.value);
  if (!validated.success) {
    return NextResponse.json({
      feature: payload.feature,
      configured: true,
      provider: "deterministic",
      suggestion: baseSuggestion,
      fallback: true,
    });
  }
  let suggestion: unknown = validated.data;
  if (payload.feature === "quick_add") {
    suggestion = constrainQuickAddSuggestion(
      baseSuggestion as {
        title: string;
        description: string;
        dueAt: string | null;
        priority: "low" | "medium" | "high" | "urgent";
        estimatedMinutes: number;
      },
      validated.data as {
        title: string;
        description: string;
        dueAt: string | null;
        priority: "low" | "medium" | "high" | "urgent";
        estimatedMinutes: number;
      },
    );
  } else if (payload.feature === "next_action") {
    // The model may improve only the explanation; task selection is deterministic.
    suggestion = {
      ...baseSuggestion,
      reason: (validated.data as { reason: string }).reason,
    };
  }
  return NextResponse.json({
    feature: payload.feature,
    configured: true,
    provider: result.provider,
    suggestion,
  });
}
