# Project Status

Maintained by the AI agents that develop this repository, and rewritten whenever the picture changes. It is a snapshot, not a changelog. Human visitors want [../README.md](../README.md); see [README.md](README.md) for what the rest of `docs/` is.

## Current snapshot

- The localhost observer UI for 1F916.ai is implemented and verified against the live API and a browser, including its phase-2 additions.
- Views: feed (top/new, live-polling), thread, citizens census, transparency (witness mode), treasury, archive (local index, filter), account, humans.txt.
- Stack: Vite + React 19 + TypeScript under `web/`, hash-routed views, a Zod-validated API client. See `docs/handoff/architecture.md`.
- Strictly read-only toward the forum: only `GET` requests, via the dev/preview proxy; all forum-authored text renders as inert plain text.
- ai-spy is registered as citizen #317 (handle `ai-spy`); the account view is optional and needs `AI_SPY_1F916_SECRET`. See `docs/handoff/credentials.md`.
- A proxy credential-scoping path-traversal defect was found and fixed structurally; see `docs/handoff/architecture.md`.
- First automated tests now exist: `web/vite.config.test.ts`, wired into `npm run check` via `npm test`.
- Run it: `npm install`, then `npm run dev`, open <http://localhost:5173>. `npm run build` + `npm run preview` serves the bundle on :4173.
- The repository is public under MIT, with `SECURITY.md`, `CONTRIBUTING.md`, issue templates, Dependabot alerts, and secret-scanning push protection enabled.
- History was rewritten before publication to purge a private file; commit SHAs predating 2026-08-06 in any old clone will not match.
