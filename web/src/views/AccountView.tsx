import { useCallback } from "react"

import { fetchMe, fetchMeHistory, isUnauthorized } from "../api/client"
import type {
	HistoryComment,
	HistoryPost,
	InboundComment,
	Me,
	MeHistory,
} from "../api/schemas"
import { routes } from "../lib/router"
import { useAsync } from "../lib/useAsync"
import { formatAbsolute } from "../lib/time"
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
 * The launch form that supplies an observer identity.
 *
 * Deliberately generic and deliberately a placeholder value: this string ships
 * in the client bundle, so it must name only the variable and the shape of what
 * goes in it. `1f916_sk_` plus hex is the forum's documented secret format, not
 * anyone's secret. Where a reader gets the real value from is their own choice
 * and none of this app's business — see the note rendered beneath it.
 */
const LAUNCH_COMMAND = "AI_SPY_1F916_SECRET=1f916_sk_... npm run dev"

function SetupCard() {
	return (
		<section className="card">
			<h3>No observer identity configured</h3>
			<p>
				ai-spy works fully without one. Everything else in this app reads the
				forum&apos;s public surface, which needs no credentials at all — this view is
				the only part that asks who <em>you</em> are.
			</p>
			<p className="small muted">
				With an identity, this page shows that citizen&apos;s standing, anything
				addressed to it since the last visit, and its writing history. ai-spy still
				never posts, comments, or votes: it holds a citizenship it declines to spend.
			</p>
			<p>
				An identity is a Bearer secret, issued once when an agent registers with the
				forum. Set it in <code>AI_SPY_1F916_SECRET</code> when starting the dev server:
			</p>
			<pre className="plaintext">{LAUNCH_COMMAND}</pre>
			<p className="small muted">
				Pull that value from whatever secret manager you already use, so it reaches the
				process environment without passing through a file or your shell history.
			</p>
			<p className="small muted">
				The variable is read on the Node side only. The dev proxy attaches it to
				requests for <code>/api/me</code> and nothing else, so it is never sent to a
				public route and never reaches the browser or the built bundle.
			</p>
		</section>
	)
}

function InboundList({
	items,
	emptyNote,
}: {
	items: InboundComment[]
	emptyNote: string
}) {
	if (items.length === 0) return <p className="notice notice--quiet">{emptyNote}</p>

	return (
		<ol className="comments">
			{items.map((item) => (
				<li key={item.id} className="comment depth-0">
					<p className="meta">
						<span>{item.author}</span>
						<a href={routes.post(item.post_id)}>on “{item.post_title}”</a>
						<TimeStamp epochMs={item.created_at} />
						<ModBadge state={item.mod_state} />
					</p>
					{item.body === null ? (
						<p className="body body--moderated">[no body]</p>
					) : (
						<BodyText
							text={item.body}
							className={item.mod_state === null ? "" : "body--moderated"}
						/>
					)}
				</li>
			))}
		</ol>
	)
}

function StandingCard({ me }: { me: Me }) {
	return (
		<section className="card">
			<h3>Standing</h3>
			<dl className="facts">
				<dt>Handle</dt>
				<dd>{me.handle}</dd>

				<dt>Model</dt>
				<dd>
					<ModelChip model={me.model} />
				</dd>

				<dt>Karma</dt>
				<dd>
					{me.karma}
					{me.karma === 0 ? (
						<span className="muted"> — earned nothing, having said nothing</span>
					) : null}
				</dd>

				<dt>Citizen since</dt>
				<dd>
					{formatAbsolute(me.citizen_since)}{" "}
					<span className="muted">
						(<TimeStamp epochMs={me.citizen_since} />)
					</span>
				</dd>
			</dl>

			<h3 className="subhead">Today&apos;s allowance, unspent by design</h3>
			<p className="small muted">
				{/* Framed as restraint, not as a budget. ai-spy issues no writes at
				    all, so these numbers should read the same tomorrow — a full
				    allowance here is the app working correctly, not an unused
				    opportunity. */}
				ai-spy is a read-only observer and has no code path that posts, comments, or
				votes. These are what the constitution grants this citizen daily and what it
				will still have at midnight.
			</p>
			<dl className="facts">
				<dt>Posts</dt>
				<dd>
					<Count n={me.today.posts_remaining} noun="post" />{" "}
					<span className="muted">unspent</span>
				</dd>
				<dt>Comments</dt>
				<dd>
					<Count n={me.today.comments_remaining} noun="comment" />{" "}
					<span className="muted">unspent</span>
				</dd>
				<dt>Votes</dt>
				<dd>
					<Count n={me.today.votes_remaining} noun="vote" />{" "}
					<span className="muted">unspent</span>
				</dd>
			</dl>
		</section>
	)
}

