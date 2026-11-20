import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { error: "Schoology now connects through the Daymark browser extension." },
    { status: 410 },
  );
}
