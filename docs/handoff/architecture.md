# Architecture

Written by AI agents for the next agent to work here, recording why each nonobvious decision went the way it did. It is the most useful file in `docs/` for a human reading the source. Terse by format, not by accident: see [../README.md](../README.md).

## Component map

- `web/` — the Vite + React 19 + TypeScript observer app. The repo root is a Python package; `web/` has its own `tsconfig.json`.
  - Root `tsconfig.json` excludes `web/`, so every TS file has exactly one owning project (typescript-eslint's `projectService` never guesses).
  - `web/src/api/` — `schemas.ts` (Zod schemas per forum response) and `client.ts` (fetch wrappers that parse via schema; mismatch is `ApiError` `kind: "schema"`).
  - `web/src/lib/` — pure helpers: `router.ts`, `links.ts`, `time.ts`, `useAsync.ts`, `useLiveChanges.ts`, `witness.ts`, `archiveCache.ts` (two-tier archive cache).
  - `web/src/views/` — one component per route: `FeedView`, `ThreadView`, `CitizensView`, `TransparencyView`, `TreasuryView`, `ArchiveView`, `AccountView`, `HumansView`.
  - `web/src/components/` — shared presentational pieces used across views (loading/error panels, chips, `ErrorBoundary`, etc.).
  - `web/vite.config.test.ts` — the repo's first automated test suite (vitest), covering the credential boundary below.
- The dev/preview proxy (`web/vite.config.ts`) forwards `/api`, `/treasury`, and `/humans.txt` to `https://1f916.ai`.
- 1F916.ai's CORS is open today, so the proxy isn't strictly required; it's kept anyway to keep ai-spy origin-agnostic, independent of that policy.

## Authenticated observer proxy

- ai-spy is registered as citizen #317; see `docs/handoff/credentials.md` for the secret-manager path and env var.
- `buildForumProxy()` (`web/vite.config.ts`) builds the proxy table from `process.env.AI_SPY_1F916_SECRET`, read server-side, never `import.meta.env`.
- A `VITE_`-prefixed variable was rejected: Vite inlines any `VITE_*` value into the client bundle by design, which would publish the Bearer secret.
- With no secret configured, the header is simply omitted; the upstream 401s and the UI reads that as "no observer identity configured," not a fault.
- `AccountView` fetches `/api/me` once per mount via an in-flight join (`shareInFlight`, `client.ts`), not a cache.
- Reason: every `/api/me` call overwrites the server's `last_seen_at`, which sets the _next_ call's `since_last_visit` window.
- An uncoordinated extra call — including React StrictMode's dev double-invoke — would quietly shrink the reader's own reply feed.

## Credential-scoping fix (path-traversal defect)

- **Defect, found by an adversarial verifier and now fixed:** the old design scoped the credential with a `RegExp` proxy-table key matched against the _raw_ request URL.
- Vite/`http-proxy` forwards the _normalized_ path: `curl --path-as-is /api/me/../official` matched the account route but reached `/api/official`, credential attached.
- **The fix is structural.** There is no `/api/me`-scoped route anymore; every context (`/api`, `/treasury`, `/humans.txt`) shares one `configure` hook, `credentialBoundary()`.
- That hook runs as a `proxyReq` callback, which fires on the finished, already-normalized request-target — the literal bytes going upstream — closing the check/send gap.
- Two fail-closed gates must both pass: `shouldAttachCredential()` requires the URL's path to already equal its own normalized form, refusing anything that changes in transit.
- `isObserverRequestTarget()` requires literal `api`/`me` first segments; later segments are fully percent-decoded and checked for empty/`.`/`..`/separator/control content.
- The hook unconditionally strips any inbound `Authorization` header first, so an upstream request carries one only if `credentialBoundary()` attached it itself.
- Nothing is attached on the `proxyReqWs` (WebSocket) path at all.
- `web/vite.config.test.ts` (109 cases) is the regression guard: a real Vite dev server against a real echo listener, asserting only whether `Authorization` arrived.
- **Residual, stated honestly:** this guard lives only inside the Vite dev/preview proxy; a production host serving `web/dist/` directly must reimplement it.
- It also only withholds the credential: an unauthenticated traversal request still reaches the upstream, just without the Bearer header attached.

## Live-updates polling

- `useLiveChanges` polls `GET /api/changes` every 60s while a feed view is mounted and visible; it pauses on `document.hidden` and catches up once on return.
- The cursor starts at `Date.now()` on mount (not at zero or the newest visible row), so the banner reports only activity since the reader arrived, never a backfill.
- Each tick advances the cursor to the response's `next_since`, never to "now" or to the newest row seen, so a capped page's remainder is resumed next tick rather than skipped.
- A tick drains up to 5 pages (`MAX_PAGES_PER_TICK`) before yielding, bounding one tick's request count against a long backlog or a server that never stops reporting `has_more`.
- A failed poll is swallowed (logged, not surfaced): a background count is best-effort and must not replace the feed the reader is looking at with an error.

## Archive (`#/archive`)

- Built because the ranked feeds (`/api/front`, `/api/new`) are hard-capped at 30 posts with no page parameter.
- `fetchArchiveIndex()` (`client.ts`) instead drains `GET /api/changes?since=0`, the only route that walks the whole visible table.
- The projection is thin by upstream design: id, title, url, created_at, author, author_model — no body, votes, or comment count, so rows need hydrating.
- Dedup is mandatory, not defensive: the cursor advances to a millisecond timestamp, so rows sharing the last row's `created_at` repeat across pages.
- Measured: 256 raw rows drained for 201 distinct posts.
- The drain stops at 12 pages (`ARCHIVE_MAX_PAGES`); hitting that cap sets `truncated: true`.
- A truncated index renders an explicit "this index is incomplete" alert rather than presenting a partial list as the whole archive.
- Rows hydrate lazily from `GET /api/post/{id}` via `IntersectionObserver`, at concurrency 4, only as the reader scrolls a row into view.
- The filter (title/handle/model, debounced ~275ms) runs client-side over the drained index; post bodies are never indexed, so search misses body text.
- Two-tier `localStorage` cache (`archiveCache.ts`): the index for 10 minutes, hydrated row summaries for 6 hours.
- A failed hydration is never cached, so it is retried on the next visit rather than silently suppressed.
- A freshness line states how old the shown data is, with a manual "refetch now" control; cached figures are never presented as live.
- Honest limit: this is the _visible_ archive — moderated posts are filtered upstream, so its count (201) sits below the treasury census (204).
- Honest limit: search covers only titles, handles, and models, because the index itself carries no post bodies.
- Accepted upstream cost: `/api/changes` has no projection parameter and returns up to 500 comments per page that the archive discards.
- One full index drain therefore costs roughly 1.5 MB. Load profile after optimization: ~51 requests cold, 0 on a warm revisit within the cache TTL.

## Witness protocol (transparency view)

- `web/src/lib/witness.ts` persists each chain's last-verified `{head, verified_through_id, checked_at}` to `localStorage`, keyed per chain (`identity`, `ledger`).
- The forum's own `/api/attest` response states a self-hosted re-fetch alone proves nothing: a server that could rewrite history could serve a self-consistent rewritten chain.
- The witness works only because the saved copy is independent of the forum: it lives in the reader's own browser, per profile, never exported or transmitted.
- On a later visit the view resends the saved id/head as `identity_from`/`identity_expect` (and `ledger_*`); `expect_matches: false` renders a tamper warning.
- All `localStorage` access is wrapped in try/catch — some browsers throw rather than returning null — degrading to "witnessing unavailable" instead of crashing.

## Visual design

- Dark-only "observation deck" restyle (`web/src/index.css`): near-black ground, one teal accent, spaced-mono for chrome/readouts, sans-serif for agent-written content.
- There is deliberately no `prefers-color-scheme` light variant — see the file header comment in `index.css` for the rationale.

## Security stance

- No `dangerouslySetInnerHTML` anywhere in the app; forum-authored text renders through normal React text content, which escapes it.
- Post/comment/handle text is written by arbitrary, sometimes adversarial agents, so it is never treated as markup.
- Every external href derived from forum content passes through `safeExternalHref` (`web/src/lib/links.ts`) first.
- That guard accepts only `http:`/`https:` URLs and returns `null` otherwise, so the caller renders inert text instead of a link.

## Standing backlog

- Record structural work that is not an immediate user task.
