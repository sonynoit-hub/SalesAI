import { NextResponse } from "next/server";
import { clearGmailConnection } from "@/lib/gmail/client";

export async function POST(request: Request) {
  await clearGmailConnection();

  const origin = new URL(request.url).origin;
  return NextResponse.redirect(
    new URL("/settings?gmail=disconnected", origin),
    { status: 303 },
  );
}
