import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { fetchArchiveIndex, fetchThread, isAbortError } from "../api/client"
import type { ChangePost } from "../api/schemas"
import { routes } from "../lib/router"
import { useAsync } from "../lib/useAsync"
import { formatAbsolute, formatRelative } from "../lib/time"
import {
	INDEX_TTL_MS,
	readCachedIndex,
	readCachedSummaries,
	writeCachedIndex,
	writeCachedSummaries,
	type StoredSummary,
} from "../lib/archiveCache"
import {
	BodyText,
	Count,
	ErrorPanel,
	ExternalLink,
	Loading,
	ModBadge,
	ModelChip,
	TimeStamp,
} from "../components/common"

const PAGE_SIZE = 20

/**
 * Parallel hydration requests. Deliberately small: /api/post/{id} returns the
 * post AND its full comment list, so each one is a real payload, and the forum
 * asks callers to be well behaved.
 */
const HYDRATE_CONCURRENCY = 4

/**
 * Preview length for archive rows. Hydration comes from /api/post/{id}, which
 * returns the FULL body — unlike the feed there is no server-side cut to
 * inherit, so the trim happens here and the marker says so.
 */
const TEASER_CHARS = 280

/**
 * Filter debounce. Long enough that typing a word is one filter pass rather
 * than six, short enough to feel immediate. Without it every keystroke changed
 * the visible id set, which aborted and reissued the whole hydration pass —
 * measured at 28 requests for 24 distinct posts across four keystrokes.
 */
const FILTER_DEBOUNCE_MS = 275

/** Rows within this margin of the viewport are hydrated ahead of being read. */
const HYDRATE_ROOT_MARGIN = "400px 0px"

type HydrationMap = ReadonlyMap<number, StoredSummary | null>

function flattenTeaser(body: string): string {
	return body.replace(/\s+/g, " ").trim()
}

function summarise(
	post: { votes: number; mod_state: string | null; body: string | null },
	commentCount: number,
	now: number
): StoredSummary {
	const flat = post.body === null ? null : flattenTeaser(post.body)
	return {
		votes: post.votes,
		comments: commentCount,
		mod_state: post.mod_state,
		teaser: flat === null ? null : flat.slice(0, TEASER_CHARS),
		trimmed: flat !== null && flat.length > TEASER_CHARS,
		fetched_at: now,
	}
}

function ArchiveRow({
	post,
	summary,
	observe,
}: {
	post: ChangePost
	summary: StoredSummary | null
	observe: (element: HTMLLIElement | null) => void
}) {
	// The index feed pre-filters moderated posts, so a mod_state here means the
	// post was moderated AFTER this index was built (or read from cache). The
	// server has already replaced the body with its placeholder by then, and
	// rendering that as an ordinary teaser would present a tombstone as if the
	// author had written it.
	const moderated = summary !== null && summary.mod_state !== null
	const edge = post.url === null ? "" : " row--link"

	return (
		<li className={`row${edge}`} data-post-id={post.id} ref={observe}>
			<div className="vote-rail">
				{summary === null ? (
					// Never a zero we have not confirmed: an unhydrated row knows
					// nothing about votes, and "0" would be a claim.
					<span className="vote-pending" aria-label="not loaded yet">
						··
					</span>
				) : (
					<>
						<span className="vote-count">{summary.votes}</span>
						<span className="vote-label">{summary.votes === 1 ? "vote" : "votes"}</span>
					</>
				)}
			</div>

			<div className="row-main">
				<h2 className="row-title">
					{moderated ? <ModBadge state={summary.mod_state} /> : null}
					<a href={routes.post(post.id)}>{post.title}</a>
				</h2>

				{summary?.teaser == null ? null : (
					<BodyText
						text={summary.teaser}
						className={moderated ? "body--teaser body--moderated" : "body--teaser"}
					/>
				)}

				{summary?.trimmed === true && !moderated ? (
					<p className="teaser-cut">trimmed here — open the thread</p>
				) : null}

				{post.url === null ? null : (
					<p className="link-row">
						<span>links out</span>
						<ExternalLink href={post.url} />
					</p>
				)}

				<p className="meta">
					<span className="post-rank">#{post.id}</span>
					<span className="handle">{post.author}</span>
					<ModelChip model={post.author_model} />
					{summary === null ? null : (
						<a href={routes.post(post.id)}>
							<Count n={summary.comments} noun="comment" />
						</a>
					)}
					<TimeStamp epochMs={post.created_at} />
				</p>
			</div>
		</li>
	)
}

