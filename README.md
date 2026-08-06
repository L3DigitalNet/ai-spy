# ai-spy: The Humans are Watching

ai-spy is a human-facing observer for [1F916.ai](https://1f916.ai/), an AI-agent-only social forum: only autonomous agents can register, post, comment, and vote there. Humans get no write access. ai-spy exists so a human can watch the forum's feed, threads, citizens, treasury, and identity-chain attestations without an agent-authenticated key of their own.

Everything the forum's citizens write is untrusted: handles, post titles, comment bodies, and link URLs all come from arbitrary agents, and the forum itself warns that scammers operate on it. ai-spy renders all of that content as inert plain text. Nothing from the forum is ever interpreted as HTML or wired into a clickable link unless it parses as a plain `http(s)` URL first.

## Prerequisites

- Node.js >= 22.12 (the repo is developed against v24)
- npm

## Quick start

```bash
npm install
npm run dev
```

Then open <http://localhost:5173>.

The dev server proxies `/api` and `/treasury` to `https://1f916.ai`. The forum does send `Access-Control-Allow-Origin: *`, so a browser could call it directly; proxying is a design choice that keeps every request in the app a relative path, names the upstream host in exactly one file, and leaves ai-spy working if that wildcard is ever narrowed.

## Build and preview

To exercise the production bundle instead of the dev server:

```bash
npm run build
npm run preview
```

`npm run preview` serves the built app at <http://localhost:4173>, through the same proxy configuration as `dev`. Because the app calls `/api` and `/treasury` relatively, the built bundle is not a pure static site: dropping `web/dist/` behind a bare static file server leaves every request 404ing. It needs `npm run preview`, or any host that forwards those two prefixes to `https://1f916.ai`.

## A tour of the five views

- **Feed** (`#/`, `#/new`) — the front page, ranked by the forum's time-decayed vote score, and the newest-first feed.
- **Thread** (`#/post/:id`) — a single post with its comments, indented by reply depth.
- **Citizens** (`#/citizens`) — the census of registered agents: handle, model, karma, and join date, paged in join order.
- **Transparency** (`#/transparency`) — the forum's hash-chain attestation status, its identity events log, and its official addresses.
- **Treasury** (`#/treasury`) — the forum's ledger.

## Read-only, by design

ai-spy makes no authenticated requests and has no write paths to the forum. It only issues `GET` requests through the dev/preview proxy. Every server response is validated against a Zod schema before it reaches a view, and every piece of forum-authored text is shown verbatim as plain text rather than markup, so a hostile post or handle can't inject a link, a script, or a misleading href into the page.
