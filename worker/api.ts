import { ingest } from "./ingest.ts";
import {
  readDatasetPointer,
  readDatasetVersion,
  type DatasetPointer,
} from "./datasetCache.ts";
import { readQueueSummary } from "./queueStore.ts";

const summaryRoute = new URLPattern({ pathname: "/api/summary" });
const triggerRoute = new URLPattern({ pathname: "/api/trigger" });
const pointerRoute = new URLPattern({
  pathname: "/api/data/:dataset/current.json",
});
const versionRoute = new URLPattern({
  pathname: "/data/:dataset.:version.json",
});

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

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);

async function triggerIngest(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const authHeader = request.headers.get("Authorization") ?? "";

  if (!authHeader.startsWith("Bearer ")) {
    return Response.json({ error: "Missing bearer token" }, { status: 401 });
  }

  const token = authHeader.slice("Bearer ".length).trim();

  if (!token || !env.TRIGGER_TOKEN || token !== env.TRIGGER_TOKEN) {
    return Response.json({ error: "Invalid bearer token" }, { status: 403 });
  }

  let force = false;
  const forceParam = url.searchParams.get("force");
  if (forceParam) {
    const normalized = forceParam.trim().toLowerCase();
    force = TRUE_VALUES.has(normalized);
  }

  if (!force) {
    const contentType = request.headers.get("Content-Type") ?? "";
    if (contentType.includes("application/json")) {
      try {
        const body = (await request.json()) as { force?: unknown };
        if (typeof body.force === "boolean") {
          force = body.force;
        } else if (typeof body.force === "string") {
          const normalized = body.force.trim().toLowerCase();
          force = TRUE_VALUES.has(normalized);
        }
      } catch (error) {
        console.warn(
          "[Trigger] Failed to parse JSON body for /api/trigger",
          error,
        );
      }
    }
  }

  try {
    const result = await ingest(env, { force });
    const status = result.ok ? 202 : 500;
    return Response.json(result, { status });
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

  if (request.method === "GET") {
    const pointerMatch = pointerRoute.exec(url);
    if (pointerMatch) {
      const dataset = pointerMatch.pathname.groups?.["dataset"];
      if (!dataset) {
        return new Response("Dataset missing", { status: 400 });
      }
      return respondWithPointer(request, env, dataset);
    }
  }

  if (request.method === "GET") {
    const versionMatch = versionRoute.exec(url);
    if (versionMatch) {
      const groups = versionMatch.pathname.groups;
      const dataset = groups?.["dataset"];
      const version = groups?.["version"];
      if (!dataset || !version) {
        return new Response("Dataset or version missing", { status: 400 });
      }
      return respondWithVersionedBlob(env, request, dataset, version);
    }
  }

  if (request.method === "POST" && triggerRoute.test(url)) {
    return triggerIngest(request, env);
  }

  return fetch(request);
}

async function respondWithPointer(
  request: Request,
  env: Env,
  dataset: string,
): Promise<Response> {
  try {
    const pointer = await readDatasetPointer(env.QUEUE_DATA, dataset);
    if (!pointer) {
      return Response.json({ error: "Dataset not found" }, { status: 404 });
    }

    const etag = `W/"${pointer.version}"`;
    if (request.headers.get("If-None-Match") === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag } });
    }

    const body: DatasetPointer = pointer;

    return new Response(JSON.stringify(body), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control":
          "public, max-age=30, stale-while-revalidate=30, must-revalidate",
        ETag: etag,
      },
    });
  } catch (error) {
    console.error("Error fetching pointer from KV:", error);
    return Response.json({ error: "Failed to fetch pointer" }, { status: 500 });
  }
}

async function respondWithVersionedBlob(
  env: Env,
  request: Request,
  dataset: string,
  version: string,
): Promise<Response> {
  try {
    const etag = `"${version}"`;
    if (request.headers.get("If-None-Match") === etag) {
      return new Response(null, { status: 304, headers: { ETag: etag } });
    }

    const body = await readDatasetVersion(env.QUEUE_DATA, dataset, version);
    if (body == null) {
      return Response.json(
        { error: "Dataset version not found" },
        { status: 404 },
      );
    }

    return new Response(body, {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=31536000, immutable",
        ETag: etag,
      },
    });
  } catch (error) {
    console.error("Error serving versioned blob:", error);
    return Response.json({ error: "Failed to serve dataset" }, { status: 500 });
  }
}
