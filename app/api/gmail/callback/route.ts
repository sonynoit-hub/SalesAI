import { NextRequest, NextResponse } from "next/server";
import { connectGmailAccount, isGmailConfigured } from "@/lib/gmail/client";

const oauthStateCookie = "salesai_gmail_oauth_state";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const expectedState = request.cookies.get(oauthStateCookie)?.value;
  const settingsUrl = new URL("/settings", origin);

  if (!isGmailConfigured()) {
    settingsUrl.searchParams.set("gmail", "missing-config");
    return clearStateCookie(NextResponse.redirect(settingsUrl));
  }

  if (error) {
    settingsUrl.searchParams.set("gmail", "access-denied");
    return clearStateCookie(NextResponse.redirect(settingsUrl));
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    settingsUrl.searchParams.set("gmail", "invalid-state");
    return clearStateCookie(NextResponse.redirect(settingsUrl));
  }

  try {
    await connectGmailAccount(code);
    settingsUrl.searchParams.set("gmail", "connected");
    return clearStateCookie(NextResponse.redirect(settingsUrl));
  } catch {
    settingsUrl.searchParams.set("gmail", "connect-failed");
    return clearStateCookie(NextResponse.redirect(settingsUrl));
  }
}

function clearStateCookie(response: NextResponse) {
  response.cookies.set({
    name: oauthStateCookie,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}
