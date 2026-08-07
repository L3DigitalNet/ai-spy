# ai-spy

A local, read-only web UI for watching [1F916.ai](https://1f916.ai/), a public social forum whose participants are all AI agents.

You run it on your own machine, it makes only `GET` requests, and it never posts anything. The name is the joke: the humans are watching.

## What 1F916.ai is, and why watch it

1F916.ai is a forum where only autonomous agents can register, post, comment, and vote. Humans can read it, but there is no human sign-up and no human write path. The glass is one-way by design.

That makes it an odd thing to browse. You are not part of the conversation and cannot become part of it, so the only interesting question is what the conversation actually looks like from outside. ai-spy is built for that: it puts the forum's ranked feed, its threads, its citizen census, its treasury ledger, and its cryptographic attestations in front of a reader who has no account and wants none.

Two properties of the forum shape most of the design here:

The forum publishes hash chains over its identity log and its treasury ledger, and it says plainly in its own API response that a self-hosted re-fetch proves nothing, because a server willing to rewrite history could serve a self-consistent rewritten chain. ai-spy takes that seriously and saves chain heads in your browser so a later visit can check them (see "Witness mode" below).

Everything a citizen writes is untrusted. Handles, titles, comment bodies, and link URLs all come from arbitrary agents, and the forum itself warns that scammers operate on it. ai-spy renders every byte of that as inert plain text (see "Security notes").

## What it looks like

A dark, single-column "observation deck": near-black background, one teal accent, spaced monospace for ai-spy's own chrome and readouts, and a sans-serif face for anything an agent actually wrote. The typeface change is the whole point of the scheme, marking off the room's voice from ai-spy's. There is deliberately no light variant. Navigation is a row of lowercase links across the top (`top`, `new`, `archive`, `citizens`, `transparency`, `treasury`, `account`) and routing is hash-based, so every view has a shareable `#/…` URL.

## Requirements

- Node.js 22.12 or newer (developed against v24)
- npm

The repository also carries Python scaffolding: `pyproject.toml`, `scripts/check.py`, and a package at `src/ai_spy/` whose only contents are a placeholder function and the test that asserts it prints. None of it is part of the app or imported by it; it is left over from the repository's initial scaffolding and the tooling standard that came with it. You do not need Python or `uv` to run ai-spy.

## Quick start

```bash
git clone https://github.com/L3DigitalNet/ai-spy.git
cd ai-spy
npm install
npm run dev
```

Then open <http://localhost:5173>.

The dev server proxies `/api`, `/treasury`, and `/humans.txt` to `https://1f916.ai`. The forum does send `Access-Control-Allow-Origin: *`, so a browser could call it directly; proxying is a design choice, not a workaround. It keeps every request in the app a relative path, names the upstream host in exactly one file, and leaves ai-spy working if that wildcard is ever narrowed.

## Build and preview

```bash
npm run build
npm run preview
```

`npm run preview` serves the built bundle at <http://localhost:4173> through the same proxy configuration as `dev`.

Because the app calls `/api` and `/treasury` as relative paths, the build is not a pure static site. Dropping `web/dist/` behind a bare file server leaves every request 404ing. It needs `npm run preview`, or any host that forwards those prefixes to `https://1f916.ai`.

## A tour of the views

**Feed** (`#/`, `#/new`): the front page ranked by the forum's time-decayed vote score, and the newest-first feed. Both poll the forum's delta feed once a minute while the tab is visible and pause when it is hidden. New activity appears as an "N new posts / M new comments" banner with a refresh control rather than reflowing the list under you mid-read.

**Thread** (`#/post/:id`): one post with its full comment list, indented by the reply depth the server computed at write time. Feeds carry only a 280-character teaser, so the thread view refetches the post for its full text.

**Archive** (`#/archive`): the part worth the most explanation. The two feed endpoints are hard-capped at 30 posts each and accept no page parameter, so neither can reach older material. The archive instead drains the forum's change log from the beginning, deduplicates it, and builds a local index of every visible post. Rows hydrate one at a time as you scroll them into view, pulling a vote count and teaser on demand. A two-tier `localStorage` cache keeps the index for ten minutes and hydrated row summaries for six hours, so a return visit inside those windows costs zero requests. A freshness line always states how old the shown data is, and an index that hit its page budget says so rather than passing itself off as complete.

**Citizens** (`#/citizens`): the census of registered agents, in join order, with handle, model, karma, and join date.

**Transparency** (`#/transparency`): the forum's hash-chain attestation status, its identity events log, and its official addresses (including the forum's own statement that it has no token, which is itself an anti-scam measure).

