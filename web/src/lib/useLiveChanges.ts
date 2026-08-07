import { useCallback, useEffect, useRef, useState } from "react"

import { fetchChanges, isAbortError } from "../api/client"

/** How often to ask the forum what it has produced. */
const POLL_INTERVAL_MS = 60_000

/**
 * Pages drained per tick. `has_more` means the server capped the page (200
 * posts / 500 comments), so draining is how a burst is counted rather than
 * silently truncated. The cap keeps a long backlog — or a server that never
 * stops saying has_more — from turning one tick into an unbounded request loop.
 * Any remainder is not lost: the cursor still advanced, so the next tick
 * resumes exactly where this one stopped.
 */
const MAX_PAGES_PER_TICK = 5

export interface ChangeCounts {
	posts: number
	comments: number
}

const NO_CHANGES: ChangeCounts = { posts: 0, comments: 0 }

export interface LiveChanges {
	counts: ChangeCounts
	/** Call after refetching the underlying view to clear the banner. */
	reset: () => void
}

/**
 * Counts forum activity that happened after the reader arrived.
 *
 * The cursor starts at Date.now() rather than at zero or at the newest row in
 * view: this is a "what changed while you were watching" indicator, not a
 * backfill, and starting in the past would open with a banner announcing
 * history the reader never missed.
 *
 * Polling pauses while the tab is hidden. A background tab that keeps polling
 * spends the reader's battery and the forum's request budget to compute a
 * number nobody is looking at; on return, one immediate tick catches up in a
 * single request because the cursor covers the whole gap.
 */
export function useLiveChanges(enabled: boolean): LiveChanges {
	const [counts, setCounts] = useState<ChangeCounts>(NO_CHANGES)

	// Refs, not state: advancing the cursor must never itself trigger a render,
	// and the polling effect must not tear down and restart every tick.
	const cursorRef = useRef<number | null>(null)
	const inFlightRef = useRef(false)

	const reset = useCallback(() => {
		setCounts(NO_CHANGES)
	}, [])

	useEffect(() => {
		if (!enabled) return

		const controller = new AbortController()
		cursorRef.current ??= Date.now()

		const tick = async () => {
			// Guard re-entry: a slow response must not overlap the next interval
			// or a manual visibility-triggered tick, which would double-count.
			if (inFlightRef.current || document.hidden) return
			inFlightRef.current = true
			try {
				let drained = 0
				let posts = 0
				let comments = 0
				let hasMore = true

				while (hasMore && drained < MAX_PAGES_PER_TICK) {
					const cursor = cursorRef.current
					if (cursor === null) break
					const page = await fetchChanges(cursor, controller.signal)
					if (controller.signal.aborted) return

					posts += page.posts.length
					comments += page.comments.length
					// Advance to next_since, never to now or to the newest row seen.
					// A capped page is a clean prefix; stepping past its tail would
					// permanently skip every row the cap left behind.
					cursorRef.current = page.next_since
					hasMore = page.has_more
					drained += 1
				}

				if (posts > 0 || comments > 0) {
					setCounts((previous) => ({
						posts: previous.posts + posts,
						comments: previous.comments + comments,
					}))
				}
			} catch (cause) {
				// A poll is best-effort background work. A transient failure must
				// not replace the feed the reader is looking at with an error, and
				// the cursor is unchanged, so the next tick simply retries the
				// same window.
				if (!isAbortError(cause) && !controller.signal.aborted) {
					console.warn("ai-spy: live-change poll failed", cause)
				}
			} finally {
				inFlightRef.current = false
			}
		}

		const interval = setInterval(() => {
			void tick()
		}, POLL_INTERVAL_MS)

		const onVisibilityChange = () => {
			if (!document.hidden) void tick()
		}
		document.addEventListener("visibilitychange", onVisibilityChange)

		return () => {
			clearInterval(interval)
			document.removeEventListener("visibilitychange", onVisibilityChange)
			controller.abort()
			inFlightRef.current = false
		}
	}, [enabled])

	return { counts, reset }
}
