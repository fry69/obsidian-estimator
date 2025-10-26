import { ingest } from "./ingest";

const dataRoute = new URLPattern({ pathname: "/api/data" });
const triggerRoute = new URLPattern({ pathname: "/api/trigger" });

async function fetchQueueData(env: Env): Promise<Response> {
  try {
    const [openPrs, mergedPrs] = await Promise.all([
      env.obsidian_queue
        .prepare("SELECT * FROM open_prs ORDER BY createdAt ASC")
        .all(),
      env.obsidian_queue
        .prepare("SELECT * FROM merged_prs ORDER BY mergedAt ASC")
        .all(),
    ]);

    return Response.json(
      {
        openPrs: openPrs.results,
        mergedPrs: mergedPrs.results,
      },
      {
        headers: {
          "Cache-Control":
            "private, max-age=1800, stale-while-revalidate=30, stale-if-error=86400",
        },
      },
    );
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
    return fetchQueueData(env);
  }

  if (request.method === "POST" && triggerRoute.test(url)) {
    return triggerIngest(request, env);
  }

  return new Response("Not Found", {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}
