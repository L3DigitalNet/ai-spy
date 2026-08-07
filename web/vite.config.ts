// Build config for the observer app, and the host of its one security boundary.
//
// ai-spy has no backend. The dev and preview servers configured here are the
// entire server side: they serve the bundle and forward `/api`, `/treasury` and
// `/humans.txt` to the forum, which is why the app can address everything by
// relative path and never names the upstream host in client code.
//
// The consequential part is the credential boundary below. ai-spy can hold an
// optional Bearer secret for its own forum account, read from the Node process
// (never `import.meta.env`) so it cannot reach the browser, and attached only to
// requests for that account's own routes. Everything from `hasControlCharacter`
// through `credentialBoundary` exists to make "only its own routes" true against
// a hostile request target rather than merely intended — an earlier version was
// defeated by path traversal, and the comments on each function record why the
// current shape resists it.
//
// The boundary is enforced HERE AND NOWHERE ELSE. Anything that serves
// `web/dist/` without going through `buildForumProxy` gets no such protection
// and must reimplement it before configuring the secret at all.

import react from "@vitejs/plugin-react"
import { defineConfig, type ProxyOptions } from "vite"

// The forum does send `Access-Control-Allow-Origin: *`, so calling it directly
// from the browser would work today. Proxying is a deliberate choice, not a
// workaround for a missing CORS grant:
//   * every request in the app stays a relative path, so the bundle carries no
//     build-time or runtime knowledge of the upstream host;
//   * the host is named here and nowhere else, so moving or mirroring it is a
//     one-line change;
//   * ai-spy keeps working if that wildcard is ever narrowed — a policy this
//     app does not control and would otherwise break without warning.
// The trade-off is that the built bundle is not a pure static site: whatever
// serves it must forward these two prefixes. `npm run preview` does.
const UPSTREAM = "https://1f916.ai"

/**
 * Base for reproducing the normalization the proxy performs before forwarding.
 *
 * Never contacted, and the host is deliberately in the reserved `.invalid` TLD
 * so a mistake here cannot become a request. It exists only because relative
 * request targets need a base to parse against, and it mirrors the base
 * http-proxy's own `getPath` uses — see `shouldAttachCredential`.
 */
const NORMALIZATION_BASE = "http://base.invalid"

/**
 * Percent-decoding rounds allowed per path segment before a segment is
 * rejected outright.
 *
 * More than one round is needed because `%252e` decodes to `%2e` and only then
 * to `.`, and servers that decode twice do exist. The bound stops a crafted
 * segment from spinning here, and exceeding it is treated as "cannot determine
 * the real segment", which fails closed.
 */
const MAX_DECODE_ROUNDS = 4

/** True for any C0 control character or DEL, which must never reach the wire. */
function hasControlCharacter(value: string): boolean {
	for (const character of value) {
		const code = character.codePointAt(0) ?? 0
		if (code <= 0x1f || code === 0x7f) return true
	}
	return false
}

/**
 * Fully percent-decode one path segment, or `undefined` if it cannot be
 * decoded confidently.
 *
 * Returns `undefined` for malformed escapes (`%`, `%zz`) and for input still
 * decoding after `MAX_DECODE_ROUNDS`. A segment containing a literal `%` that
 * is not a valid escape is therefore rejected rather than passed through: this
 * app only ever requests `/api/me` and `/api/me/history`, so refusing an
 * ambiguous segment costs nothing and guessing could cost the credential.
 */
function decodeFully(segment: string): string | undefined {
	let current = segment
	for (let round = 0; round < MAX_DECODE_ROUNDS; round += 1) {
		if (!current.includes("%")) return current
		let next: string
		try {
			next = decodeURIComponent(current)
		} catch {
			return undefined
		}
		if (next === current) return current
		current = next
	}
	return undefined
}

/**
 * True when `requestTarget` — the literal request-target that will be written
 * to the upstream socket — addresses this observer's own account, and nothing
 * else.
 *
 * Accepts exactly `/api/me` and `/api/me/<segment>...`, with or without a query
 * string. Everything else is rejected, including `/api/members`, `/api/metrics`
 * and `/api/ME`: the first two segments are compared literally, so no encoding
 * of `api` or `me` can spell its way in either. Later segments are decoded to
 * exhaustion and rejected if they turn out to be empty, `.`, `..`, or to hide a
 * separator (`%2f`, `%5c`) or a control character — an encoded separator would
 * let the upstream re-split the path after this check had already passed it.
 *
 * The rule is reject-never-sanitize. Nothing here rewrites the path; an input
 * this function cannot vouch for produces `false`, and the caller sends no
 * credential.
 */
export function isObserverRequestTarget(requestTarget: string): boolean {
	// A fragment has no business in a request-target and would move the
	// path/query boundary, so its presence alone is disqualifying.
	if (requestTarget.includes("#")) return false

	const queryStart = requestTarget.indexOf("?")
	const path = queryStart === -1 ? requestTarget : requestTarget.slice(0, queryStart)
	// Backslash is a path separator to WHATWG URL parsing under a special
	// scheme, so it can rewrite the path downstream of this check.
	if (!path.startsWith("/") || path.includes("\\")) return false

	const segments = path.slice(1).split("/")
	if (segments[0] !== "api" || segments[1] !== "me") return false

	for (const segment of segments.slice(2)) {
		const decoded = decodeFully(segment)
		if (decoded === undefined) return false
		if (decoded === "" || decoded === "." || decoded === "..") return false
		if (decoded.includes("/") || decoded.includes("\\")) return false
		if (hasControlCharacter(decoded)) return false
	}
	return true
}

