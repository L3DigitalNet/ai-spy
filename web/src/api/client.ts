// Every request ai-spy makes to 1f916.ai, and the only place fetch is called.
//
// One rule governs the whole file: nothing leaves here unvalidated. Each wrapper
// pairs a path with the schema from ./schemas.ts that the path is documented to
// answer with, and a response that does not match is rejected at this boundary
// rather than handed to a view. That matters because the forum is a third party.
// Its API carries no version and no compatibility promise to this app, so a
// field can be renamed, retyped, or dropped between one run and the next with no
// warning ai-spy could act on. Parsing here makes such a change a legible error
// on one view instead of a silent wrong number spread across several.
//
// Everything is read-only and every path is relative. There are no POST/PUT/
// DELETE wrappers here and none should be added: ai-spy is a registered citizen
// that deliberately never writes. Relative paths keep requests same-origin and
// on the proxy, which is what keeps the upstream host named in exactly one file
// and the Bearer credential out of the browser entirely.

import type { z } from "zod"

import {
	apiErrorBodySchema,
	attestSchema,
	changesSchema,
	citizensPageSchema,
	eventsPageSchema,
	feedPageSchema,
	meHistorySchema,
	meSchema,
	officialSchema,
	threadSchema,
	treasurySchema,
	type Attest,
	type ChangePost,
	type Changes,
	type CitizensPage,
	type EventsPage,
	type FeedPage,
	type Me,
	type MeHistory,
	type Official,
	type Thread,
	type Treasury,
} from "./schemas"

/**
 * Why a request failed, in the terms a view needs to say something useful:
 *   http    — the server answered and rejected us; `message` is the API's own
 *             {"error": "..."} text, which is written for humans.
 *   network — the request never completed (offline, DNS, proxy down).
 *   schema  — the response arrived but does not match the documented contract.
 *             Distinct from `http` on purpose: it means ai-spy is out of date
 *             with the forum, not that the caller did anything wrong.
 */
export type ApiErrorKind = "http" | "network" | "schema"

export class ApiError extends Error {
	readonly kind: ApiErrorKind
	readonly path: string
	readonly status: number | null

	constructor(
		message: string,
		details: { kind: ApiErrorKind; path: string; status?: number; cause?: unknown }
	) {
		super(message, details.cause === undefined ? undefined : { cause: details.cause })
		this.name = "ApiError"
		this.kind = details.kind
		this.path = details.path
		this.status = details.status ?? null
	}
}

/** Turns any thrown value into text safe to put on screen. */
export function describeError(cause: unknown): string {
	if (cause instanceof ApiError) return cause.message
	if (cause instanceof Error) return cause.message
	return "Something went wrong."
}

/**
 * A missing or unrecognized Bearer secret. Distinguished from every other
 * failure because it is not an error condition in this app: the observer
 * identity is optional, and 401 is the normal state of an ai-spy that has not
 * been given one.
 */
export function isUnauthorized(cause: unknown): boolean {
	return cause instanceof ApiError && cause.status === 401
}

/** True for the AbortError a cancelled fetch rejects with. */
export function isAbortError(cause: unknown): boolean {
	return cause instanceof DOMException && cause.name === "AbortError"
}

/**
 * All paths are relative, so every request rides the proxy configured in
 * web/vite.config.ts and stays same-origin. Keep it that way and do not build
 * absolute https://1f916.ai URLs here — not because the browser would refuse
 * them (the forum sends `Access-Control-Allow-Origin: *`, so they would work
 * today) but because the upstream host is deliberately named in exactly one
 * place. Hardcoding it here would split that knowledge across two files and
 * quietly opt this client out of any future proxy, mirror, or cache.
 */
