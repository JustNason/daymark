import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const response = NextResponse.redirect(
    new URL("/app?schoology=extension_required", request.url),
  );
  response.cookies.set("daymark_schoology_oauth", "", {
    path: "/api/integrations/schoology",
    maxAge: 0,
  });
  return response;
}
