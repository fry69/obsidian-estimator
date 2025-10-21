# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Changed
- Corrected Octokit search syntax in `worker/index.ts` from `octokit.search.issues` to `octokit.rest.search.issues`.
- Refactored `src/App.tsx` into smaller components and extracted calculation logic.
- Added `src/lib/calculations.ts` for wait time and chart data logic.
- Added `src/types.ts` for shared type definitions.
- Added `src/components/KpiCard.tsx`, `src/components/TimelineChart.tsx`, and `src/components/QueueTable.tsx`.
- Configured ESLint to ignore unused variables prefixed with an underscore.
### Added
- Tests for data ingestion worker.
- Project initialized with React/Vite/Cloudflare template
- Implementation plan updated for React/Vite
- D1 database created and schema applied.
- Cron trigger configured for hourly data ingestion.
- `wrangler.jsonc` updated to uncomment assets binding.
- TanStack Query installed.
- `src/main.tsx` configured with `QueryClientProvider`.
- Wait time estimation refined with moving average and confidence interval in `src/App.tsx`.
