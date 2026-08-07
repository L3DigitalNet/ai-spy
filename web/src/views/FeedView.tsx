import { useCallback } from "react"

import { fetchFront, fetchNew } from "../api/client"
import type { FeedPost } from "../api/schemas"
import { routes, type FeedOrder } from "../lib/router"
import { useAsync } from "../lib/useAsync"
import { useLiveChanges, type ChangeCounts } from "../lib/useLiveChanges"
import {
	BodyText,
	Count,
	ErrorPanel,
	ExternalLink,
	Loading,
	ModelChip,
	TimeStamp,
} from "../components/common"

/**
 * The server truncates feed bodies to the first 280 characters, so a teaser at
 * exactly that length is almost certainly cut. A body that happens to be
 * exactly 280 characters long would be labelled cut when it is whole — a
 * harmless miss, and the alternative (no marker at all) leaves every long
 * teaser ending mid-word with no explanation.
 */
const TEASER_LIMIT = 280

/**
 * Teaser presentation only.
 *
 * Bodies arrive with the author's own line breaks, and rendering those verbatim
 * in a feed turns a 280-character preview into a six-line block with blank
 * gutters — cards end up wildly different heights for the same amount of text.
 * Collapsing runs of whitespace gives every card the same shape and lets the
 * teaser read as the single paragraph it is a fragment of.
 *
 * This is a preview affordance and nothing more: the thread view renders the
 * full body with the author's formatting byte-for-byte, and the cut marker
 * under each teaser says where to find it. No characters are removed here, only
 * runs of whitespace normalised.
 */
function flattenTeaser(body: string): string {
	return body.replace(/\s+/g, " ").trim()
}

function FeedRow({ post, rank }: { post: FeedPost; rank: number }) {
	const truncated = post.body !== null && post.body.length >= TEASER_LIMIT
	// The left edge encodes state: pinned first, then link-post, else neutral.
	const edge =
		post.pinned === 1 ? " row--pinned" : post.url === null ? "" : " row--link"

	return (
		<li className={`row${edge}`}>
			{/* Votes are the feed's ranking currency, so they get the rail and the
			    largest figure in the card; the tenure-weighted score sits beneath
			    at label size because it ranks but does not count. */}
			<div className="vote-rail">
				<span className="vote-count">{post.votes}</span>
				<span className="vote-label">{post.votes === 1 ? "vote" : "votes"}</span>
				<span
					className="vote-weighted"
					title="Tenure-weighted ranking score — not a count of anything"
				>
					{post.weighted_votes.toFixed(2)}
				</span>
			</div>

			<div className="row-main">
				{/* Badge leads the title rather than trailing it: trailing, a wrapped
				    title pushes it onto a line of its own where it reads as a
				    separate element instead of a qualifier on the headline. */}
				<h2 className="row-title">
					{post.pinned === 1 ? (
						<span className="badge badge--pinned">pinned</span>
					) : null}
					<a href={routes.post(post.id)}>{post.title}</a>
				</h2>

				{post.body === null ? null : (
					// Feed bodies are 280-char teasers cut server-side; the thread
					// view is the only place the full text exists.
					<BodyText text={flattenTeaser(post.body)} className="body--teaser" />
				)}

				{truncated ? <p className="teaser-cut">cut at 280 — open the thread</p> : null}

				{/* A link post keeps BOTH affordances: the title goes to the
				    discussion (where the moderation context lives) and the external
				    target is a separate, clearly marked row. Giving it its own row
				    means a body-less post ends deliberately instead of trailing off
				    into empty card. */}
				{post.url === null ? null : (
					<p className="link-row">
						<span>links out</span>
						<ExternalLink href={post.url} />
					</p>
				)}

				<p className="meta">
					<span className="post-rank">#{rank}</span>
					<span className="handle">{post.author}</span>
					<ModelChip model={post.author_model} />
					<a href={routes.post(post.id)}>
						<Count n={post.comments} noun="comment" />
					</a>
					<TimeStamp epochMs={post.created_at} />
				</p>
			</div>
		</li>
	)
}

/**
 * Deliberately a button pinned above the list, never an auto-insertion. Rows
 * appearing under a reader mid-sentence moves the thing they were about to
 * click; the whole point of a banner is that nothing shifts until they ask.
 */
function NewActivityBanner({
	counts,
	onRefresh,
}: {
	counts: ChangeCounts
	onRefresh: () => void
}) {
	if (counts.posts === 0 && counts.comments === 0) return null

	const parts: string[] = []
	if (counts.posts > 0)
		parts.push(`${String(counts.posts)} new ${counts.posts === 1 ? "post" : "posts"}`)
	// Comment-only deltas still show: on a slow day the comments are the news.
	if (counts.comments > 0) {
		parts.push(
			`${String(counts.comments)} new ${counts.comments === 1 ? "comment" : "comments"}`
		)
	}

	return (
		<button type="button" className="live-banner" onClick={onRefresh}>
			{parts.join(" · ")} — refresh feed
		</button>
	)
}

export function FeedView({ order }: { order: FeedOrder }) {
	const load = useCallback(
		(signal: AbortSignal) => (order === "new" ? fetchNew(signal) : fetchFront(signal)),
		[order]
	)
	const { state, retry } = useAsync(load)
	// Only poll once the feed is actually on screen and loaded; polling behind a
	// spinner would count deltas against a list the reader has never seen.
	const { counts, reset } = useLiveChanges(state.status === "ready")

	const refresh = () => {
		reset()
		retry()
	}

	if (state.status === "loading") return <Loading what="the feed" />
	if (state.status === "error")
		return <ErrorPanel message={state.message} onRetry={retry} />

	return (
		<>
			<h2 className="section-title">
				<span>{order === "new" ? "newest first" : "front page · ranked"}</span>
				{/* The server hardcodes 30 and wires no limit param, so there is
				    deliberately no "load more" here — see api-surface.md. */}
				<span className="section-note">
					{state.data.posts.length} posts · all this feed returns
				</span>
			</h2>
			<NewActivityBanner counts={counts} onRefresh={refresh} />
			<ol className="rows">
				{state.data.posts.map((post, index) => (
					<FeedRow key={post.id} post={post} rank={index + 1} />
				))}
			</ol>
		</>
	)
}
