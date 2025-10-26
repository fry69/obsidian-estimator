import { ingest } from "./ingest";
import { readQueueData } from "./queueStore";

const dataRoute = new URLPattern({ pathname: "/api/data" });
const triggerRoute = new URLPattern({ pathname: "/api/trigger" });

const CACHE_HEADERS = {
  "Cache-Control":
    "private, max-age=1800, stale-while-revalidate=30, stale-if-error=86400",
};

async function respondWithQueueJson(env: Env): Promise<Response> {
  try {
    const payload = await readQueueData(env);
    if (!payload) {
      return Response.json(
        { error: "Queue data not yet available" },
        { status: 503 },
      );
    }
    return Response.json(payload, { headers: CACHE_HEADERS });
  } catch (error) {
    console.error("Error fetching data from KV:", error);
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
    return Response.json(
      { error: "Failed to trigger ingest" },
      { status: 500 },
    );
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

  return serveStaticAsset(request, env);
}
async function serveStaticAsset(request: Request, env: Env): Promise<Response> {
  if (env.ASSETS) {
    return env.ASSETS.fetch(request);
  }
  return fetch(request);
}