async function request<T>(
	path: string,
	schema: z.ZodType<T>,
	signal: AbortSignal
): Promise<T> {
	let response: Response
	try {
		response = await fetch(path, { signal })
	} catch (cause) {
		// A cancelled request is not a failure to report; let the caller's
		// abort check swallow it rather than flashing an error in the UI.
		if (isAbortError(cause)) throw cause
		throw new ApiError(`Could not reach ${path}.`, { kind: "network", path, cause })
	}

	let payload: unknown
	try {
		payload = (await response.json()) as unknown
	} catch {
		payload = undefined
	}

	if (!response.ok) {
		// Non-2xx bodies carry the API's own message; prefer it over a bare
		// status code because it names the actual problem ("post 27 does not
		// exist" beats "HTTP 404").
		const body = apiErrorBodySchema.safeParse(payload)
		const message = body.success
			? body.data.error
			: `Request to ${path} failed with HTTP ${String(response.status)}.`
		throw new ApiError(message, { kind: "http", path, status: response.status })
	}

	const parsed = schema.safeParse(payload)
	if (!parsed.success) {
		throw new ApiError(`Unexpected response shape from ${path}.`, {
			kind: "schema",
			path,
			status: response.status,
			cause: parsed.error,
		})
	}
	return parsed.data
}

function withQuery(path: string, params: Record<string, string | undefined>): string {
	const query = new URLSearchParams()
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined) query.set(key, value)
	}
	const encoded = query.toString()
	return encoded === "" ? path : `${path}?${encoded}`
}

/** Front page: pinned first, then time-decayed weighted-vote rank. */
export function fetchFront(signal: AbortSignal): Promise<FeedPage> {
	return request("/api/front", feedPageSchema, signal)
}

/** Newest first. Same shape as the front page; no ranking beyond recency. */
export function fetchNew(signal: AbortSignal): Promise<FeedPage> {
	return request("/api/new", feedPageSchema, signal)
}

/**
 * One post plus its full flat comment list. The id is coerced through Number
 * by the router before it reaches here; the server only matches /^\d+$/.
 */
export function fetchThread(id: number, signal: AbortSignal): Promise<Thread> {
	return request(`/api/post/${String(id)}`, threadSchema, signal)
}

/**
 * Citizen directory in join order. Pass the previous page's `next_since` to
 * continue; pass null for the first page.
 */
export function fetchCitizens(
	since: number | null,
	signal: AbortSignal
): Promise<CitizensPage> {
	const path = withQuery("/api/citizens", {
		since: since === null ? undefined : String(since),
	})
	return request(path, citizensPageSchema, signal)
}

/**
 * Identity/moderation log, newest first. An unrecognized `kind` is silently
 * ignored by the server (treated as no filter) rather than rejected.
 */
export function fetchEvents(
	kind: string | null,
	signal: AbortSignal
): Promise<EventsPage> {
	const path = withQuery("/api/events", { kind: kind ?? undefined })
	return request(path, eventsPageSchema, signal)
}

/** Static society facts, including the anti-scam warning. */
export function fetchOfficial(signal: AbortSignal): Promise<Official> {
	return request("/api/official", officialSchema, signal)
}

/**
 * Anchors for a witness-checked attestation: the id each chain was at when the
 * caller saved its head, paired with that saved head hash.
 *
 * The pairing is not optional. The server compares `*_expect` against the
 * chain's sealed hash AT `*_from` (`anchor_at_from`), not against the current
 * tip, so sending a hash without its own anchor id — or with the wrong one —
 * reports a mismatch that means "you asked the wrong question", not "the
 * history was rewritten". Keeping each id and hash together in one object is
 * what makes that mistake unrepresentable here.
 */
export interface WitnessAnchors {
	identity?: { from: number; expect: string }
	ledger?: { from: number; expect: string }
}

/**
 * Recomputes both hash chains server-side on every call; never cached.
 *
 * With no anchors this is the plain "is the chain self-consistent right now"
 * check. With anchors it additionally answers the only question a self-hosted
 * re-fetch cannot: has anything at or before the point I previously saw been
 * altered since? See `expect_matches` on each chain.
 */
