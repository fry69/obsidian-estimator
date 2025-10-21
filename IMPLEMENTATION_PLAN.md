# Implementation Plan: Obsidian Release Queue Analytics (Cloudflare Edition)

This document outlines the development plan for the Obsidian Release Queue Analytics platform, tailored for a Cloudflare-native implementation.

## Technology Stack

-   **Backend & Frontend Serving:** Cloudflare Workers
-   **Database:** Cloudflare D1
-   **Scheduling:** Cloudflare Cron Triggers
-   **Frontend Framework:** React (with Vite)
-   **State Management:** TanStack Query / Zustand (as needed)
-   **Styling:** Tailwind CSS

## Phased Development

The project will be developed in four phases.

### Phase 1: MVP - "The Queue Snapshot"

The goal is to get a basic, live snapshot of the queue running on Cloudflare infrastructure.

-   **[X] Setup Cloudflare Worker with React/Vite Environment:**
    -   [X] A Cloudflare Worker project with a React/Vite frontend has been initialized.
    -   [X] The configuration file is `wrangler.jsonc`.
    -   [X] The Vite build process is configured to output static assets for the worker.
    -   [ ] Configure Tailwind CSS for the React application.
-   **[ ] Setup Cloudflare D1 Database:**
    -   [ ] Create a new D1 database: `wrangler d1 create obsidian-queue`.
    -   [ ] Add the D1 binding to the `wrangler.jsonc` file.
    -   [ ] Define and execute the initial SQL schema to create tables for `open_prs` and `merged_prs`.
-   **[ ] Create Data Ingestion Logic (Cron Triggered):**
    -   [ ] In `wrangler.jsonc`, configure a cron trigger to run the worker on a schedule (e.g., `cron = "0 * * * *"` for hourly).
    -   [ ] Add a GitHub Personal Access Token as a secret: `wrangler secret put GITHUB_TOKEN`.
    -   [ ] In the worker's `fetch` handler, add logic to detect if the request is from a cron trigger.
    -   [ ] Implement the data fetching script to:
        -   [ ] Fetch *open* PRs with the `"Ready for review"` label using an API client like `octokit`.
        -   [ ] Transform the data and insert/update it into the `open_prs` table in D1.
-   **[ ] Build the Frontend and API:**
    -   [ ] The main worker will serve both the API and the static frontend. The `@cloudflare/vite-plugin` helps automate this.
    -   [ ] Set up a route (e.g., `/api/queue`) that queries the D1 database for the current queue data.
    -   [ ] Set up another route (`/*`) to serve the static files (HTML, JS, CSS) for the React app.
    -   [ ] In the React app, use `TanStack Query` to fetch data from the `/api/queue` endpoint.
    -   [ ] Display the key metrics (Plugin Queue, Theme Queue) and the table of open PRs.

### Phase 2: "The Historical Context"

This phase adds historical data to provide context and enable trend analysis.

-   **[ ] Enhance Data Ingestion Logic:**
    -   [ ] Update the cron-triggered logic to also fetch *merged* PRs from the last 12 months.
    -   [ ] Calculate `daysToMerge` for each.
    -   [ ] Store this historical data in the `merged_prs` table in D1.
-   **[ ] Enhance the Frontend & API:**
    -   [ ] Create a new API endpoint (e.g., `/api/history`) to query the `merged_prs` table.
    -   [ ] Install and configure `Chart.js` for React.
    -   [ ] Use `TanStack Query` to fetch the historical data from the new endpoint.
    -   [ ] Implement the timeline chart to visualize merged PRs per week.

### Phase 3: "The Predictive Engine"

This phase introduces the core predictive functionality.

-   **[ ] Implement Wait-Time Calculation:**
    -   [ ] The calculation can be done on the frontend after fetching the necessary data from the API.
    -   [ ] Use the historical data to calculate the average weekly throughput for plugins and themes.
    -   [ ] Use the current queue size to estimate the wait time: `estimatedWeeks = currentQueueSize / weeklyThroughput`.
-   **[ ] Display the Estimate:**
    -   [ ] Add the "Estimated Plugin Wait" and "Estimated Theme Wait" KPI cards to the UI.
    -   [ ] Use `Zustand` if client-side state management becomes complex.

### Phase 4: "Maturity and Refinement"

This phase focuses on improving the accuracy, reliability, and user experience of the platform.

-   **[ ] Refine Wait-Time Estimation:**
    -   [ ] Shift from a simple average to a moving average for throughput to better reflect current review velocity.
    -   [ ] Calculate a confidence interval (e.g., using standard deviation) to present the estimate as a range (e.g., "7-10 weeks").
-   **[ ] Add Model Confidence Metric:**
    -   [ ] Implement a mechanism to track the variance of review times.
    -   [ ] Display a notice on the UI if the variance is high, indicating that estimates may be less reliable.
-   **[ ] Enhance UI/UX:**
    -   [ ] Add more advanced filtering and sorting options to the PR table.
    -   [ ] Conduct a final polish of the design and user interface.