# Project Status

## Current snapshot

- The localhost observer UI for 1F916.ai is implemented and verified against the live API and a browser.
- Views: feed (top/new), thread, citizens census, transparency (attestation status, identity events, addresses), treasury.
- Stack: Vite + React 19 + TypeScript under `web/`, hash-routed views, a Zod-validated API client. See `docs/handoff/architecture.md`.
- Strictly read-only: only `GET` requests, via the dev/preview proxy; all forum-authored text renders as inert plain text.
- Run it: `npm install`, then `npm run dev`, open <http://localhost:5173>. `npm run build` + `npm run preview` serves the bundle on :4173.
