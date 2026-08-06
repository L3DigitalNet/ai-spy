import {
	formatAbsolute,
	formatRelative,
	isRepresentableEpochMs,
	UNKNOWN_TIME,
} from "../lib/time"
import { hostnameOf, safeExternalHref } from "../lib/links"
import { MOD_STATE_COLLAPSED, MOD_STATE_REMOVED } from "../api/schemas"

export function Loading({ what }: { what: string }) {
	return <p className="notice">Loading {what}…</p>
}

/** "1 vote" / "2 votes". Every noun this app counts pluralizes with a bare -s. */
export function Count({ n, noun }: { n: number; noun: string }) {
	return (
		<>
			{n} {n === 1 ? noun : `${noun}s`}
		</>
	)
}

export function ErrorPanel({
	message,
	onRetry,
}: {
	message: string
	onRetry: () => void
}) {
	return (
		<div className="notice notice--error" role="alert">
			{/* The API writes its error messages for humans, so show the server's
			    text verbatim rather than a generic substitute. */}
			<p>{message}</p>
			<button type="button" onClick={onRetry}>
				Retry
			</button>
		</div>
	)
}

/** Relative time on screen, exact local time in the hover tooltip. */
export function TimeStamp({ epochMs }: { epochMs: number }) {
	// toISOString() throws RangeError outside Date's ±8.64e15 ms range, and a
	// value that far out is finite enough to pass z.number(). Degrade to a
	// labelled placeholder rather than letting one bad row take down the view.
	if (!isRepresentableEpochMs(epochMs)) {
		return (
			<span className="muted" title={`Out-of-range timestamp: ${String(epochMs)}`}>
				{UNKNOWN_TIME}
			</span>
		)
	}
	return (
		<time dateTime={new Date(epochMs).toISOString()} title={formatAbsolute(epochMs)}>
			{formatRelative(epochMs)}
		</time>
	)
}

/** Model the author declared at write time — not necessarily their model now. */
export function ModelChip({ model }: { model: string }) {
	return <span className="chip">{model}</span>
}

export function ModBadge({ state }: { state: string | null }) {
	if (state === null) return null
	const tone =
		state === MOD_STATE_REMOVED
			? "badge--removed"
			: state === MOD_STATE_COLLAPSED
				? "badge--collapsed"
				: "badge--unknown"
	return <span className={`badge ${tone}`}>{state}</span>
}

/**
 * Every body on this forum is untrusted text written by an arbitrary AI agent.
 * Rendering it as a React child is what makes it safe: React escapes it, so
 * markup in the payload is shown, never parsed. Two rules follow, and both are
 * load-bearing:
 *   1. Never swap this for dangerouslySetInnerHTML.
 *   2. Never auto-linkify. Turning agent-authored text into clickable links is
 *      exactly the affordance the forum's own anti-scam notice warns about.
 * Newlines are preserved by CSS (white-space: pre-wrap), not by parsing.
 */
export function BodyText({ text, className }: { text: string; className?: string }) {
	return (
		<div className={className === undefined ? "body" : `body ${className}`}>{text}</div>
	)
}

/**
 * External links get noopener/noreferrer so the destination cannot reach back
 * through window.opener, and the href is scheme-checked first.
 */
export function ExternalLink({ href, children }: { href: string; children?: string }) {
	const safe = safeExternalHref(href)
	if (safe === null) return <span className="muted">{children ?? href}</span>
	return (
		<a href={safe} target="_blank" rel="noopener noreferrer" className="external">
			{children ?? hostnameOf(safe)}
		</a>
	)
}

export function Hash({ value }: { value: string | null }) {
	if (value === null) return <span className="muted">unsealed</span>
	return (
		<code className="hash" title={value}>
			{value}
		</code>
	)
}
