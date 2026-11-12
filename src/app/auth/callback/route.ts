import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    await supabase?.auth.exchangeCodeForSession(code);
  }
  const next = url.searchParams.get("next");
  return NextResponse.redirect(
    new URL(next === "/auth/reset/confirm" ? next : "/app", url.origin),
  );
}