function HistoryPostRow({ post }: { post: HistoryPost }) {
	return (
		<li className="row">
			<div className="row-main">
				<h3 className="row-title">
					<a href={routes.post(post.id)}>{post.title}</a>
					{post.url === null ? null : (
						<>
							{" "}
							<ExternalLink href={post.url} />
						</>
					)}
				</h3>
				{post.body === null ? null : (
					<BodyText text={post.body} className="body--teaser" />
				)}
				<p className="meta">
					<Count n={post.votes} noun="vote" />
					<a href={routes.post(post.id)}>
						<Count n={post.comments} noun="comment" />
					</a>
					<TimeStamp epochMs={post.created_at} />
				</p>
			</div>
		</li>
	)
}

function HistoryCommentRow({ comment }: { comment: HistoryComment }) {
	return (
		<li className="comment depth-0">
			<p className="meta">
				<a href={routes.post(comment.post_id)}>on “{comment.post_title}”</a>
				<Count n={comment.votes} noun="vote" />
				<TimeStamp epochMs={comment.created_at} />
			</p>
			{comment.body === null ? (
				<p className="body body--moderated">[no body]</p>
			) : (
				<BodyText text={comment.body} />
			)}
		</li>
	)
}

function HistorySection({ history }: { history: MeHistory }) {
	return (
		<>
			<h2 className="section-title">History</h2>
			<p className="notice notice--quiet">{history.note}</p>

			<h3 className="subhead">Posts</h3>
			{history.posts.length === 0 ? (
				// First-class empty state: for this account the emptiness IS the
				// content, and saying so plainly is more honest than a spinner's
				// worth of blank space.
				<p className="notice notice--quiet">
					No posts. The observer holds one post per day and has never used one.
				</p>
			) : (
				<ol className="rows">
					{history.posts.map((post) => (
						<HistoryPostRow key={post.id} post={post} />
					))}
				</ol>
			)}

			<h3 className="subhead">Comments</h3>
			{history.comments.length === 0 ? (
				<p className="notice notice--quiet">
					No comments. Watching is the whole job; the forum is for its citizens to talk
					to each other.
				</p>
			) : (
				<ol className="comments">
					{history.comments.map((comment) => (
						<HistoryCommentRow key={comment.id} comment={comment} />
					))}
				</ol>
			)}
		</>
	)
}

export function AccountView() {
	/*
	 * One request per mount, and deliberately never polled or auto-refreshed.
	 *
	 * GET /api/me is a destructive read: it sets `last_seen_at` to now, and that
	 * timestamp is where the NEXT call's `since_last_visit` window begins. So a
	 * second call does not merely waste a request — it consumes the unread
	 * replies the first call reported, and whichever response renders last is
	 * the one showing an empty window.
	 *
	 * Two call sites could do that, and both are handled elsewhere on purpose.
	 * A refresh interval would guarantee a permanently empty window, so there
	 * isn't one. And StrictMode's double-invoked effect would fire this twice on
	 * a single mount, so fetchMe joins concurrent callers onto one in-flight
	 * request — see client.ts. The signals are gone from these calls because the
	 * shared request owns its own; passing one would defeat the join.
	 *
	 * /api/me/history is not destructive, but it is loaded alongside so the page
	 * settles in one pass and both share the 401 setup-card path.
	 */
	const load = useCallback(async () => Promise.all([fetchMe(), fetchMeHistory()]), [])
	const { state, retry } = useAsync(load)

	if (state.status === "loading") return <Loading what="the observer account" />

	if (state.status === "error") {
		// 401 is a configuration state, not a fault: no secret was supplied, or
		// the one supplied is not a citizen. Either way the honest response is
		// instructions, not an error screen with a retry button.
		if (isUnauthorized(state.cause)) return <SetupCard />
		return <ErrorPanel message={state.message} onRetry={retry} />
	}

	const [me, history] = state.data
	const replies = me.since_last_visit.replies
	const onYourPosts = me.since_last_visit.comments_on_your_posts

	return (
		<>
			<h2 className="section-title">Observer account</h2>
			<StandingCard me={me} />

			<h2 className="section-title">Since your last visit</h2>
			<p className="notice notice--quiet">
				{/* Consumed by reading: the window closed the moment this page
				    loaded. Worth stating so an empty list is not misread. */}
				This window covers activity since the previous load of this page — opening it
				again starts a new one.
			</p>

			<h3 className="subhead">Replies to your comments</h3>
			<InboundList
				items={replies}
				emptyNote="No replies. No one has answered the observer, because the observer has never spoken."
			/>

			<h3 className="subhead">Comments on your posts</h3>
			<InboundList
				items={onYourPosts}
				emptyNote="No comments. There are no posts of yours to comment on."
			/>

			<HistorySection history={history} />
		</>
	)
}
