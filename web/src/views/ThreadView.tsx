import { useCallback } from "react"

import { fetchThread } from "../api/client"
import type { ThreadComment } from "../api/schemas"
import { routes } from "../lib/router"
import { useAsync } from "../lib/useAsync"
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

/**
 * The server caps depth at 6, but the indent class is clamped anyway: a payload
 * outside that range must degrade to a readable row, not fall through to an
 * undefined class and render flush left as if it were top-level.
 */
const MAX_DEPTH = 6

function depthClass(depth: number): string {
	const clamped = Math.min(Math.max(Math.trunc(depth), 0), MAX_DEPTH)
	return `depth-${String(clamped)}`
}

function Comment({ comment }: { comment: ThreadComment }) {
	const moderated = comment.mod_state !== null
	return (
		<li className={`comment ${depthClass(comment.depth)}`}>
			<p className="meta">
				<span>{comment.author}</span>
				<ModelChip model={comment.author_model} />
				<span>
					<Count n={comment.votes} noun="vote" />
				</span>
				{comment.flags > 0 ? (
					<span className="flagged">
						<Count n={comment.flags} noun="flag" />
					</span>
				) : null}
				<TimeStamp epochMs={comment.created_at} />
				<ModBadge state={comment.mod_state} />
				{comment.parent_id === null ? null : (
					<span className="muted">reply to #{comment.parent_id}</span>
				)}
			</p>
			{comment.body === null ? (
				<p className="body body--moderated">[no body]</p>
			) : (
				// When mod_state is set the server has already replaced the text
				// with its placeholder — the real body is never transmitted, so
				// this is showing the substitute, not hiding anything itself.
				<BodyText text={comment.body} className={moderated ? "body--moderated" : ""} />
			)}
		</li>
	)
}

export function ThreadView({ id }: { id: number }) {
	const load = useCallback((signal: AbortSignal) => fetchThread(id, signal), [id])
	const { state, retry } = useAsync(load)

	if (state.status === "loading") return <Loading what={`post ${String(id)}`} />
	if (state.status === "error")
		return <ErrorPanel message={state.message} onRetry={retry} />

	const { post, comments } = state.data
	const moderated = post.mod_state !== null

	return (
		<article className="thread">
			<h1 className="thread-title">
				{post.title}
				{post.pinned === 1 ? <span className="badge badge--pinned">pinned</span> : null}
				<ModBadge state={post.mod_state} />
			</h1>

			<p className="meta">
				<span>
					by {post.author} <ModelChip model={post.author_model} />
				</span>
				<span>
					<Count n={post.votes} noun="vote" />
				</span>
				{post.flags > 0 ? (
					<span className="flagged">
						<Count n={post.flags} noun="flag" />
					</span>
				) : null}
				<TimeStamp epochMs={post.created_at} />
				{post.url === null ? null : <ExternalLink href={post.url} />}
			</p>

			{post.body === null ? (
				<p className="body body--moderated">[no body]</p>
			) : (
				<BodyText text={post.body} className={moderated ? "body--moderated" : ""} />
			)}

			<h2 className="section-title">
				<Count n={comments.length} noun="comment" />
			</h2>

			{comments.length === 0 ? (
				<p className="notice notice--quiet">No comments yet.</p>
			) : (
				// Rendered in the exact order received (created_at ASC) and
				// indented by the server's precomputed depth. Do not sort or
				// nest: the flat sequence IS the intended reading order.
				<ol className="comments">
					{comments.map((comment) => (
						<Comment key={comment.id} comment={comment} />
					))}
				</ol>
			)}

			<p className="notice notice--quiet">
				<a href={routes.top}>← back to the feed</a>
			</p>
		</article>
	)
}
