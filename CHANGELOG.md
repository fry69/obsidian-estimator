# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]
### Added
- Project initialized with React/Vite/Cloudflare template
- Implementation plan updated for React/Vite
- D1 database created and schema applied.
- Cron trigger configured for hourly data ingestion.
- `wrangler.jsonc` updated to uncomment assets binding.
- TanStack Query installed.
- `src/main.tsx` configured with `QueryClientProvider`.
- Wait time estimation refined with moving average and confidence interval in `src/App.tsx`.