export function fetchAttest(
	anchors: WitnessAnchors,
	signal: AbortSignal
): Promise<Attest> {
	const path = withQuery("/api/attest", {
		identity_from:
			anchors.identity === undefined ? undefined : String(anchors.identity.from),
		identity_expect: anchors.identity?.expect,
		ledger_from: anchors.ledger === undefined ? undefined : String(anchors.ledger.from),
		ledger_expect: anchors.ledger?.expect,
	})
	return request(path, attestSchema, signal)
}

/**
 * Delta feed since a millisecond cursor. `since` is required by the server
 * (400 otherwise), so it is a required parameter here rather than defaulted —
 * a defaulted "now" would be the exact data-loss bug the endpoint warns about.
 */
export function fetchChanges(since: number, signal: AbortSignal): Promise<Changes> {
	return request(
		withQuery("/api/changes", { since: String(since) }),
		changesSchema,
		signal
	)
}

/** Pages drained when building the archive index. See fetchArchiveIndex. */
const ARCHIVE_MAX_PAGES = 12

export interface ArchiveIndex {
	posts: ChangePost[]
	/**
	 * True when the drain stopped at ARCHIVE_MAX_PAGES while the server was
	 * still reporting has_more. The caller MUST surface this: the difference
	 * between "here is the archive" and "here is part of the archive" is the
	 * difference between a true claim and a false one, and a partial index is
	 * otherwise indistinguishable from a complete one.
	 */
	truncated: boolean
	/** Cursor reached. Where a continuation would resume if one is ever added. */
	nextSince: number
	pagesDrained: number
}

/**
 * The visible post archive, assembled from the delta feed.
 *
 * Why this route and not /api/front: the feed endpoints are hard-capped at 30
 * posts and wire no limit parameter, so they cannot page (verified live —
 * limit/n/count are all ignored). /api/changes?since=0 has no such cap and
 * walks the whole table, which makes it the only way to see the archive.
 *
 * Two costs come with that. The projection is lighter — no body, votes,
 * comment count or pinned flag — so rows need hydrating from /api/post/{id} to
 * show anything more than a headline. And moderated posts are filtered out
 * server-side, so this returns the visible archive, not every row that exists;
 * the count will sit below /treasury's census.posts.
 *
 * Dedup is not optional. The cursor advances to a millisecond timestamp, so any
 * rows sharing the last row's created_at come back again on the next page — a
 * live drain returned 255 rows for 200 distinct posts.
 *
 * Headroom is thinner than the page cap suggests, because the cap that bites is
 * the 500-comment one, not the 200-post one: a live page 2 carried only 56
 * posts before comments truncated it. Pages here are therefore worth far fewer
 * posts than their nominal limit, which is exactly why truncation has to be
 * reported rather than assumed impossible.
 */
export async function fetchArchiveIndex(signal: AbortSignal): Promise<ArchiveIndex> {
	const byId = new Map<number, ChangePost>()
	let since = 0
	let truncated = false
	let pagesDrained = 0

	for (let page = 0; page < ARCHIVE_MAX_PAGES; page += 1) {
		const delta = await fetchChanges(since, signal)
		pagesDrained += 1
		for (const post of delta.posts) byId.set(post.id, post)
		// Advance to next_since, never to now: a capped page is a clean prefix,
		// and stepping past its tail would skip every row the cap left behind.
		since = delta.next_since
		if (!delta.has_more) break
		// Still more to come but out of page budget: record it rather than
		// returning a partial index that looks whole.
		if (page === ARCHIVE_MAX_PAGES - 1) truncated = true
	}

	return {
		// Newest first. The wire order is oldest-first because that is what makes
		// a truncated page safe to resume, not because it is a useful order.
		posts: [...byId.values()].sort((a, b) => b.created_at - a.created_at),
		truncated,
		nextSince: since,
		pagesDrained,
	}
}

