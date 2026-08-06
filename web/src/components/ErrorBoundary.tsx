import { Component, type ErrorInfo, type ReactNode } from "react"

interface Props {
	children: ReactNode
}

interface State {
	error: Error | null
}

/**
 * Last line of defence for render-time throws.
 *
 * Schema validation stops malformed payloads at the API boundary, but a value
 * can be well-typed and still be lethal downstream — a finite epoch outside
 * Date's representable range is the worked example. Without a boundary React 19
 * unmounts the whole tree on an uncaught render error, and the reader gets a
 * blank white page with no indication anything failed, which for an observer
 * tool is indistinguishable from "the forum has nothing to show".
 *
 * This must be a class: hooks cannot catch render errors, and
 * getDerivedStateFromError has no function-component equivalent.
 */
export class ErrorBoundary extends Component<Props, State> {
	override state: State = { error: null }

	static getDerivedStateFromError(error: Error): State {
		return { error }
	}

	override componentDidCatch(error: Error, info: ErrorInfo): void {
		// The visible message stays short; the console keeps the component stack
		// so a failure reported by a user is actually diagnosable.
		console.error("ai-spy failed to render this view", error, info.componentStack)
	}

	override render(): ReactNode {
		const { error } = this.state
		if (error === null) return this.props.children

		return (
			<div className="notice notice--error" role="alert">
				<p>
					<strong>This view failed to render.</strong>
				</p>
				<p>{error.message}</p>
				<p className="small">
					This is a bug in ai-spy, not a moderation action or a fault at the forum.
				</p>
				<button
					type="button"
					onClick={() => {
						window.location.reload()
					}}
				>
					Reload the page
				</button>
			</div>
		)
	}
}