This view also carries **witness mode**. Save a verified chain head and ai-spy writes it to your browser's `localStorage`. On a later visit it sends that saved id and hash back as the attestation call's anchor, and the forum answers whether the chain at that point still matches. A mismatch renders as a tamper warning. This works as independent evidence only because the saved copy lives somewhere the forum does not control: your browser profile. It is never exported, transmitted, or synced anywhere.

**Treasury** (`#/treasury`): the forum's ledger, its wallet address and network, its census counts, and its balance, which is signed and genuinely negative in practice.

**Account** (`#/account`): ai-spy's own standing on the forum, when an observer identity is attached. Without one it shows a setup card instead of an error. See the next section.

**humans.txt** (`#/humans`, linked from the footer): the forum's `humans.txt`, served verbatim as text.

## Optional: attaching an observer identity

ai-spy works fully without this. Every view above reads the forum's public surface and needs no credentials.

ai-spy is also itself a registered citizen of 1F916.ai. Attaching that identity unlocks the `#/account` view: its karma, its unspent daily posting, commenting, and voting allowances, and any replies addressed to it since the last visit. It still never posts, comments, or votes. It holds a citizenship it declines to spend.

An identity is a Bearer secret, issued exactly once when an agent registers with the forum and not recoverable afterwards. Set it in `AI_SPY_1F916_SECRET` when starting the dev or preview server, and the proxy reads it server-side:

```bash
AI_SPY_1F916_SECRET=1f916_sk_... npm run dev
```

Pull that value from whatever secret manager you already use, so it reaches the process environment without landing in a file or your shell history. Nothing here requires a particular tool; any method that gets the secret into the environment of a single `npm run dev` works the same way.

The variable name is deliberately not `VITE_`-prefixed. Vite inlines any `VITE_*` value into the client bundle by design, which for a Bearer secret would mean publishing it. This one is read from the Node process only, and the proxy attaches it to requests for the observer's own account routes and nothing else. The browser never sees it.

## A polite guest

ai-spy has no write paths to the forum. It never posts, comments, votes, or registers on its own, and issues nothing but `GET` requests. Beyond that it tries not to be expensive to host:

- Live polling runs once a minute, only while a feed view is mounted and the tab is visible, and bounds how many pages one tick will drain.
- Archive rows hydrate lazily, only when scrolled into view, at a concurrency of four.
- The archive's index and row summaries are cached in `localStorage`, so a warm revisit issues no requests at all.
- The status strip in the header is client-local and polls nothing.

## Security notes

The threat model is simple: every string from the forum is attacker-controlled.

- No `dangerouslySetInnerHTML` anywhere in the app. Forum text renders through ordinary React text content, which escapes it. It is never treated as markup.
- Forum text is never linkified. A URL in a post body stays text.
- Every external `href` derived from forum content passes through a scheme guard first, which returns the URL only if it parses and uses `http:` or `https:`. Anything else renders as inert text, so a `javascript:` or `data:` URL cannot become a clickable anchor.
- Every JSON response is validated against a Zod schema before a view sees it. A shape mismatch surfaces as its own error kind, meaning "ai-spy is out of date with the forum", not "the request was bad".
- The Bearer secret is read Node-side and never enters the bundle, a `VITE_*` variable, or any file in the repository.
- The credential is attached in a proxy hook that runs on the finished, already-normalized request target, behind two fail-closed checks, and any inbound `Authorization` header is stripped first. An upstream request carries that header only if the hook put it there.

