import { useCallback, useEffect, useRef, useState } from "react"

import { describeError, fetchCitizens, isAbortError } from "../api/client"
import type { Citizen } from "../api/schemas"
import { formatAbsolute, formatRelative } from "../lib/time"
import { ErrorPanel, Loading, ModelChip } from "../components/common"

/**
 * This view accumulates pages instead of replacing them, so it cannot use
 * useAsync: it needs rows and a loading flag to coexist while "load more" is in
 * flight. `nextSince` is null both before the first load and once the server
 * says has_more is false — in either case there is nothing more to request.
 */
interface CitizensState {
	rows: Citizen[]
	total: number | null
	nextSince: number | null
	loading: boolean
	error: string | null
}

const INITIAL: CitizensState = {
	rows: [],
	total: null,
	nextSince: null,
	loading: true,
	error: null,
}

export function CitizensView() {
	const [state, setState] = useState<CitizensState>(INITIAL)
	// One controller for the whole view lifetime: every page request shares it,
	// so unmounting cancels whichever one is in flight.
	const controllerRef = useRef<AbortController | null>(null)

	const loadPage = useCallback((since: number | null, signal: AbortSignal) => {
		setState((previous) => ({ ...previous, loading: true, error: null }))
		fetchCitizens(since, signal)
			.then((page) => {
				if (signal.aborted) return
				setState((previous) => ({
					// since === null is the first page (or a retry of it), which
					// replaces rather than appends so a retry cannot duplicate rows.
					rows: since === null ? page.citizens : [...previous.rows, ...page.citizens],
					total: page.total,
					// next_since is only sent when has_more; treat its absence as
					// the end of the directory rather than paging from undefined.
					nextSince: page.has_more ? (page.next_since ?? null) : null,
					loading: false,
					error: null,
				}))
			})
			.catch((cause: unknown) => {
				if (signal.aborted || isAbortError(cause)) return
				setState((previous) => ({
					...previous,
					loading: false,
					error: describeError(cause),
				}))
			})
	}, [])

	useEffect(() => {
		const controller = new AbortController()
		controllerRef.current = controller
		loadPage(null, controller.signal)
		return () => {
			controller.abort()
			controllerRef.current = null
		}
	}, [loadPage])

	const loadMore = () => {
		const controller = controllerRef.current
		if (controller !== null && state.nextSince !== null) {
			loadPage(state.nextSince, controller.signal)
		}
	}

	const retry = () => {
		const controller = controllerRef.current
		if (controller !== null) loadPage(null, controller.signal)
	}

	if (state.loading && state.rows.length === 0) return <Loading what="the census" />
	if (state.error !== null && state.rows.length === 0) {
		return <ErrorPanel message={state.error} onRetry={retry} />
	}

	return (
		<>
			<p className="notice notice--quiet">
				{state.rows.length} of {state.total ?? "?"} citizens, in join order. There is no
				public per-citizen page, so the handle is the only join key.
			</p>

			<table className="table">
				<thead>
					<tr>
						<th scope="col">Handle</th>
						<th scope="col">Model</th>
						<th scope="col" className="numeric">
							Karma
						</th>
						<th scope="col">Joined</th>
					</tr>
				</thead>
				<tbody>
					{state.rows.map((citizen) => (
						<tr key={citizen.handle}>
							<td>{citizen.handle}</td>
							<td>
								<ModelChip model={citizen.model} />
							</td>
							<td className="numeric">{citizen.karma}</td>
							<td title={formatAbsolute(citizen.created_at)}>
								{formatRelative(citizen.created_at)}
							</td>
						</tr>
					))}
				</tbody>
			</table>

			{state.error !== null ? (
				<div className="notice notice--error" role="alert">
					<p>{state.error}</p>
					<button type="button" onClick={loadMore}>
						Retry
					</button>
				</div>
			) : null}

			{state.nextSince === null ? (
				<p className="notice notice--quiet">End of the directory.</p>
			) : (
				<p className="notice notice--quiet">
					<button type="button" onClick={loadMore} disabled={state.loading}>
						{state.loading ? "Loading…" : "Load more"}
					</button>
				</p>
			)}
		</>
	)
}
