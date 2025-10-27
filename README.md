# Obsidian Release Queue Estimator

Web-based dashboard for tracking and estimating review times for Obsidian
community plugin and theme submissions.

## Live Demo

Access the live dashboard at: https://obsidian-estimator.fry69.workers.dev/

## Features

- Displays current queue sizes for plugins and themes.
- Estimates review wait times based on historical data.
- Visualizes historical PR merge rates.
- Lists pending "Ready for review" pull requests.

## Technology Stack

- **Frontend:** React, Vite, Tailwind CSS, Chart.js, TanStack Query
- **Backend/Data Ingestion:** Cloudflare Workers, Cloudflare KV, Cloudflare Cron
  Triggers

## Development

This project utilizes Cloudflare Workers for both frontend serving and scheduled
data ingestion from the GitHub API. Data is persisted in Cloudflare KV as a
single JSON payload for fast reads.

## Setup

1.  **Clone repository.**
2.  **Install dependencies:** `npm install`
3.  **Cloudflare KV:**
    - Create a KV namespace for queue data (one-time):
      `wrangler kv namespace create obsidian-queue-data`
    - (Optional) Create a separate preview namespace for local/staging:
      `wrangler kv namespace create obsidian-queue-data-preview --preview`
    - Update `wrangler.jsonc` with the namespace IDs returned by Wrangler.
4.  **GitHub Token:**
    - Create a GitHub Personal Access Token with `repo` scope.
    - Add as a Cloudflare secret: `wrangler secret put GITHUB_TOKEN`
5.  **Deploy:**
    - Production: `npm run deploy`
      (https://obsidian-estimator.fry69.workers.dev/)
    - Staging: `npm run deploy:staging`
      (https://obsidian-estimator-staging.fry69.workers.dev/)

The staging script sets `VITE_CLOUDFLARE_ENV=staging` during the build so the
Cloudflare Vite plugin emits a staging-specific bundle/config before running
`wrangler deploy`.

## Data Ingestion

Data is automatically updated via Cloudflare Cron Triggers, fetching information
from the `obsidianmd/obsidian-releases` GitHub repository. Each run computes two
KV entries:

- a lightweight summary containing wait-time estimates, queue counts, and weekly
  merge statistics (`/api/summary`)
- the full PR details blob used by the tables (`/api/details`), which is only
  rewritten when the upstream data actually changes

The frontend polls the summary key and only requests the detailed payload when a
new version is available, keeping the initial load fast even when the queue is
large.

### Manual refresh endpoint

You can force a refresh outside the cron schedule by calling the authenticated
`/api/trigger` endpoint. Supply the same bearer token you configured in the
`TRIGGER_TOKEN` secret:

```bash
curl -X POST "https://obsidian-estimator.fry69.workers.dev/api/trigger" \
  -H "Authorization: Bearer $TRIGGER_TOKEN"
```

When developing locally, replace the hostname with the URL printed by
`npm run dev` (often `http://127.0.0.1:8787`). A successful request returns HTTP
202 while the ingest job runs in the background.
