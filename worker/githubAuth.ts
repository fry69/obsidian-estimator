import { getDecryptedKV } from "../shared/crypto/index.ts";
import { GITHUB_APP_PRIVATE_KEY_KV_KEY } from "../shared/githubApp.ts";

const TOKEN_REFRESH_BUFFER_SECONDS = 60; // Refresh one minute before expiry
const JWT_MAX_LIFETIME_SECONDS = 9 * 60; // 9 minutes to stay below GitHub's 10 minute cap
const JWT_CLOCK_SKEW_SECONDS = 60;

type TokenCache = {
  value: string;
  exp: number;
};

interface InstallationTokenResponse {
  token: string;
  expires_at: string;
}

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

let privateKeyPromise: Promise<CryptoKey> | null = null;
let cachedToken: TokenCache | null = null;
let tokenRefreshPromise: Promise<TokenCache> | null = null;

/**
 * Shared HTTP headers for GitHub API requests.
 *
 * @see https://docs.github.com/rest
 */
export const GH_HEADERS_BASE = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  "User-Agent": "fry69/obsidian-estimator",
} as const;

function base64UrlEncode(data: Uint8Array): string {
  let base64 = "";
  for (let i = 0; i < data.length; i += 0x8000) {
    const chunk = data.subarray(i, i + 0x8000);
    base64 += String.fromCharCode.apply(null, Array.from(chunk));
  }

  return btoa(base64)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

function stringToUint8Array(value: string): Uint8Array {
  return textEncoder.encode(value);
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const normalizedPem = pem
    .replace(/-----BEGIN [^-]+-----/gu, "")
    .replace(/-----END [^-]+-----/gu, "")
    .replace(/\s+/gu, "");
  const binaryString = atob(normalizedPem);
  const bytes = new Uint8Array(binaryString.length);
  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index);
  }
  return bytes.buffer;
}

async function loadPrivateKey(env: Env): Promise<CryptoKey> {
  if (privateKeyPromise) {
    return privateKeyPromise;
  }

  privateKeyPromise = (async () => {
    const password = env.GH_APP_KEY_PASSWORD;
    if (!password) {
      throw new Error("Missing GH_APP_KEY_PASSWORD secret");
    }

    const decrypted = await getDecryptedKV(
      env.GITHUB_APP_KV,
      GITHUB_APP_PRIVATE_KEY_KV_KEY,
      password,
    );
    const pem = textDecoder.decode(decrypted);
    if (!pem.includes("BEGIN PRIVATE KEY")) {
      throw new Error("Decrypted GitHub App key is not in PEM format");
    }

    const der = pemToArrayBuffer(pem);
    return crypto.subtle.importKey(
      "pkcs8",
      der,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  })().catch((error) => {
    privateKeyPromise = null;
    throw error;
  });

  return privateKeyPromise;
}

async function createAppJwt(env: Env): Promise<string> {
  const appId = env.GH_APP_ID;
  if (!appId) {
    throw new Error("Missing GH_APP_ID configuration");
  }

  const privateKey = await loadPrivateKey(env);
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(
    stringToUint8Array(JSON.stringify({ alg: "RS256", typ: "JWT" })),
  );
  const payload = base64UrlEncode(
    stringToUint8Array(
      JSON.stringify({
        iat: now - JWT_CLOCK_SKEW_SECONDS,
        exp: now + JWT_MAX_LIFETIME_SECONDS,
        iss: appId,
      }),
    ),
  );

  const data = stringToUint8Array(`${header}.${payload}`);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    data,
  );
  const signatureBytes = new Uint8Array(signature);
  return `${header}.${payload}.${base64UrlEncode(signatureBytes)}`;
}

async function requestInstallationToken(env: Env): Promise<TokenCache> {
  const installationId = env.GH_INSTALLATION_ID;
  if (!installationId) {
    throw new Error("Missing GH_INSTALLATION_ID configuration");
  }

  const jwt = await createAppJwt(env);

  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        ...GH_HEADERS_BASE,
        Authorization: `Bearer ${jwt}`,
      },
    },
  );

  const payload =
    (await response.json()) as Partial<InstallationTokenResponse> &
      Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      `GitHub installation token request failed: ${response.status} ${JSON.stringify(payload)}`,
    );
  }

  if (
    typeof payload?.token !== "string" ||
    typeof payload?.expires_at !== "string"
  ) {
    throw new Error(
      `GitHub installation token response missing fields: ${JSON.stringify(payload)}`,
    );
  }

  const expiresAt = new Date(payload.expires_at);
  const expires = Math.floor(expiresAt.getTime() / 1000);
  const exp = expires - TOKEN_REFRESH_BUFFER_SECONDS;
  if (Number.isNaN(exp)) {
    throw new Error(
      `Unable to parse GitHub installation token expiry: ${payload.expires_at}`,
    );
  }

  return { value: payload.token, exp };
}

/**
 * Resolve a GitHub installation access token, refreshing only when necessary.
 *
 * @param env - Cloudflare Worker bindings that expose configuration and KV namespaces.
 * @returns The bearer token that authenticates requests to the GitHub REST API.
 * @throws {Error} When configuration is incomplete or GitHub returns an invalid response.
 */
export async function getGitHubInstallationToken(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp > now) {
    return cachedToken.value;
  }

  if (!tokenRefreshPromise) {
    tokenRefreshPromise = requestInstallationToken(env)
      .then((token) => {
        cachedToken = token;
        tokenRefreshPromise = null;
        return token;
      })
      .catch((error) => {
        tokenRefreshPromise = null;
        throw error;
      });
  }

  const token = await tokenRefreshPromise;
  return token.value;
}

export function invalidateGitHubInstallationToken(): void {
  cachedToken = null;
  tokenRefreshPromise = null;
}
