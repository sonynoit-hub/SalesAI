import { NextResponse } from "next/server";
import { clearOutlookConnection } from "@/lib/outlook/client";

export async function POST(request: Request) {
  await clearOutlookConnection();

  const origin = new URL(request.url).origin;
  return NextResponse.redirect(
    new URL("/settings?outlook=disconnected", origin),
    { status: 303 },
  );
}
