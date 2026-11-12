import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requestToken } from "@/lib/integrations/schoology";
import { signState } from "@/lib/integrations/crypto";
import { randomBytes } from "node:crypto";
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = (await supabase?.auth.getUser()) || { data: { user: null } };
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (
    !process.env.SCHOOLOGY_CONSUMER_KEY ||
    !process.env.SCHOOLOGY_CONSUMER_SECRET
  )
    return NextResponse.json(
      { error: "Schoology consumer credentials are not configured." },
      { status: 503 },
    );
  try {
    const callback =
      process.env.SCHOOLOGY_CALLBACK_URL ||
      new URL("/api/integrations/schoology/callback", request.url).toString();
    const token = await requestToken(callback);
    if (!token.key || !token.secret)
      throw new Error("Schoology did not return an OAuth request token");
    const payload = JSON.stringify({
      userId: user.id,
      ...token,
      state: randomBytes(24).toString("base64url"),
    });
    const response = NextResponse.redirect(
      `https://app.schoology.com/oauth/authorize?oauth_token=${encodeURIComponent(token.key)}`,
    );
    response.cookies.set("daymark_schoology_oauth", signState(payload), {
      httpOnly: true,
      secure: new URL(request.url).protocol === "https:",
      sameSite: "lax",
      path: "/api/integrations/schoology",
      maxAge: 600,
    });
    return response;
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Schoology authorization could not start",
      },
      { status: 502 },
    );
  }
}