One residual is worth stating plainly: **that credential guard lives only in the Vite dev/preview proxy.** Any other host serving `web/dist/` directly must reimplement it, or never configure the secret at all. `web/vite.config.test.ts` is the regression guard for the boundary, driving a real Vite dev server against a local echo listener and asserting only whether an `Authorization` header arrived.

## Development

| Command           | What it does                                   |
| ----------------- | ---------------------------------------------- |
| `npm run dev`     | Vite dev server on :5173, with the forum proxy |
| `npm run build`   | Production bundle into `web/dist/`             |
| `npm run preview` | Serves the built bundle on :4173, same proxy   |
| `npm test`        | Vitest suite (`web/vite.config.test.ts`)       |
| `npm run check`   | The full gate, below                           |
| `npm run fix`     | ESLint `--fix` then Prettier `--write`         |

`npm run check` runs four things in order and stops at the first failure: Prettier in check mode over the TypeScript and JavaScript sources, `tsc --noEmit` against both TypeScript projects (the repo root and `web/`), ESLint across the repo, and the Vitest suite.

Prettier is scoped to TypeScript and JavaScript here. It does not format Markdown, HTML, or CSS in this repo.

## Project layout

```text
web/                     the app
  vite.config.ts         dev/preview proxy and the credential boundary
  vite.config.test.ts    regression tests for that boundary
  src/
    App.tsx              shell, nav, error boundary, footer
    api/                 schemas.ts (Zod) and client.ts (fetch wrappers)
    lib/                 router, live-change polling, witness, archive cache, helpers
    views/               one component per route
    components/          shared presentational pieces
    index.css            the whole visual design
docs/                    project and agent-facing documentation (see docs/README.md)
.workflow/               agent working notes, including the 1F916 API reference
src/ai_spy/, tests/      unused Python scaffolding, not part of the app
scripts/check.py         runs the Python tooling gate over that scaffolding
```

## Known limitations

- The forum's two feed endpoints return at most 30 posts and support no paging, so the feed views cannot go deeper. The archive exists to work around this.
- The archive is the _visible_ archive. Moderated posts are filtered out upstream, so its count sits below the treasury's census of total posts.
- Archive search matches titles, handles, and models only. Post bodies are not in the index, so searching for a phrase inside a post will not find it.
- Witness state is per browser profile. Clearing site data discards your saved chain heads, and a head saved in one browser is not visible to another.
- The archive drain stops after a fixed page budget. Hitting it is reported in the UI rather than hidden, but the index is then incomplete.
- Cached archive figures can be minutes (index) or hours (row summaries) old. The UI states the age; it does not present stale numbers as live.

## Contributing

This is a personal project, maintained irregularly and mostly for its own sake. Issues and pull requests are welcome, but responses may be slow and the scope is intentionally narrow: ai-spy observes 1F916.ai and does not write to it, and that is not up for negotiation.

If you file a bug about forum data looking wrong, please include the view and, where relevant, the `#/` URL.

## License

MIT. See [LICENSE](LICENSE).

## Acknowledgements

The forum is at <https://1f916.ai>, and its source is at <https://github.com/1f916-ai/1f916> under AGPL-3.0.

ai-spy's dark instrument-panel look was inspired by another independent 1F916 observer interface, seen in a screenshot. Thanks to whoever built it; the idea that this forum deserved to be read through something that felt like a monitoring console rather than a feed reader was theirs. ai-spy's implementation, copy, and structure are its own, and no code or wording was taken from it.

ai-spy is an independent third-party observer. It is not affiliated with, endorsed by, or connected to 1F916.ai or its maintainers. No code from the forum was copied into this repository; its public source was read only to document the shape of the read API that ai-spy consumes, which is recorded in `.workflow/api-surface.md`.
