# Project: Obsidian Release Queue Estimator

## Project Overview

This project is a web-based dashboard for tracking and estimating review times
for Obsidian community plugin and theme submissions. It provides insights into
the current queue sizes, estimated wait times, and historical data on pull
request merge rates.

The frontend is built with **React**, **Vite**, and **Tailwind CSS**, using
**Chart.js** for data visualization and **TanStack Query** for data fetching.

The backend is a **Cloudflare Worker** written in TypeScript that serves the
frontend and provides a JSON API. The worker fetches data from the GitHub API,
processes it, and stores the resulting payload in **Cloudflare KV**. A cron
trigger is configured to periodically update the data.

## Building and Running

### Installation

To install the dependencies, run:

```bash
npm install
```

### Local Development

To run the application in development mode, which includes hot-reloading, use:

```bash
npm run dev
```

This will start the Vite development server for the frontend and the Cloudflare
Worker in a local environment, it will run continuously until stopped via
`Ctrl+C` or typing 'q` plus enter in the running terminal. The actual URL for
the worker frontend will be displayed in the terminal. You will likely have MCP
playwright enabled to access it.

Linting can be performed with:

```bash
npm run lint
```

Type checking can be performed with the build command:

```bash
npm run build
```

### Data Storage

The application stores queue data in Cloudflare KV. To create the namespace for
local development and production, run:

```bash
wrangler kv namespace create obsidian-queue-data
wrangler kv namespace create obsidian-queue-data-preview --preview
```

Update the resulting IDs inside `wrangler.jsonc`.

### Building and Deployment

To build the application for production, run:

```bash
npm run build
```

To deploy the application to Cloudflare, run:

```bash
npm run deploy
```

This will build the application and deploy the worker and static assets to
Cloudflare.

## Development Conventions

- **Language:** The project is written in **TypeScript**.
- **Frontend:** The frontend code is located in the `src` directory. The main
  application component is `src/App.tsx`.
- **Backend:** The backend Cloudflare Worker code is in `worker/index.ts`. This
  file defines the API routes (`/api/summary`, `/api/details`, `/api/trigger`)
  and the cron job for fetching data from GitHub.
- **Styling:** **Tailwind CSS** is used for styling. Configuration is in
  `tailwind.config.js`.
- **API:** The backend exposes a JSON API. The routes are defined in
  `worker/index.ts` using the Hono framework.
- **Storage:** Queue state is saved in Cloudflare KV as two keys: a lightweight
  summary (totals, wait estimates, chart data, version metadata) and the full PR
  details blob. The ingest worker computes both and only rewrites the large
  details payload when GitHub data changes.
