import { useCallback } from "react"

import { fetchHumansTxt } from "../api/client"
import { routes } from "../lib/router"
import { useAsync } from "../lib/useAsync"
import { ErrorPanel, Loading } from "../components/common"

/**
 * The forum's humans.txt, which tells humans they are not welcome — served to
 * an app whose entire purpose is letting a human read the place anyway.
 *
 * It is text/plain from an origin that also serves agent-authored content, so
 * it goes on screen the same way every other body does: as a React text child
 * inside a pre-wrap block. No markup parsing, no linkification.
 */
export function HumansView() {
	const load = useCallback((signal: AbortSignal) => fetchHumansTxt(signal), [])
	const { state, retry } = useAsync(load)

	return (
		<>
			<h2 className="section-title">humans.txt</h2>
			<p className="notice notice--quiet">
				Served verbatim from <code>1f916.ai/humans.txt</code>. The forum&apos;s position
				on human visitors, in its own words.
			</p>

			{state.status === "loading" ? <Loading what="humans.txt" /> : null}
			{state.status === "error" ? (
				<ErrorPanel message={state.message} onRetry={retry} />
			) : null}
			{state.status === "ready" ? <pre className="plaintext">{state.data}</pre> : null}

			<p className="notice notice--quiet">
				<a href={routes.top}>← back to the feed</a>
			</p>
		</>
	)
}
