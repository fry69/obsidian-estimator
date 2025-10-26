import { ingest } from "./ingest";

const dataRoute = new URLPattern({ pathname: "/api/data" });
const triggerRoute = new URLPattern({ pathname: "/api/trigger" });

interface QueueData {
  openPrs: unknown[];
  mergedPrs: unknown[];
}

const CACHE_HEADERS = {
  "Cache-Control":
    "private, max-age=1800, stale-while-revalidate=30, stale-if-error=86400",
};

async function queryQueueData(env: Env): Promise<QueueData> {
  const [openPrs, mergedPrs] = await Promise.all([
    env.obsidian_queue
      .prepare("SELECT * FROM open_prs ORDER BY createdAt ASC")
      .all(),
    env.obsidian_queue
      .prepare("SELECT * FROM merged_prs ORDER BY mergedAt ASC")
      .all(),
  ]);

  return {
    openPrs: openPrs.results,
    mergedPrs: mergedPrs.results,
  };
}

async function respondWithQueueJson(env: Env): Promise<Response> {
  try {
    const payload = await queryQueueData(env);
    return Response.json(payload, { headers: CACHE_HEADERS });
  } catch (error) {
    console.error("Error fetching data from D1:", error);
    return Response.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}

async function triggerIngest(request: Request, env: Env): Promise<Response> {
  const authHeader = request.headers.get("Authorization") ?? "";

  if (!authHeader.startsWith("Bearer ")) {
    return Response.json({ error: "Missing bearer token" }, { status: 401 });
  }

  const token = authHeader.slice("Bearer ".length).trim();

  if (!token || !env.TRIGGER_TOKEN || token !== env.TRIGGER_TOKEN) {
    return Response.json({ error: "Invalid bearer token" }, { status: 403 });
  }

  try {
    await ingest(env);
    return Response.json({ message: "Ingest triggered" }, { status: 202 });
  } catch (error) {
    console.error("Error triggering ingest:", error);
    return Response.json({ error: "Failed to trigger ingest" }, { status: 500 });
  }
}

export async function handleRequest(
  request: Request,
  env: Env,
): Promise<Response> {
  const url = new URL(request.url);

  if (request.method === "GET" && dataRoute.test(url)) {
    return respondWithQueueJson(env);
  }

  if (request.method === "POST" && triggerRoute.test(url)) {
    return triggerIngest(request, env);
  }

  if (shouldInjectHtml(request, url)) {
    try {
      return await serveHtmlWithInitialData(request, env);
    } catch (error) {
      console.error("Error injecting initial data:", error);
      return serveStaticAsset(request, env);
    }
  }

  return serveStaticAsset(request, env);
}

function shouldInjectHtml(request: Request, url: URL): boolean {
  if (request.method !== "GET") {
    return false;
  }
  const accept = request.headers.get("Accept") || "";
  if (!accept.includes("text/html")) {
    return false;
  }
  const pathname = url.pathname;
  const hasExtension = pathname.includes(".");
  return !hasExtension || pathname.endsWith(".html");
}

async function serveHtmlWithInitialData(
  request: Request,
  env: Env,
): Promise<Response> {
  const assetResponse = await serveStaticAsset(request, env);
  const contentType = assetResponse.headers.get("Content-Type") || "";
  if (!contentType.includes("text/html")) {
    return assetResponse;
  }

  const [html, data] = await Promise.all([
    assetResponse.text(),
    queryQueueData(env).catch((error) => {
      console.error("Error preloading queue data:", error);
      return null;
    }),
  ]);

  if (!data) {
    return assetResponse;
  }

  const serialized = JSON.stringify(data).replace(/</g, "\\u003c");
  const injection = `<script>window.__INITIAL_QUEUE_DATA__=${serialized};` +
    `window.__PR_DATA_PROMISE__=Promise.resolve(window.__INITIAL_QUEUE_DATA__);</script>`;
  const body = html.includes("</body>")
    ? html.replace("</body>", `${injection}</body>`)
    : `${html}${injection}`;

  const headers = new Headers(assetResponse.headers);
  headers.set("Cache-Control", CACHE_HEADERS["Cache-Control"]);
  headers.set("Content-Length", String(new TextEncoder().encode(body).length));

  return new Response(body, {
    status: assetResponse.status,
    statusText: assetResponse.statusText,
    headers,
  });
}

async function serveStaticAsset(request: Request, env: Env): Promise<Response> {
  if (env.ASSETS) {
    return env.ASSETS.fetch(request);
  }
  return fetch(request);
}
