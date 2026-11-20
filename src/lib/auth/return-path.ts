const SCHOOLOGY_FLOW_ID = /^[A-Za-z0-9_-]{32,64}$/;

/** Restrict post-auth redirects to known same-origin destinations. */
export function safeAuthReturnPath(
  candidate: string | null | undefined,
  origin: string,
): string {
  if (!candidate) return "/app";
  try {
    const base = new URL(origin);
    const target = new URL(candidate, base);
    if (target.origin !== base.origin) return "/app";
    if (target.pathname === "/auth/reset/confirm") return target.pathname;
    if (target.pathname === "/extension/schoology") {
      const flowId = target.searchParams.get("flow") || "";
      if (SCHOOLOGY_FLOW_ID.test(flowId))
        return `${target.pathname}?flow=${encodeURIComponent(flowId)}`;
    }
  } catch {
    return "/app";
  }
  return "/app";
}
