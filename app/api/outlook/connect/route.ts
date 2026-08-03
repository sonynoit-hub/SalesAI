import { NextResponse } from "next/server";
import {
  buildOutlookAuthorizationUrl,
  createOutlookOauthState,
  isOutlookConfigured,
} from "@/lib/outlook/client";

const oauthStateCookie = "salesai_outlook_oauth_state";

export async function GET() {
  if (!isOutlookConfigured()) {
    return NextResponse.redirect(
      new URL("/settings?outlook=missing-config", process.env.MICROSOFT_REDIRECT_URI ?? "http://localhost:3000/api/outlook/callback"),
    );
  }

  const state = createOutlookOauthState();
  const response = NextResponse.redirect(buildOutlookAuthorizationUrl(state));

  response.cookies.set({
    name: oauthStateCookie,
    value: state,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });

  return response;
}
