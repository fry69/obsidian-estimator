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
- Lists recently merged pull requests with merge times.

## Technology Stack

- **Frontend:** React, Vite, Tailwind CSS, Chart.js, TanStack Query
- **Backend/Data Ingestion:** Cloudflare Workers, Cloudflare KV, Cloudflare Cron
  Triggers

## Development

This project utilizes Cloudflare Workers for both frontend serving and scheduled
data ingestion from the GitHub API. Each ingest run writes two Cloudflare KV
keys: a lightweight summary with wait-time aggregates and metadata, and a full
details payload for table rendering. The frontend primarily consumes the summary
key to keep reads fast.

## Setup

1.  **Clone repository.**
2.  **Install dependencies:** `npm install`
3.  **Cloudflare KV:**
    - Create a KV namespace for queue data (one-time):
      `wrangler kv namespace create obsidian-queue-data`
    - Create (or reuse) a KV namespace for the encrypted GitHub App key. If
      you're migrating from the old OAuth flow you can reuse the existing
      namespace ID; just bind it as `GITHUB_APP_KV` in `wrangler.jsonc`.
      Example: `wrangler kv namespace create obsidian-github-app-secrets`
    - Update `wrangler.jsonc` with the namespace IDs returned by Wrangler (if
      not done automatically).
4.  **GitHub App configuration (server-to-server flow):**
    - Create a GitHub App under
      [developer settings](https://github.com/settings/apps/new) if you do not
      already have one. This app is only used to mint installation tokens that
      raise the GitHub REST API rate limits; it never interacts with the
      Obsidian repositories directly.
    - Suggested checklist:
      - Homepage URL: `https://github.com/` (placeholder; required field)
      - Callback URL: leave blank (no OAuth flow required)
      - Webhook: off
      - Permissions: leave everything at **No access** (no scopes are required)
      - Events: none
      - Installation target: choose **Any account**. Install it on any account
        you control; it does **not** need access to `obsidianmd/obsidian-releases`.
    - After creating the app, download the generated private key (`.pem`) and
      note both the **App ID** and the **Installation ID** (visible in the
      installation URL or via `https://api.github.com/app/installations` when
      authenticated as the app).
5.  **Configure secrets and encrypted key material:**
    - Store the numeric GitHub App identifiers as Worker secrets (repeat per
      environment). You can either set them manually:
      - `wrangler secret put GH_APP_ID`
      - `wrangler secret put GH_INSTALLATION_ID` or provide them directly to the
        helper script in the next step.
    - Upload the private key to KV using the helper script, which encrypts the
      PEM locally, stores the random password in the Worker secret
      `GH_APP_KEY_PASSWORD`, and (optionally) writes the App/installation IDs
      for you:

      ```bash
      npm run upload:github-app-key -- --pem /path/to/github-app-private-key.pem \
        --app-id 123456 --installation-id 7890123
      ```

      Add `--env staging` to target the staging environment. The script writes
      to the `GITHUB_APP_KV` namespace and will overwrite any existing secret of
      the same key.

6.  **Deploy:**
    - Production: `npm run deploy`

## Data Ingestion

Data is automatically updated via Cloudflare Cron Triggers, fetching information
from the `obsidianmd/obsidian-releases` GitHub repository. Each run computes two
KV entries:

- a lightweight summary containing wait-time estimates, queue counts, and weekly
  merge statistics (`/api/summary`)
- cacheable dataset blobs exposed under `/api/data/<dataset>/current.json`
  (returns pointers with ETags) and `/data/<dataset>.<version>.json` (the
  immutable, versioned payload).

- Open queue data is pulled via the repo `issues` endpoint using manual
  pagination. The worker stores page 1’s ETag in the summary record; a `304`
  response lets us skip re-fetching the queue entirely.
- Merged history relies on search queries. A cached watermark tracks the latest
  merge timestamp; when it hasn’t advanced, the worker reuses the existing KV
  payload. Any change triggers a full rebuild to stay consistent.

The frontend polls the summary key and only requests the detailed payload when a
new version is available, keeping the initial load fast even when the queue is
large.

### Manual refresh endpoint

You can force a refresh outside the cron schedule by calling the authenticated
`/api/trigger` endpoint. Supply the same bearer token you configured in the
`TRIGGER_TOKEN` secret:

```bash
wrangler secret put TRIGGER_TOKEN
```

```bash
curl -X POST "<your-worker-url>.workers.dev/api/trigger" \
  -H "Authorization: Bearer $TRIGGER_TOKEN"
```

When developing locally, replace the hostname with the URL printed by
`npm run dev` (often `http://127.0.0.1:5173`). A successful request returns HTTP
202 while the ingest job runs in the background. Append `?force=1` (or send
`{ "force": true }` in a JSON body) to bypass cached ETag/merge tripwires when
you need a full refresh. The ingestion process can take up to a minute depending
on queue size.

## Acknowledgments

This project includes code from
[encrypt-workers-kv](https://github.com/bradyjoslin/encrypt-workers-kv) by Brady
Joslin [@bradyjoslin](https://github.com/bradyjoslin).

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file
for details.
