import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

const microsoftLoginBaseUrl = "https://login.microsoftonline.com";
const microsoftGraphBaseUrl = "https://graph.microsoft.com/v1.0";
const defaultTenantId = "common";
const defaultOutlookScope = "offline_access Mail.Send User.Read";
const outlookAccountPath = path.join(
  process.cwd(),
  "work",
  "outlook-account.json",
);

export type OutlookConnection = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tokenType: string;
  scope: string;
  connectedAt: string;
  displayName: string | null;
  email: string | null;
};

type OutlookTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type: string;
};

export function getOutlookConfig() {
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim() ?? "";
  const redirectUri =
    process.env.MICROSOFT_REDIRECT_URI?.trim() ??
    "http://localhost:3000/api/outlook/callback";
  const tenantId =
    process.env.MICROSOFT_TENANT_ID?.trim() || defaultTenantId;
  const scope =
    process.env.MICROSOFT_OUTLOOK_SCOPE?.trim() || defaultOutlookScope;

  return {
    clientId,
    clientSecret,
    redirectUri,
    tenantId,
    scope,
  };
}

export function isOutlookConfigured() {
  const config = getOutlookConfig();
  return Boolean(config.clientId && config.clientSecret && config.redirectUri);
}

export function createOutlookOauthState() {
  return randomBytes(24).toString("hex");
}

export function buildOutlookAuthorizationUrl(state: string) {
  const config = getOutlookConfig();
  const url = new URL(
    `/${config.tenantId}/oauth2/v2.0/authorize`,
    microsoftLoginBaseUrl,
  );

  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", config.scope);
  url.searchParams.set("state", state);

  return url.toString();
}

export function getOutlookConnectionSync() {
  if (!existsSync(outlookAccountPath)) {
    return null;
  }

  try {
    const raw = readFileSync(outlookAccountPath, "utf8");
    return JSON.parse(raw) as OutlookConnection;
  } catch {
    return null;
  }
}

export async function getOutlookConnection() {
  try {
    const raw = await fs.readFile(outlookAccountPath, "utf8");
    return JSON.parse(raw) as OutlookConnection;
  } catch {
    return null;
  }
}

export function isOutlookConnected() {
  return getOutlookConnectionSync() !== null;
}

export async function clearOutlookConnection() {
  try {
    await fs.unlink(outlookAccountPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

export async function exchangeOutlookAuthorizationCode(code: string) {
  const config = getOutlookConfig();
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
    code,
    scope: config.scope,
  });

  return requestOutlookToken(body);
}

export async function getValidOutlookAccessToken() {
  const connection = await getOutlookConnection();

  if (!connection) {
    throw new Error("Outlook is not connected yet.");
  }

  if (Date.now() < connection.expiresAt - 60_000) {
    return connection.accessToken;
  }

  const refreshed = await refreshOutlookAccessToken(connection.refreshToken);
  return refreshed.accessToken;
}

export async function refreshOutlookAccessToken(refreshToken: string) {
  const config = getOutlookConfig();
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: config.scope,
  });

  const token = await requestOutlookToken(body);
  const previous = await getOutlookConnection();

  const profile =
    previous?.displayName || previous?.email
      ? {
          displayName: previous.displayName,
          email: previous.email,
        }
      : await fetchOutlookProfile(token.access_token);

  const connection = await saveOutlookConnection(
    token,
    profile,
    previous?.refreshToken,
  );
  return connection;
}

export async function connectOutlookAccount(code: string) {
  const token = await exchangeOutlookAuthorizationCode(code);
  const profile = await fetchOutlookProfile(token.access_token);
  return saveOutlookConnection(token, profile);
}

export async function sendMailWithOutlook(input: {
  toEmail: string;
  subject: string;
  body: string;
}) {
  const accessToken = await getValidOutlookAccessToken();
  const response = await fetch(`${microsoftGraphBaseUrl}/me/sendMail`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        subject: input.subject,
        body: {
          contentType: "Text",
          content: input.body,
        },
        toRecipients: [
          {
            emailAddress: {
              address: input.toEmail,
            },
          },
        ],
      },
    }),
  });

  if (!response.ok) {
    const message = await extractOutlookError(response);
    throw new Error(message);
  }

  return {
    messageId:
      response.headers.get("request-id") ??
      response.headers.get("client-request-id") ??
      null,
  };
}

async function requestOutlookToken(body: URLSearchParams) {
  const config = getOutlookConfig();
  const response = await fetch(
    `${microsoftLoginBaseUrl}/${config.tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    },
  );

  if (!response.ok) {
    const message = await extractOutlookError(response);
    throw new Error(message);
  }

  return (await response.json()) as OutlookTokenResponse;
}

async function fetchOutlookProfile(accessToken: string) {
  const response = await fetch(
    `${microsoftGraphBaseUrl}/me?$select=displayName,mail,userPrincipalName`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    return {
      displayName: null,
      email: null,
    };
  }

  const payload = (await response.json()) as {
    displayName?: string | null;
    mail?: string | null;
    userPrincipalName?: string | null;
  };

  return {
    displayName: payload.displayName ?? null,
    email: payload.mail ?? payload.userPrincipalName ?? null,
  };
}

async function saveOutlookConnection(
  token: OutlookTokenResponse,
  profile: {
    displayName: string | null;
    email: string | null;
  },
  existingRefreshToken?: string,
) {
  mkdirSync(path.dirname(outlookAccountPath), { recursive: true });

  const connection: OutlookConnection = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? existingRefreshToken ?? "",
    expiresAt: Date.now() + token.expires_in * 1000,
    tokenType: token.token_type,
    scope: token.scope ?? getOutlookConfig().scope,
    connectedAt: new Date().toISOString(),
    displayName: profile.displayName,
    email: profile.email,
  };

  await fs.writeFile(
    outlookAccountPath,
    JSON.stringify(connection, null, 2),
    "utf8",
  );

  return connection;
}

async function extractOutlookError(response: Response) {
  try {
    const payload = (await response.json()) as {
      error?: {
        message?: string;
      };
      error_description?: string;
    };

    return (
      payload.error?.message ??
      payload.error_description ??
      "Microsoft rejected the Outlook request."
    );
  } catch {
    return "Microsoft rejected the Outlook request.";
  }
}
