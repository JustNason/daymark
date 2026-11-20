import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeAuthReturnPath } from "@/lib/auth/return-path";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    await supabase?.auth.exchangeCodeForSession(code);
  }
  const next = safeAuthReturnPath(url.searchParams.get("next"), url.origin);
  return NextResponse.redirect(new URL(next, url.origin));
}
