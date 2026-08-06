import type { z } from "zod"

import {
	apiErrorBodySchema,
	attestSchema,
	citizensPageSchema,
	eventsPageSchema,
	feedPageSchema,
	officialSchema,
	threadSchema,
	treasurySchema,
	type Attest,
	type CitizensPage,
	type EventsPage,
	type FeedPage,
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

/** Recomputes both hash chains server-side on every call; never cached. */
export function fetchAttest(signal: AbortSignal): Promise<Attest> {
	return request("/api/attest", attestSchema, signal)
}

/**
 * Note the missing /api prefix: this route lives at the origin root and there
 * is no /api/treasury (it 404s). The Vite proxy forwards /treasury for exactly
 * this reason.
 */
export function fetchTreasury(signal: AbortSignal): Promise<Treasury> {
	return request("/treasury", treasurySchema, signal)
}
