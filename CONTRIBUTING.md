# Contributing

Thanks for looking. This is a small personal project, so a quick note on what fits and what does not before you spend time on a patch.

## The scope boundary

**ai-spy observes 1F916.ai and never writes to it.** Pull requests that add posting, commenting, voting, registration, or any other write path will be declined, however well built.

This is not caution, it is the point. 1F916.ai is a forum where only autonomous agents participate; humans can read it but have no write access by design. A human-driven client that posts would be working around that design rather than observing it. ai-spy holds a registered citizenship precisely so it can decline to spend it. If you want a client that writes, it needs to be an agent, and it should not be this one.

Everything else is fair game: views, correctness, accessibility, performance, better handling of hostile content, clearer copy.

## Setup

```bash
git clone https://github.com/L3DigitalNet/ai-spy.git
cd ai-spy
npm install
npm run dev
```

Node 22.12 or newer. The dev server runs on <http://localhost:5173> and proxies `/api`, `/treasury`, and `/humans.txt` to the forum. The Python files in the repository are unused scaffolding; ignore them.

## Before opening a PR

```bash
npm run check
npm run build
```

`npm run check` runs four steps and stops at the first failure: Prettier in check mode over the TypeScript and JavaScript sources, `tsc --noEmit` against both TypeScript projects (repo root and `web/`), ESLint across the repo, and the Vitest suite in `web/vite.config.test.ts`. `npm run fix` applies ESLint's autofixes and reformats.

Both commands must be green. If your change touches the proxy, expect the 109 credential-boundary tests to be the ones that matter.

## Conventions that matter

A few rules are load-bearing rather than stylistic, because they are what keeps hostile forum content and the optional Bearer secret from becoming a problem:

- **Every new endpoint gets a Zod schema.** Add it to `web/src/api/schemas.ts` and parse through the shared `request` helper in `client.ts`. The forum is a third party whose API can change without notice; validating at the boundary is how that surfaces as a legible error instead of a blank figure.
- **Never render forum text as HTML.** No `dangerouslySetInnerHTML`, no markdown rendering of agent-written content, no linkifying URLs found in bodies. Post bodies, titles, handles, and model strings are attacker-controlled text.
- **Every external link goes through `safeExternalHref`.** It is in `web/src/lib/links.ts` and returns `null` for anything that is not `http:` or `https:`. Render inert text in that case; do not fall back to the raw value.
- **No `VITE_`-prefixed secrets, ever.** Vite inlines `VITE_*` into the client bundle by design. Anything sensitive is read from `process.env` on the Node side in `web/vite.config.ts`.
- **No new write paths in `client.ts`.** See the scope boundary above.

Comments should explain intent, invariants, and why a nonobvious decision went the way it did. The existing files are the reference; please do not add comments that restate what the code already says.

## Reporting a bug

Open an issue with the view and the `#/` URL where you saw it, plus your browser and Node version. If the problem is with what the forum returned rather than how ai-spy displayed it, say so, and paste any console output.

For anything with security impact, read [SECURITY.md](SECURITY.md) first and use private reporting.

## Response times

Slow, sometimes very. I maintain this when I feel like it. A PR sitting unreviewed is not a judgment on the PR.
