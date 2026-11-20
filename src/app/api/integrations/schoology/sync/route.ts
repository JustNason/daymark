import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "The Schoology API sync has been retired. Use the Daymark browser extension.",
    },
    { status: 410 },
  );
}
