import { useCallback, useEffect, useState } from "react"

import { describeError, isAbortError } from "../api/client"

export type AsyncState<T> =
	| { status: "loading" }
	// `cause` is the original thrown value, kept alongside the display message
	// so a caller can branch on the KIND of failure (a 401 is a configuration
	// state, not an error) without re-parsing prose.
	| { status: "error"; message: string; cause: unknown }
	| { status: "ready"; data: T }

export interface AsyncResult<T> {
	state: AsyncState<T>
	retry: () => void
}

/**
 * Runs a loader on mount, whenever the loader identity changes, and on retry.
 *
 * `load` must be referentially stable — wrap it in useCallback in the caller,
 * keyed on whatever the request actually depends on. That is what makes a
 * filter or route change re-fetch, and an unrelated re-render not.
 *
 * The AbortController does double duty: it cancels the in-flight request on
 * unmount, and its `aborted` flag is what discards a superseded response. Both
 * matter under StrictMode, which mounts every effect twice in development.
 */
export function useAsync<T>(load: (signal: AbortSignal) => Promise<T>): AsyncResult<T> {
	const [state, setState] = useState<AsyncState<T>>({ status: "loading" })
	const [attempt, setAttempt] = useState(0)

	useEffect(() => {
		const controller = new AbortController()
		setState({ status: "loading" })

		load(controller.signal)
			.then((data) => {
				if (!controller.signal.aborted) setState({ status: "ready", data })
			})
			.catch((cause: unknown) => {
				// A cancelled request is an expected part of teardown, not an
				// error worth showing.
				if (controller.signal.aborted || isAbortError(cause)) return
				setState({ status: "error", message: describeError(cause), cause })
			})

		return () => {
			controller.abort()
		}
	}, [load, attempt])

	const retry = useCallback(() => {
		setAttempt((previous) => previous + 1)
	}, [])

	return { state, retry }
}
