import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
export async function DELETE() {
  const supabase = await createClient();
  if (!supabase)
    return NextResponse.json(
      { error: "Supabase is not configured" },
      { status: 503 },
    );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { error } = await supabase
    .from("external_integrations")
    .update({
      status: "disconnected",
      encrypted_credentials: null,
      last_error: null,
    })
    .eq("provider", "schoology");
  if (error)
    return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
