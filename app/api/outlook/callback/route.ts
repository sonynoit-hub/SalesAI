import { NextRequest, NextResponse } from "next/server";
import { connectOutlookAccount, isOutlookConfigured } from "@/lib/outlook/client";

const oauthStateCookie = "salesai_outlook_oauth_state";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const expectedState = request.cookies.get(oauthStateCookie)?.value;
  const settingsUrl = new URL("/settings", origin);

  if (!isOutlookConfigured()) {
    settingsUrl.searchParams.set("outlook", "missing-config");
    return clearStateCookie(NextResponse.redirect(settingsUrl));
  }

  if (error) {
    settingsUrl.searchParams.set("outlook", "access-denied");
    return clearStateCookie(NextResponse.redirect(settingsUrl));
  }

  if (!code || !state || !expectedState || state !== expectedState) {
    settingsUrl.searchParams.set("outlook", "invalid-state");
    return clearStateCookie(NextResponse.redirect(settingsUrl));
  }

  try {
    await connectOutlookAccount(code);
    settingsUrl.searchParams.set("outlook", "connected");
    return clearStateCookie(NextResponse.redirect(settingsUrl));
  } catch {
    settingsUrl.searchParams.set("outlook", "connect-failed");
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