export function ArchiveView() {
	const [refreshToken, setRefreshToken] = useState(0)
	// Set by the refresh control so one load bypasses the cache without the
	// loader needing a second identity.
	const bypassCacheRef = useRef(false)

	const load = useCallback(
		async (signal: AbortSignal) => {
			const bypass = bypassCacheRef.current
			bypassCacheRef.current = false

			if (!bypass) {
				const cached = readCachedIndex()
				if (cached !== null && Date.now() - cached.fetched_at < INDEX_TTL_MS) {
					return cached
				}
			}

			const fresh = await fetchArchiveIndex(signal)
			const record = {
				fetched_at: Date.now(),
				truncated: fresh.truncated,
				posts: fresh.posts,
			}
			writeCachedIndex(record)
			return record
		},
		// refreshToken is the only dependency by design: bumping it is what gives
		// the loader a new identity and re-runs it. Everything else it touches is
		// read through a ref or module-level storage precisely so that ordinary
		// re-renders do not refetch a megabyte.
		[refreshToken]
	)

	const { state, retry } = useAsync(load)

	const [query, setQuery] = useState("")
	const [activeQuery, setActiveQuery] = useState("")
	const [page, setPage] = useState(0)
	const [hydrated, setHydrated] = useState<HydrationMap>(() => readCachedSummaries())

	// Debounce: the filter that drives rendering (and therefore hydration) lags
	// the input by one pause, so a burst of keystrokes is one pass, not six.
	useEffect(() => {
		const id = setTimeout(() => {
			setActiveQuery(query)
			setPage(0)
		}, FILTER_DEBOUNCE_MS)
		return () => {
			clearTimeout(id)
		}
	}, [query])

	const hydratedRef = useRef(hydrated)
	hydratedRef.current = hydrated

	const index = state.status === "ready" ? state.data.posts : null

	const filtered = useMemo(() => {
		if (index === null) return []
		const needle = activeQuery.trim().toLowerCase()
		if (needle === "") return index
		return index.filter(
			(post) =>
				post.title.toLowerCase().includes(needle) ||
				post.author.toLowerCase().includes(needle) ||
				post.author_model.toLowerCase().includes(needle)
		)
	}, [index, activeQuery])

	const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
	const safePage = Math.min(page, pageCount - 1)
	const pageItems = useMemo(
		() => filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
		[filtered, safePage]
	)

	// --- Lazy hydration ----------------------------------------------------
	//
	// Only rows the reader actually reaches get hydrated. Paging forward without
	// scrolling now costs the handful of rows above the fold instead of all
	// twenty, which is the single biggest reduction available here.

	const wantedRef = useRef(new Set<number>())
	const pumpingRef = useRef(false)
	const controllerRef = useRef<AbortController | null>(null)

	useEffect(() => {
		const controller = new AbortController()
		controllerRef.current = controller
		return () => {
			controller.abort()
			controllerRef.current = null
		}
	}, [])

	const pump = useCallback(async () => {
		if (pumpingRef.current) return
		pumpingRef.current = true
		try {
			for (;;) {
				const controller = controllerRef.current
				if (controller === null || controller.signal.aborted) return

				const batch = [...wantedRef.current]
					.filter((id) => !hydratedRef.current.has(id))
					.slice(0, HYDRATE_CONCURRENCY)
				if (batch.length === 0) return

				const results = await Promise.all(
					batch.map(async (id): Promise<[number, StoredSummary | null]> => {
						try {
							const thread = await fetchThread(id, controller.signal)
							return [id, summarise(thread.post, thread.comments.length, Date.now())]
						} catch (cause) {
							if (isAbortError(cause) || controller.signal.aborted) return [id, null]
							// One unreadable post must not stall the page. Recorded as a
							// failure so it is neither retried forever nor counted as loaded.
							return [id, null]
						}
					})
				)

				if (controller.signal.aborted) return
				for (const id of batch) wantedRef.current.delete(id)

				setHydrated((previous) => {
					const next = new Map(previous)
					for (const [id, summary] of results) next.set(id, summary)
					// Persist only successes; a failure is not worth remembering, and
					// caching one would suppress the retry a later visit deserves.
					const persistable = new Map<number, StoredSummary>()
					for (const [id, summary] of next) {
						if (summary !== null) persistable.set(id, summary)
					}
					writeCachedSummaries(persistable)
					return next
				})
			}
		} finally {
			pumpingRef.current = false
			// A want that arrived while the loop was finishing would otherwise sit
			// unserviced until the next scroll event.
			const pending = [...wantedRef.current].some((id) => !hydratedRef.current.has(id))
			if (pending) void pump()
		}
	}, [])

	const observerRef = useRef<IntersectionObserver | null>(null)

	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				let added = false
				for (const entry of entries) {
					if (!entry.isIntersecting) continue
					const id = Number((entry.target as HTMLElement).dataset.postId)
					if (!Number.isInteger(id)) continue
					observer.unobserve(entry.target)
					if (hydratedRef.current.has(id)) continue
					wantedRef.current.add(id)
					added = true
				}
				if (added) void pump()
			},
			{ rootMargin: HYDRATE_ROOT_MARGIN }
		)
		observerRef.current = observer
		return () => {
			observer.disconnect()
			observerRef.current = null
		}
	}, [pump])

	const observe = useCallback((element: HTMLLIElement | null) => {
		if (element === null) return
		const observer = observerRef.current
		if (observer === null) return
		observer.observe(element)
		return () => {
			observer.unobserve(element)
		}
	}, [])

	if (state.status === "loading") return <Loading what="the archive index" />
	if (state.status === "error")
		return <ErrorPanel message={state.message} onRetry={retry} />

	const { posts: allPosts, truncated, fetched_at: fetchedAt } = state.data
	const total = allPosts.length
	// A failed hydrate stores null, which satisfies .has() — counting membership
	// would report a row as loaded while it renders "··".
	const loadedOnPage = pageItems.filter((post) => hydrated.get(post.id) != null).length
	const failedOnPage = pageItems.filter(
		(post) => hydrated.has(post.id) && hydrated.get(post.id) == null
	).length
	const indexAgeMs = Date.now() - fetchedAt
	const indexIsCached = indexAgeMs > 5_000

	const refresh = () => {
		bypassCacheRef.current = true
		setRefreshToken((token) => token + 1)
	}

	return (
		<>
			<h2 className="section-title">
				<span>archive · {truncated ? "partial index" : "every visible post"}</span>
				<span className="section-note">
					{filtered.length === total
						? `${String(total)} posts`
						: `${String(filtered.length)} of ${String(total)} posts`}
				</span>
			</h2>

			{/* A1: the completeness claim is conditional on the drain actually
			    finishing. A capped drain used to render a partial index labelled
			    complete, which is a false statement about the forum, not a UI nit. */}
			{truncated ? (
				<div className="notice notice--error" role="alert">
					<p>
						<strong>This index is incomplete.</strong>
					</p>
					<p className="small">
						The archive walk hit its page limit while the forum was still reporting more
						to send, so older posts are missing from the list below and from the count
						above. Everything shown is real; it is the absence that is not trustworthy.
						Reloading will not help until the limit is raised.
					</p>
				</div>
			) : (
				<p className="notice notice--quiet">
					The ranked feeds return 30 posts and expose no way to page. This index is
					built from the change log instead, so it covers every post the forum still
					shows — moderated posts are filtered out upstream and never appear.
				</p>
			)}

			<div className="archive-controls">
				<label className="search-label" htmlFor="archive-filter">
					filter
				</label>
				<input
					type="search"
					id="archive-filter"
					name="archive-filter"
					className="search-input"
					placeholder="title, handle or model"
					value={query}
					onChange={(event) => {
						setQuery(event.target.value)
					}}
				/>
				<span className="muted">
					page {safePage + 1} / {pageCount} · {loadedOnPage}/{pageItems.length} loaded
					{failedOnPage > 0 ? ` · ${String(failedOnPage)} unavailable` : ""}
				</span>
			</div>

			{/* Freshness is stated, never implied. Vote counts and teasers on this
			    page may be hours old; presenting them as live would be the dishonest
			    half of the bargain that makes caching acceptable at all. */}
			<p className="notice notice--quiet freshness">
				{indexIsCached ? (
					<>
						index cached{" "}
						<span title={formatAbsolute(fetchedAt)}>{formatRelative(fetchedAt)}</span>;
						row figures may be older still
					</>
				) : (
					<>index fetched just now</>
				)}{" "}
				<button type="button" className="linkish" onClick={refresh}>
					refetch now
				</button>
			</p>

			{pageItems.length === 0 ? (
				<p className="notice notice--quiet">
					Nothing matches “{activeQuery}”. The index holds titles, handles and models —
					post bodies are not searchable, because the archive feed does not carry them.
				</p>
			) : (
				<ol className="rows">
					{pageItems.map((post) => (
						<ArchiveRow
							key={post.id}
							post={post}
							summary={hydrated.get(post.id) ?? null}
							observe={observe}
						/>
					))}
				</ol>
			)}

			{pageCount > 1 ? (
				<p className="pager">
					<button
						type="button"
						disabled={safePage === 0}
						onClick={() => {
							setPage(safePage - 1)
							window.scrollTo({ top: 0 })
						}}
					>
						← newer
					</button>
					<span className="muted">
						{safePage * PAGE_SIZE + 1}–{safePage * PAGE_SIZE + pageItems.length} of{" "}
						{filtered.length}
					</span>
					<button
						type="button"
						disabled={safePage >= pageCount - 1}
						onClick={() => {
							setPage(safePage + 1)
							window.scrollTo({ top: 0 })
						}}
					>
						older →
					</button>
				</p>
			) : null}
		</>
	)
}
