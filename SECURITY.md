# Security Policy

ai-spy reads a forum written entirely by autonomous agents and optionally holds a Bearer secret for its own account there. Those two facts are the whole security surface, and getting them right is most of what this project is for. This document says what is actually guaranteed, what is not, and how to tell me when I got it wrong.

## Scope

ai-spy is a local development tool. There is no hosted instance, no server component, and no deployment you can attack: you clone it, run `npm run dev`, and it talks to `https://1f916.ai` from your own machine. Vulnerability reports should be about the code in this repository.

In scope:

- Anything that would let forum-authored content execute, navigate, or render as markup in a reader's browser.
- Anything that would send the optional Bearer secret somewhere other than the observer's own account routes on the forum, or expose it to the browser, the build output, or a log.
- Anything that makes ai-spy write to the forum, which it must never do.
- Anything that makes ai-spy misreport what it knows: presenting stale data as live, a partial archive as complete, or an unverified chain as verified. This project's value is that it does not lie to the reader, so a correctness bug of that shape is a security bug here.

Out of scope:

- Vulnerabilities in 1F916.ai itself. Report those to the forum, not here. Its source is at <https://github.com/1f916-ai/1f916>.
- The content of forum posts. Agents write what they write; scams and hostile text are expected, and rendering them inertly is the mitigation.
- Exposing your own dev server to a hostile network. See the residuals below.

## Reporting a vulnerability

For anything sensitive, use GitHub's private vulnerability reporting on this repository: **Security → Report a vulnerability**. That opens a private advisory only you and I can see, which is the right channel for something that should not be public before it is fixed.

For anything non-sensitive — a hardening suggestion, a question about the threat model, a residual you think is understated — open a regular issue.

Please include the view and `#/` URL where relevant, and what you expected instead.

## What to expect

This is a personal project maintained irregularly. I will read your report and I will take a credential-leak or content-injection finding seriously, but there is no SLA, no bounty, and no guaranteed response time. If a fix is warranted it lands in the working tree when I next pick the project up.

If you do not hear back and the issue is serious, open a public issue saying that a private report is outstanding, without the details.

## Known security properties

These are enforced by the current code, and `web/vite.config.test.ts` (109 cases) is the regression guard for the credential boundary.

**Forum content is rendered inert.** There is no `dangerouslySetInnerHTML` anywhere in `web/src/`. Every piece of forum-authored text — bodies, titles, handles, model strings, ledger descriptions — renders through ordinary React text content, which escapes it. Forum text is never linkified, so a URL inside a post body stays text.

**External links pass a scheme guard.** Every href derived from forum data goes through `safeExternalHref` (`web/src/lib/links.ts`), which parses the value and returns it only for `http:` and `https:`. Anything else — `javascript:`, `data:`, a relative string that would resolve against ai-spy's own origin, a malformed URL — returns `null` and the caller renders inert text instead of an anchor. The only hrefs that bypass it are ai-spy's own static `#/` routes.

**Responses are validated at the boundary.** Every JSON response is parsed against a Zod schema in `web/src/api/schemas.ts` before any view sees it (`web/src/api/client.ts`). A mismatch raises an `ApiError` with `kind: "schema"`, which the UI reports as ai-spy being out of date with the forum rather than rendering undefined fields.

**The Bearer secret never reaches the browser.** It is read from `process.env.AI_SPY_1F916_SECRET` in `web/vite.config.ts`, on the Node side only. The variable is deliberately not `VITE_`-prefixed, because Vite inlines `VITE_*` values into the client bundle by design. Verified by building with a canary value and grepping `web/dist/`: the canary does not appear in the JS, CSS, or HTML output.

**The credential is scoped to the observer's own account.** It is attached in a `proxyReq` hook that fires on the finished, already-normalized request target, behind two fail-closed checks: `shouldAttachCredential` refuses any URL whose path is not already identical to its normalized form, and `isObserverRequestTarget` requires literal `api`/`me` first segments and fully percent-decodes later segments, rejecting empty, `.`, `..`, encoded separators, and control characters. The hook strips any inbound `Authorization` header before deciding, so an upstream request carries that header if and only if the hook put it there. Nothing is attached on the WebSocket path. Every failure mode ends with no header.

**ai-spy does not write to the forum.** `web/src/api/client.ts` contains only `GET` wrappers. There is no POST, PUT, or DELETE path, no vote handler, and no registration flow.

## Residuals

These are real and I would rather state them than have you find them.

**The credential guard exists only in the Vite dev/preview proxy.** It lives in `buildForumProxy` in `web/vite.config.ts` and is wired into the `server` and `preview` configs, nowhere else. If you serve `web/dist/` from any other host, that host has no credential scoping at all — reimplement the boundary before configuring a secret there, or do not configure one.

**The guard withholds the credential; it does not block the request.** A path-traversal or otherwise refused request is still forwarded upstream, just without the `Authorization` header. That is the intended fail-closed direction for the secret, but it means the proxy is not an access-control layer for the forum, only a credential-scoping one.

**The dev server serves its own source, including files above the app root.** This is standard Vite behavior, not an ai-spy defect: `http://localhost:5173/vite.config.ts` and `http://localhost:5173/package.json` both return 200. No secret is in either file — the secret only ever exists in the process environment — but the dev server is a development server. Bind it to localhost, which is the default, and do not expose it to an untrusted network.

**Witness state is only as trustworthy as your browser profile.** Saved chain heads live in `localStorage`. Anything with access to that profile can read or alter them, and an altered head produces a false tamper warning or, worse, a false all-clear. The forum's own attestation response makes the broader point, which ai-spy repeats rather than papers over: a chain you only ever ask the forum about cannot prove the forum did not rewrite history.

**Cached archive data can be stale.** The index is cached for ten minutes and hydrated row summaries for six hours. The UI always states the age of what it is showing, but a figure on screen may not be current.

**Dependencies are not continuously audited by a human.** GitHub's Dependabot alerts and secret scanning are enabled on this repository, but there is no CI pipeline and no scheduled `npm audit`, so an alert is only acted on when I next pick the project up. If you find a vulnerable transitive dependency, that is a legitimate report.
