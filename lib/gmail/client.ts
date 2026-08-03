import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

const googleOauthBaseUrl = "https://accounts.google.com/o/oauth2/v2/auth";
const googleTokenUrl = "https://oauth2.googleapis.com/token";
const gmailApiBaseUrl = "https://gmail.googleapis.com/gmail/v1";
const defaultGmailScope = "https://www.googleapis.com/auth/gmail.send";
const gmailAccountPath = path.join(process.cwd(), "work", "gmail-account.json");

export type GmailConnection = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tokenType: string;
  scope: string;
  connectedAt: string;
  email: string | null;
  historyId: string | null;
};

type GmailTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
};

export function getGmailConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI?.trim() ??
    "http://localhost:3000/api/gmail/callback";
  const scope =
    process.env.GOOGLE_GMAIL_SCOPE?.trim() || defaultGmailScope;

  return {
    clientId,
    clientSecret,
    redirectUri,
    scope,
  };
}

export function isGmailConfigured() {
  const config = getGmailConfig();
  return Boolean(config.clientId && config.clientSecret && config.redirectUri);
}

export function createGmailOauthState() {
  return randomBytes(24).toString("hex");
}

export function buildGmailAuthorizationUrl(state: string) {
  const config = getGmailConfig();
  const url = new URL(googleOauthBaseUrl);

  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scope);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);

  return url.toString();
}

export function getGmailConnectionSync() {
  if (!existsSync(gmailAccountPath)) {
    return null;
  }

  try {
    const raw = readFileSync(gmailAccountPath, "utf8");
    return JSON.parse(raw) as GmailConnection;
  } catch {
    return null;
  }
}

export async function getGmailConnection() {
  try {
    const raw = await fs.readFile(gmailAccountPath, "utf8");
    return JSON.parse(raw) as GmailConnection;
  } catch {
    return null;
  }
}

export function isGmailConnected() {
  return getGmailConnectionSync() !== null;
}

export async function clearGmailConnection() {
  try {
    await fs.unlink(gmailAccountPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

export async function exchangeGmailAuthorizationCode(code: string) {
  const config = getGmailConfig();
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
    code,
  });

  return requestGmailToken(body);
}

export async function getValidGmailAccessToken() {
  const connection = await getGmailConnection();

  if (!connection) {
    throw new Error("Gmail is not connected yet.");
  }

  if (Date.now() < connection.expiresAt - 60_000) {
    return connection.accessToken;
  }

  const refreshed = await refreshGmailAccessToken(connection.refreshToken);
  return refreshed.accessToken;
}

export async function refreshGmailAccessToken(refreshToken: string) {
  if (!refreshToken) {
    throw new Error("Gmail refresh token is missing. Reconnect Gmail.");
  }

  const config = getGmailConfig();
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const token = await requestGmailToken(body);
  const previous = await getGmailConnection();
  const profile =
    previous?.email || previous?.historyId
      ? {
          email: previous.email,
          historyId: previous.historyId,
        }
      : await fetchGmailProfile(token.access_token);

  return saveGmailConnection(token, profile, previous?.refreshToken);
}

export async function connectGmailAccount(code: string) {
  const token = await exchangeGmailAuthorizationCode(code);
  const profile = await fetchGmailProfile(token.access_token);
  return saveGmailConnection(token, profile);
}

export async function sendMailWithGmail({
  toEmail,
  subject,
  body,
}: {
  toEmail: string;
  subject: string;
  body: string;
}): Promise<{
  messageId: string | null;
}> {
  const accessToken = await getValidGmailAccessToken();
  const response = await fetch(`${gmailApiBaseUrl}/users/me/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      raw: encodeGmailMessage({
        toEmail,
        subject,
        body,
      }),
    }),
  });

  if (!response.ok) {
    const message = await extractGmailError(response);
    throw new Error(message);
  }

  const payload = (await response.json()) as {
    id?: string | null;
  };

  return {
    messageId: payload.id ?? null,
  };
}

async function requestGmailToken(body: URLSearchParams) {
  const response = await fetch(googleTokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!response.ok) {
    const message = await extractGmailError(response);
    throw new Error(message);
  }

  return (await response.json()) as GmailTokenResponse;
}

async function fetchGmailProfile(accessToken: string) {
  const response = await fetch(`${gmailApiBaseUrl}/users/me/profile`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return {
      email: null,
      historyId: null,
    };
  }

  const payload = (await response.json()) as {
    emailAddress?: string | null;
    historyId?: string | null;
  };

  return {
    email: payload.emailAddress ?? null,
    historyId: payload.historyId ?? null,
  };
}

async function saveGmailConnection(
  token: GmailTokenResponse,
  profile: {
    email: string | null;
    historyId: string | null;
  },
  existingRefreshToken?: string,
) {
  mkdirSync(path.dirname(gmailAccountPath), { recursive: true });

  const connection: GmailConnection = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? existingRefreshToken ?? "",
    expiresAt: Date.now() + token.expires_in * 1000,
    tokenType: token.token_type,
    scope: token.scope ?? getGmailConfig().scope,
    connectedAt: new Date().toISOString(),
    email: profile.email,
    historyId: profile.historyId,
  };

  await fs.writeFile(
    gmailAccountPath,
    JSON.stringify(connection, null, 2),
    "utf8",
  );

  return connection;
}

function encodeGmailMessage(input: {
  toEmail: string;
  subject: string;
  body: string;
}) {
  const lines = [
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 7bit",
    `To: ${input.toEmail}`,
    `Subject: ${input.subject}`,
    "",
    input.body,
  ];
  const message = lines.join("\r\n");

  return Buffer.from(message, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function extractGmailError(response: Response) {
  try {
    const payload = (await response.json()) as {
      error?: {
        message?: string;
        error_description?: string;
      };
      error_description?: string;
    };

    return (
      payload.error?.message ??
      payload.error?.error_description ??
      payload.error_description ??
      "Google rejected the Gmail request."
    );
  } catch {
    return "Google rejected the Gmail request.";
  }
}
