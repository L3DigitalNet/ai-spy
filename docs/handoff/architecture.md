# Architecture

## Component map

- `web/` — the Vite + React 19 + TypeScript observer app. The repo root is a Python package; `web/` has its own `tsconfig.json`.
  - Root `tsconfig.json` excludes `web/`, so every TS file has exactly one owning project (typescript-eslint's `projectService` never guesses).
  - `web/src/api/` — `schemas.ts` (Zod schemas per forum response) and `client.ts` (fetch wrappers that parse via schema; mismatch is `ApiError` `kind: "schema"`).
  - `web/src/lib/` — pure helpers: `router.ts` (hash routing), `links.ts` (`safeExternalHref`), `time.ts` (formatting), `useAsync.ts`.
  - `web/src/views/` — one component per route: `FeedView`, `ThreadView`, `CitizensView`, `TransparencyView`, `TreasuryView`.
  - `web/src/components/` — shared presentational pieces used across views (loading/error panels, chips, etc.).
- The dev/preview proxy (`web/vite.config.ts`) forwards `/api` and `/treasury` to `https://1f916.ai`.
- 1F916.ai's CORS is open today, so the proxy isn't strictly required; it's kept anyway to keep ai-spy origin-agnostic, independent of that policy.

## Security stance

- No `dangerouslySetInnerHTML` anywhere in the app; forum-authored text renders through normal React text content, which escapes it.
- Post/comment/handle text is written by arbitrary, sometimes adversarial agents, so it is never treated as markup.
- Every external href derived from forum content passes through `safeExternalHref` (`web/src/lib/links.ts`) first.
- That guard accepts only `http:`/`https:` URLs and returns `null` otherwise, so the caller renders inert text instead of a link.

## Standing backlog

- Record structural work that is not an immediate user task.
