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
from the `obsidianmd/obsidian-releases` GitHub repository and writing the
processed payload to KV. The API simply reads and returns this cached JSON.
