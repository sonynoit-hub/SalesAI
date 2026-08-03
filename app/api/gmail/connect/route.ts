import { NextResponse } from "next/server";
import {
  buildGmailAuthorizationUrl,
  createGmailOauthState,
  isGmailConfigured,
} from "@/lib/gmail/client";

const oauthStateCookie = "salesai_gmail_oauth_state";

export async function GET() {
  if (!isGmailConfigured()) {
    return NextResponse.redirect(
      new URL(
        "/settings?gmail=missing-config",
        process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3000/api/gmail/callback",
      ),
    );
  }

  const state = createGmailOauthState();
  const response = NextResponse.redirect(buildGmailAuthorizationUrl(state));

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
