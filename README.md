# Obsidian Release Queue Estimator

Web-based dashboard for tracking and estimating review times for Obsidian community plugin and theme submissions.

## Features

- Displays current queue sizes for plugins and themes.
- Estimates review wait times based on historical data.
- Visualizes historical PR merge rates.
- Lists pending "Ready for review" pull requests.

## Technology Stack

- **Frontend:** React, Vite, Tailwind CSS, Chart.js, TanStack Query
- **Backend/Data Ingestion:** Cloudflare Workers, Cloudflare D1, Cloudflare Cron Triggers

## Development

This project utilizes Cloudflare Workers for both frontend serving and scheduled data ingestion from the GitHub API. Data is persisted in Cloudflare D1.

## Setup

1.  **Clone repository.**
2.  **Install dependencies:** `npm install`
3.  **Cloudflare D1:**
    -   Create a D1 database: `wrangler d1 create obsidian-queue`
    -   Apply schema: `wrangler d1 execute obsidian-queue --local --file=migrations/0000_initial_schema.sql`
4.  **GitHub Token:**
    -   Create a GitHub Personal Access Token with `repo` scope.
    -   Add as a Cloudflare secret: `wrangler secret put GITHUB_TOKEN`
5.  **Deploy:** `wrangler deploy`

## Data Ingestion

Data is automatically updated via Cloudflare Cron Triggers, fetching information from the `obsidianmd/obsidian-releases` GitHub repository.