/**
 * True when the browser's own request URL may carry the credential.
 *
 * This is the second, stricter half of the boundary and it exists because
 * matching on the client-supplied URL alone is exactly the defect this replaced:
 * Vite selects a proxy entry from the raw `req.url`, but http-proxy forwards
 * `new URL(req.url, base).pathname`, which collapses `.`, `..`, `%2e%2e` and
 * `\` first. `/api/me/../official` therefore *matched* as an account route and
 * *arrived* at `/api/official`, credential attached.
 *
 * Rather than duplicate that normalization and hope the two agree, this demands
 * that normalization be a no-op: the literal path must already equal its
 * normalized form. Any URL whose meaning changes on the way to the wire is
 * refused, without needing to know what it would have changed into.
 */
export function shouldAttachCredential(requestUrl: string): boolean {
	const boundary = requestUrl.search(/[?#]/)
	const literalPath = boundary === -1 ? requestUrl : requestUrl.slice(0, boundary)

	let normalizedPath: string
	try {
		normalizedPath = new URL(requestUrl, NORMALIZATION_BASE).pathname
	} catch {
		return false
	}
	if (normalizedPath !== literalPath) return false

	return isObserverRequestTarget(requestUrl)
}

/**
 * Installs the credential boundary on one proxy instance.
 *
 * The header is attached in a `proxyReq` hook rather than declared in the proxy
 * table, and that placement is the whole point. A table entry's `headers` are
 * merged by http-proxy's `setupOutgoing` for whatever request the route matched,
 * and the route was matched against the *pre-normalization* URL — so a static
 * declaration can only ever be as accurate as a guess about the final path. By
 * the time `proxyReq` fires, `proxyReq.path` is the finished request-target, so
 * the decision is made on the bytes that actually go upstream. Routing, future
 * `rewrite` hooks, and http-proxy's own normalization cannot open a gap between
 * what was checked and what is sent, because there is nothing left to happen.
 *
 * The hook also strips any inbound `Authorization`, which buys a stronger and
 * far easier invariant to audit: an upstream request carries an `Authorization`
 * header if and only if this function put it there. No client-supplied header
 * can ride along, and no WebSocket upgrade can carry one, since nothing is
 * attached on the `proxyReqWs` path at all.
 *
 * Every failure mode ends with no header: an unset or empty secret, a request
 * URL that normalizes to something else, a final path that is not an account
 * route, or headers already flushed by the time the hook runs.
 */
function credentialBoundary(
	secret: string | undefined
): NonNullable<ProxyOptions["configure"]> {
	return (proxy) => {
		proxy.on("proxyReq", (proxyReq, request) => {
			try {
				proxyReq.removeHeader("authorization")
				if (secret === undefined || secret === "") return
				if (request.url === undefined) return
				if (!shouldAttachCredential(request.url)) return
				if (!isObserverRequestTarget(proxyReq.path)) return
				// Injected here, on the Node side, and nowhere else. The browser
				// never sees this value: it is not in the bundle, not in a VITE_
				// variable, and not in any file. With no secret configured the
				// upstream answers 401, which the UI treats as "no observer
				// identity" rather than as a failure.
				proxyReq.setHeader("Authorization", `Bearer ${secret}`)
			} catch {
				// Only reachable if the headers were already flushed, which makes
				// both calls above throw. Swallowing is safe in the direction that
				// matters: the credential was not attached, so the request goes
				// upstream anonymous rather than misdirected.
			}
		})
	}
}

/**
 * Exported for `web/vite.config.test.ts`, which drives this table through a real
 * Vite dev server against a local echo listener. That test asserts only whether
 * an `Authorization` header arrived, never its value, and uses a dummy secret.
 *
 * Note what is *not* here: no route is scoped to `/api/me`. Path scoping used to
 * live in a RegExp key and could not work there, because Vite matches keys
 * against the unnormalized URL. `credentialBoundary` owns the scoping now, which
 * also removes the ordering hazard the old table had — a `/api` entry listed
 * before the account entry silently disabled the credential entirely.
 */
export function buildForumProxy(
	secret: string | undefined,
	target: string = UPSTREAM
): Record<string, ProxyOptions> {
	const configure = credentialBoundary(secret)
	// A fresh options object per context: http-proxy normalizes `target` into a
	// URL on the instance it is handed, and sharing one object across three
	// instances would hand the later two an already-rewritten target.
	const route = (): ProxyOptions => ({ target, changeOrigin: true, configure })

	return {
		"/api": route(),
		"/treasury": route(),
		// text/plain, not JSON, and served from the origin root like /treasury.
		"/humans.txt": route(),
	}
}

// Read from the Node process, never from `import.meta.env`. The name is
// deliberately un-prefixed: anything called VITE_* is inlined into the client
// bundle by design, which for a Bearer secret would mean publishing it.
const forumProxy = buildForumProxy(process.env.AI_SPY_1F916_SECRET)

export default defineConfig({
	// The repo root is a Python package, so this config lives beside the app.
	// Vite resolves `root` from the shell's cwd rather than from the config file,
	// and every npm script runs from the repo root — without pinning it here the
	// dev server would look for index.html one directory too high.
	root: import.meta.dirname,
	plugins: [react()],
	server: { port: 5173, proxy: forumProxy },
	preview: { port: 4173, proxy: forumProxy },
	build: { outDir: "dist", emptyOutDir: true },
})
