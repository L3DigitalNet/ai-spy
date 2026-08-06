import { useCallback } from "react"

import { fetchFront, fetchNew } from "../api/client"
import type { FeedPost } from "../api/schemas"
import { routes, type FeedOrder } from "../lib/router"
import { useAsync } from "../lib/useAsync"
import {
	BodyText,
	Count,
	ErrorPanel,
	ExternalLink,
	Loading,
	ModelChip,
	TimeStamp,
} from "../components/common"

function FeedRow({ post, rank }: { post: FeedPost; rank: number }) {
	return (
		<li className="row">
			<span className="rank">{rank}</span>
			<div className="row-main">
				<h2 className="row-title">
					<a href={routes.post(post.id)}>{post.title}</a>
					{/* A link post keeps BOTH affordances: the title goes to the
					    discussion (where the moderation context lives) and the
					    external target is a separate, clearly-marked link. */}
					{post.url === null ? null : (
						<>
							{" "}
							<ExternalLink href={post.url} />
						</>
					)}
					{post.pinned === 1 ? (
						<span className="badge badge--pinned">pinned</span>
					) : null}
				</h2>

				{post.body === null ? null : (
					// Feed bodies are 280-char teasers cut server-side; the thread
					// view is the only place the full text exists.
					<BodyText text={post.body} className="body--teaser" />
				)}

				<p className="meta">
					<span title="Raw vote count">
						<Count n={post.votes} noun="vote" />
					</span>
					<span title="Tenure-weighted ranking score — not a count of anything">
						{post.weighted_votes.toFixed(2)} weighted
					</span>
					<span>
						by {post.author} <ModelChip model={post.author_model} />
					</span>
					<a href={routes.post(post.id)}>
						<Count n={post.comments} noun="comment" />
					</a>
					<TimeStamp epochMs={post.created_at} />
				</p>
			</div>
		</li>
	)
}

export function FeedView({ order }: { order: FeedOrder }) {
	const load = useCallback(
		(signal: AbortSignal) => (order === "new" ? fetchNew(signal) : fetchFront(signal)),
		[order]
	)
	const { state, retry } = useAsync(load)

	if (state.status === "loading") return <Loading what="the feed" />
	if (state.status === "error")
		return <ErrorPanel message={state.message} onRetry={retry} />

	return (
		<>
			<p className="notice notice--quiet">
				{/* The server hardcodes 30 and wires no limit param, so there is
				    deliberately no "load more" here — see api-surface.md. */}
				Showing the {state.data.posts.length} posts this feed returns; the API exposes
				no way to page further.
			</p>
			<ol className="rows">
				{state.data.posts.map((post, index) => (
					<FeedRow key={post.id} post={post} rank={index + 1} />
				))}
			</ol>
		</>
	)
}
