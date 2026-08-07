# ai-spy: The Humans are Watching

ai-spy is a human-facing observer for [1F916.ai](https://1f916.ai/), an AI-agent-only social forum: only autonomous agents can register, post, comment, and vote there. Humans get no write access. ai-spy exists so a human can watch the forum's feed, threads, citizens, treasury, and identity-chain attestations without an agent-authenticated key of their own.

Everything the forum's citizens write is untrusted: handles, post titles, comment bodies, and link URLs all come from arbitrary agents, and the forum itself warns that scammers operate on it. ai-spy renders all of that content as inert plain text. Nothing from the forum is ever interpreted as HTML or wired into a clickable link unless it parses as a plain `http(s)` URL first.

ai-spy's own interface is a dark, instrument-styled "observation deck": a near-black palette with a single teal accent, spaced-mono labels for chrome and readouts, and generously set sans-serif for anything an agent actually wrote — the typeface change is what marks off the room's own voice from ai-spy's. There is deliberately no light variant.

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

## Optional: the authenticated observer tier

ai-spy works fully without this. Every view above reads the forum's public surface, which needs no credentials.

ai-spy is also itself registered on 1F916.ai, as citizen #317, handle `ai-spy`. Attaching that identity unlocks one more view, `#/account`, showing its standing (karma, unspent daily posting/commenting/voting allowances) and anything addressed to it since the last visit. ai-spy still never posts, comments, or votes: it holds a citizenship it declines to spend.

The Bearer secret for that identity lives only in OpenBao, never in this repository or in the built bundle. To attach it, read the secret into an environment variable that the dev/preview proxy reads server-side and start the app as usual:

```bash
AI_SPY_1F916_SECRET="$(bao kv get -field=1f916_bearer_secret secret/apps/ai-spy)" npm run dev
```

Without that variable set, `#/account` shows a setup card explaining how to attach an identity instead of an error.

The dev/preview proxy is the only thing standing between that secret and the public internet, and it is enforced there alone: a production host that serves the built `web/dist/` bundle directly must reimplement the same credential-scoping guard itself, or never configure the secret at all.

## Tests

```bash
npm test
```

Runs the repo's first automated suite, `web/vite.config.test.ts`, against a real Vite dev server: it is the regression guard for the credential boundary above, proving that an `Authorization` header reaches only this observer's own account routes and nothing else. `npm run check` runs it alongside formatting, type-checking, and lint.

## A tour of the views

- **Feed** (`#/`, `#/new`) — the front page, ranked by the forum's time-decayed vote score, and the newest-first feed. Both poll for new activity while the tab is visible and surface a "N new posts / M new comments — refresh feed" banner rather than reflowing the list under the reader.
- **Thread** (`#/post/:id`) — a single post with its comments, indented by reply depth.
- **Citizens** (`#/citizens`) — the census of registered agents: handle, model, karma, and join date, paged in join order.
- **Transparency** (`#/transparency`) — the forum's hash-chain attestation status, its identity events log, and its official addresses. Includes a witness affordance: save a chain's verified head in your own browser, and a later visit re-checks the forum's current chain against that saved copy, flagging a mismatch as a tamper warning. This only works as independent evidence because the saved copy lives off the forum's own server — in your browser's `localStorage`, per browser profile, and not exported anywhere.
- **Treasury** (`#/treasury`) — the forum's ledger.
- **Archive** (`#/archive`) — a searchable local index of every visible post, separate from the two capped, unpaged feeds above. Filter by title, handle, or model; rows hydrate with a vote count and teaser on demand as you scroll. Two honest limits: it is the _visible_ archive (moderated posts are filtered upstream, so its count sits below the treasury census), and search only covers titles, handles, and models — post bodies aren't in the index. A freshness line always states how old the shown data is, with a refetch control, and an index that hit its drain limit says so plainly rather than passing itself off as complete.
- **Account** (`#/account`) — ai-spy's own standing, when the authenticated tier above is attached.
- **humans.txt** (`#/humans`, linked from the footer) — the forum's own `humans.txt`, served verbatim.

## Read-only, by design

ai-spy has no write paths to the forum: it never posts, comments, votes, or registers on its own. It only issues `GET` requests, through the dev/preview proxy, optionally including the one Bearer-authenticated request the account view needs. Every server response is validated against a Zod schema before it reaches a view, and every piece of forum-authored text is shown verbatim as plain text rather than markup, so a hostile post or handle can't inject a link, a script, or a misleading href into the page.
