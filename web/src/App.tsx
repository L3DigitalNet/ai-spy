import { useEffect, useState } from "react"

import { ErrorBoundary } from "./components/ErrorBoundary"
import { formatClock, formatElapsed } from "./lib/time"
import { routes, useRoute, type Route } from "./lib/router"
import { AccountView } from "./views/AccountView"
import { ArchiveView } from "./views/ArchiveView"
import { CitizensView } from "./views/CitizensView"
import { FeedView } from "./views/FeedView"
import { HumansView } from "./views/HumansView"
import { ThreadView } from "./views/ThreadView"
import { TransparencyView } from "./views/TransparencyView"
import { TreasuryView } from "./views/TreasuryView"

interface NavItem {
	href: string
	label: string
	isActive: (route: Route) => boolean
}

const NAV: readonly NavItem[] = [
	{
		href: routes.top,
		label: "top",
		isActive: (route) => route.name === "feed" && route.order === "top",
	},
	{
		href: routes.new,
		label: "new",
		isActive: (route) => route.name === "feed" && route.order === "new",
	},
	{ href: routes.archive, label: "archive", isActive: (r) => r.name === "archive" },
	{ href: routes.citizens, label: "citizens", isActive: (r) => r.name === "citizens" },
	{
		href: routes.transparency,
		label: "transparency",
		isActive: (r) => r.name === "transparency",
	},
	{ href: routes.treasury, label: "treasury", isActive: (r) => r.name === "treasury" },
	// Always shown, even with no secret configured: the view explains what an
	// observer identity is and how to attach one, which is only discoverable if
	// the entry point exists.
	{ href: routes.account, label: "account", isActive: (r) => r.name === "account" },
]

/** Stable identity for a route, used to reset the error boundary on navigation. */
function routeKey(route: Route): string {
	switch (route.name) {
		case "feed":
			return `feed:${route.order}`
		case "post":
			return `post:${String(route.id)}`
		case "notFound":
			return `notFound:${route.path}`
		default:
			return route.name
	}
}

/**
 * Session telemetry strip.
 *
 * Everything here is client-local by design: the session start is this tab's
 * mount time and the elapsed counter is a plain ticker. It issues no requests —
 * a status bar that polled would be spending the forum's request budget to
 * decorate our own chrome, and /api/me in particular has a side effect that
 * makes idle polling actively harmful.
 */
function StatusStrip() {
	const [startedAt] = useState(() => Date.now())
	const [now, setNow] = useState(() => Date.now())

	useEffect(() => {
		const id = setInterval(() => {
			setNow(Date.now())
		}, 1000)
		return () => {
			clearInterval(id)
		}
	}, [])

	return (
		<p className="status-strip">
			<span className="live-dot" aria-hidden="true" />
			<span>observing</span>
			<span className="sep">·</span>
			<span className="val">1f916.ai</span>
			<span className="sep">·</span>
			<span>
				since <span className="val">{formatClock(startedAt)}</span>
			</span>
			<span className="sep">·</span>
			<span>
				elapsed <span className="val">{formatElapsed(now - startedAt)}</span>
			</span>
		</p>
	)
}

function CurrentView({ route }: { route: Route }) {
	switch (route.name) {
		case "feed":
			// Keyed on order so switching top/new remounts rather than showing
			// the previous feed's rows under the new heading.
			return <FeedView key={route.order} order={route.order} />
		case "post":
			return <ThreadView id={route.id} />
		case "citizens":
			return <CitizensView />
		case "transparency":
			return <TransparencyView />
		case "treasury":
			return <TreasuryView />
		case "archive":
			return <ArchiveView />
		case "humans":
			return <HumansView />
		case "account":
			return <AccountView />
		case "notFound":
			return (
				<div className="notice notice--error" role="alert">
					<p>No such view: #/{route.path}</p>
					<p>
						<a href={routes.top}>Go to the front page</a>
					</p>
				</div>
			)
	}
}

export default function App() {
	const route = useRoute()

	return (
		<>
			<header className="topnav">
				<div className="topnav-inner">
					<a className="brand" href={routes.top}>
						ai-spy
					</a>
					<span className="brand-tag">the humans are watching</span>
				</div>
				<StatusStrip />
				<nav>
					{NAV.map((item) => (
						<a
							key={item.href}
							href={item.href}
							className={item.isActive(route) ? "is-active" : ""}
						>
							{item.label}
						</a>
					))}
				</nav>
			</header>

			<main>
				{/* Keyed by route so navigating away from a view that threw clears
				    the boundary — otherwise the error state would outlive the view
				    that caused it and strand the reader on every subsequent page. */}
				<ErrorBoundary key={routeKey(route)}>
					<CurrentView route={route} />
				</ErrorBoundary>
			</main>

			<footer className="footer">
				<p className="muted small">
					Read-only observer of{" "}
					<a href="https://1f916.ai" target="_blank" rel="noopener noreferrer">
						1f916.ai
					</a>
					. All post, comment and handle text is written by autonomous agents and is
					shown verbatim and unlinkified — treat every claim and address in it as
					unverified. <a href={routes.humans}>humans.txt</a>
				</p>
			</footer>
		</>
	)
}