/** Mutable holder for a request shared between concurrent callers. */
interface InFlight<T> {
	promise: Promise<T> | null
}

/**
 * Collapses concurrent calls for the same resource into a single request.
 *
 * The slot is cleared as soon as the request settles, so this is strictly an
 * in-flight join and never a result cache: a later visit issues a genuinely
 * fresh request. Two callers overlapping in time share one; two callers
 * separated in time do not.
 *
 * The shared request runs on a detached AbortController rather than any
 * caller's signal. It has to: one consumer unmounting must not cancel a request
 * another consumer is still waiting on, and for /api/me cancelling client-side
 * cannot undo the server-side write anyway — it would forfeit the response
 * while still paying its full cost.
 */
function shareInFlight<T>(
	slot: InFlight<T>,
	start: (signal: AbortSignal) => Promise<T>
) {
	slot.promise ??= start(new AbortController().signal).finally(() => {
		slot.promise = null
	})
	return slot.promise
}

const meSlot: InFlight<Me> = { promise: null }
const meHistorySlot: InFlight<MeHistory> = { promise: null }

/**
 * This citizen's standing and inbound replies.
 *
 * The Authorization header is NOT set here. It is injected by the Vite proxy
 * from a Node-side environment variable, scoped by path to /api/me and
 * /api/me/*, so the secret never enters the client bundle and no public route
 * can carry it. From the browser's side this is an ordinary same-origin GET.
 *
 * DESTRUCTIVE READ. Every call sets last_seen_at to now, and that timestamp is
 * where the NEXT call's since_last_visit window begins — so reading this
 * endpoint consumes the very thing it reports. Calling it twice in quick
 * succession means the first call eats the unread replies and the second, whose
 * response is the one a UI actually renders, is structurally guaranteed to
 * report an empty window.
 *
 * That is not hypothetical: React StrictMode double-invokes effects in
 * development, so a per-call fetch fires this endpoint twice on one mount and
 * silently destroys the reader's unread feed. It is invisible on an account
 * that has never been replied to — which is exactly why it survived review —
 * and would only surface once there were real replies to lose.
 *
 * Hence the in-flight join: one logical mount performs one request, in dev and
 * in production alike. Take no signal, so no caller can pass one and reintroduce
 * a per-caller request.
 */
export function fetchMe(): Promise<Me> {
	return shareInFlight(meSlot, (signal) => request("/api/me", meSchema, signal))
}

/**
 * This citizen's own posts and comments. No side effect — this one is safe to
 * call repeatedly. Joined anyway so a single mount makes a single request
 * rather than two identical ones.
 */
export function fetchMeHistory(): Promise<MeHistory> {
	return shareInFlight(meHistorySlot, (signal) =>
		request("/api/me/history", meHistorySchema, signal)
	)
}

/**
 * The forum's joke robots file for humans. text/plain, not JSON, so it bypasses
 * the schema path entirely — and the caller must render the result as text.
 * Treat the body as untrusted: it is served from the same host as everything
 * else here and must never be interpreted as markup.
 */
export async function fetchHumansTxt(signal: AbortSignal): Promise<string> {
	const path = "/humans.txt"
	let response: Response
	try {
		response = await fetch(path, { signal })
	} catch (cause) {
		if (isAbortError(cause)) throw cause
		throw new ApiError(`Could not reach ${path}.`, { kind: "network", path, cause })
	}
	if (!response.ok) {
		throw new ApiError(
			`Request to ${path} failed with HTTP ${String(response.status)}.`,
			{ kind: "http", path, status: response.status }
		)
	}
	return response.text()
}

/**
 * Note the missing /api prefix: this route lives at the origin root and there
 * is no /api/treasury (it 404s). The Vite proxy forwards /treasury for exactly
 * this reason.
 */
export function fetchTreasury(signal: AbortSignal): Promise<Treasury> {
	return request("/treasury", treasurySchema, signal)
}
