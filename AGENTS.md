# Project: Obsidian Release Queue Estimator

## Project Overview

This project is a web-based dashboard for tracking and estimating review times for Obsidian community plugin and theme submissions. It provides insights into the current queue sizes, estimated wait times, and historical data on pull request merge rates.

The frontend is built with **React**, **Vite**, and **Tailwind CSS**, using **Chart.js** for data visualization and **TanStack Query** for data fetching.

The backend is a **Cloudflare Worker** written in TypeScript that serves the frontend and provides a JSON API. The worker fetches data from the GitHub API, processes it, and stores it in a **Cloudflare D1** database. A cron trigger is configured to periodically update the data.

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

### Database

The application uses Cloudflare D1 for its database. To create the database and apply the initial schema for local development, use the following `wrangler` commands:

```bash
# Create the D1 database (only needs to be done once)
wrangler d1 create obsidian-queue

# Apply the database schema
wrangler d1 execute obsidian-queue --local --file=migrations/0000_initial_schema.sql
```

### Testing

To run the test suite, use:

```bash
npm run test
```

### Building and Deployment

To build the application for production, run:

```bash
npm run build
```

To deploy the application to Cloudflare, run:

```bash
npm run deploy
```

This will build the application and deploy the worker and static assets to Cloudflare.

## Development Conventions

*   **Language:** The project is written in **TypeScript**.
*   **Frontend:** The frontend code is located in the `src` directory. The main application component is `src/App.tsx`.
*   **Backend:** The backend Cloudflare Worker code is in `worker/index.ts`. This file defines the API routes (`/api/queue`, `/api/history`) and the cron job for fetching data from GitHub.
*   **Styling:** **Tailwind CSS** is used for styling. Configuration is in `tailwind.config.js`.
*   **API:** The backend exposes a JSON API. The routes are defined in `worker/index.ts` using the Hono framework.
*   **Database:** The database schema is defined in `migrations/0000_initial_schema.sql`. Any changes to the database schema should be done by creating a new migration file.
