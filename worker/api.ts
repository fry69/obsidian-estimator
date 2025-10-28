import { ingest } from "./ingest";
import { readQueueDetails, readQueueSummary } from "./queueStore";

const summaryRoute = new URLPattern({ pathname: "/api/summary" });
const detailsRoute = new URLPattern({ pathname: "/api/details" });
const triggerRoute = new URLPattern({ pathname: "/api/trigger" });

const CACHE_HEADERS = {
  "Cache-Control":
    "private, max-age=1800, stale-while-revalidate=30, stale-if-error=86400",
};

async function respondWithSummaryJson(env: Env): Promise<Response> {
  try {
    const payload = await readQueueSummary(env);
    if (!payload) {
      return Response.json(
        { error: "Summary not yet available" },
        { status: 503 },
      );
    }
    return Response.json(payload, { headers: CACHE_HEADERS });
  } catch (error) {
    console.error("Error fetching summary from KV:", error);
    return Response.json({ error: "Failed to fetch data" }, { status: 500 });
  }
}

async function respondWithDetailsJson(env: Env): Promise<Response> {
  try {
    const [summary, details] = await Promise.all([
      readQueueSummary(env),
      readQueueDetails(env),
    ]);

    if (!details) {
      return Response.json(
        { error: "Details not yet available" },
        { status: 503 },
      );
    }

    return Response.json(
      {
        version: summary?.detailsVersion ?? null,
        updatedAt: summary?.detailsUpdatedAt ?? null,
        openPrs: details.openPrs,
        mergedPrs: details.mergedPrs,
      },
      { headers: CACHE_HEADERS },
    );
  } catch (error) {
    console.error("Error fetching details from KV:", error);
    return Response.json({ error: "Failed to fetch details" }, { status: 500 });
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

  if (request.method === "GET" && summaryRoute.test(url)) {
    return respondWithSummaryJson(env);
  }

  if (request.method === "GET" && detailsRoute.test(url)) {
    return respondWithDetailsJson(env);
  }

  if (request.method === "POST" && triggerRoute.test(url)) {
    return triggerIngest(request, env);
  }

  return fetch(request);
}
