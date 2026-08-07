import { z } from "zod"

import { changePostSchema, type ChangePost } from "../api/schemas"

/**
 * Persistent cache for the archive view.
 *
 * ai-spy exists to watch a small volunteer-run forum without being a burden on
 * it, and the archive is by far the most expensive thing it does: one index
 * drain moves well over a megabyte to obtain a few hundred headlines, and every
 * hydrated row pulls a whole thread to read a vote count off it. Neither cost
 * is avoidable per request — the upstream exposes no projection parameter — so
 * the only honest lever left is to stop paying them again on every visit.
 *
 * Two TTLs, because the two things age differently. The index is a membership
 * list: new posts appear at roughly one per citizen per day, so ten minutes of
 * staleness is invisible. Row summaries are vote counts and teasers, which
 * drift slowly and matter little if they lag, so they keep for hours.
 *
 * The bargain this makes is that numbers on screen may be minutes or hours old.
 * That is only acceptable because the view says so — see the freshness readout
 * in ArchiveView. Cached figures must never be presented as live.
 */

const INDEX_KEY = "ai-spy:archive:index"
const SUMMARY_KEY = "ai-spy:archive:summaries"

export const INDEX_TTL_MS = 10 * 60_000
export const SUMMARY_TTL_MS = 6 * 60 * 60_000

const cachedIndexSchema = z.object({
	fetched_at: z.number(),
	truncated: z.boolean(),
	posts: z.array(changePostSchema),
})

export type CachedIndex = z.infer<typeof cachedIndexSchema>

/**
 * Display-ready row summary. The teaser is stored already flattened and cut, so
 * the cache holds what the screen needs rather than whole post bodies — it
 * keeps a few hundred rows comfortably inside the storage quota.
 */
const summarySchema = z.object({
	votes: z.number(),
	comments: z.number(),
	mod_state: z.string().nullable(),
	teaser: z.string().nullable(),
	trimmed: z.boolean(),
	fetched_at: z.number(),
})

export type StoredSummary = z.infer<typeof summarySchema>

const summaryMapSchema = z.record(z.string(), summarySchema)

/**
 * Every access is wrapped: localStorage throws rather than returning null in
 * Safari private mode and under some enterprise policies, and an archive that
 * crashes when storage is unavailable would be a worse failure than one that
 * simply refetches.
 */
function readRaw(key: string): unknown {
	let raw: string | null
	try {
		raw = window.localStorage.getItem(key)
	} catch {
		return null
	}
	if (raw === null) return null
	try {
		return JSON.parse(raw) as unknown
	} catch {
		// Corrupt entry is treated as absent: the cost is one refetch, and a
		// stored value we cannot read is not evidence about anything.
		return null
	}
}

function writeRaw(key: string, value: unknown): void {
	try {
		window.localStorage.setItem(key, JSON.stringify(value))
	} catch {
		// Quota exceeded or storage blocked. The app is fully functional without
		// the cache, so there is nothing to report and nothing to retry.
	}
}

export function readCachedIndex(): CachedIndex | null {
	const parsed = cachedIndexSchema.safeParse(readRaw(INDEX_KEY))
	return parsed.success ? parsed.data : null
}

export function writeCachedIndex(index: CachedIndex): void {
	writeRaw(INDEX_KEY, index)
}

/** Expired entries are dropped on read, so callers never see a stale summary. */
export function readCachedSummaries(
	now: number = Date.now()
): Map<number, StoredSummary> {
	const parsed = summaryMapSchema.safeParse(readRaw(SUMMARY_KEY))
	const out = new Map<number, StoredSummary>()
	if (!parsed.success) return out

	for (const [key, summary] of Object.entries(parsed.data)) {
		const id = Number(key)
		if (!Number.isInteger(id)) continue
		if (now - summary.fetched_at > SUMMARY_TTL_MS) continue
		out.set(id, summary)
	}
	return out
}

export function writeCachedSummaries(
	summaries: ReadonlyMap<number, StoredSummary>
): void {
	const record: Record<string, StoredSummary> = {}
	for (const [id, summary] of summaries) record[String(id)] = summary
	writeRaw(SUMMARY_KEY, record)
}

export function clearArchiveCache(): void {
	try {
		window.localStorage.removeItem(INDEX_KEY)
		window.localStorage.removeItem(SUMMARY_KEY)
	} catch {
		// Already unreachable to us.
	}
}

export type { ChangePost }
