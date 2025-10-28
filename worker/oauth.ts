const TOKEN_REFRESH_BUFFER_SECONDS = 70; // 1 min plus 10s leeway

// Fresh token must be valid for at least 1 hour
const GH_TOKEN_MIN_TTL_SECONDS = 60 * 60;

// Token can get cached for up to 7 hours after issue,
// one hour less than 8-hour expiry to be safe
const GH_TOKEN_MAX_TTL_SECONDS = 60 * 60 * 7;

interface OAuthTokenResponse {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
  error_uri?: string;
}

type TokenCache = {
  value: string;
  exp: number;
};

let cachedToken: TokenCache | null = null;

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

/**
 * Resolve a GitHub OAuth access token using the refresh token stored in KV.
 *
 * Fetches a new user access token only when the cached token is missing or
 * nearing expiration. The refresh token is rotated when GitHub provides an
 * updated value.
 *
 * @param env - Cloudflare Worker bindings that expose configuration and KV namespaces.
 * @returns The bearer token that authenticates requests to the GitHub REST API.
 * @throws {Error} When the refresh token is absent or GitHub returns an invalid response.
 */
export async function getGitHubAccessToken(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp > now + TOKEN_REFRESH_BUFFER_SECONDS) {
    return cachedToken.value;
  }

  const refreshToken = await env.GITHUB_OAUTH.get("GH_REFRESH");
  if (!refreshToken) {
    throw new Error("Missing GH_REFRESH in KV");
  }

  const body = new URLSearchParams({
    client_id: env.GH_CLIENT_ID,
    ...(env.GH_CLIENT_SECRET ? { client_secret: env.GH_CLIENT_SECRET } : {}),
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json" },
    body,
  });

  const payload = (await response.json()) as OAuthTokenResponse;
  if (!response.ok) {
    throw new Error(`GitHub token refresh failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  if (!payload.access_token) {
    throw new Error(
      `GitHub token refresh response missing access_token: ${JSON.stringify(payload)}`,
    );
  }

  if (payload.refresh_token) {
    await env.GITHUB_OAUTH.put("GH_REFRESH", payload.refresh_token);
  }

  const minimumExpiry = now + GH_TOKEN_MIN_TTL_SECONDS;
  const reportedExpiry =
    now + (payload.expires_in ?? GH_TOKEN_MAX_TTL_SECONDS) - TOKEN_REFRESH_BUFFER_SECONDS;
  const exp = Math.max(minimumExpiry, reportedExpiry);

  cachedToken = { value: payload.access_token, exp };
  return payload.access_token;
}
