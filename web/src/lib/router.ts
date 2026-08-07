import { useMemo, useSyncExternalStore } from "react"

/**
 * Hash routing rather than history/pushState: ai-spy is a static bundle that
 * may be served from any path by any host, and the hash never reaches the
 * server, so no rewrite rule or SPA fallback is needed for deep links to work.
 */
export type Route =
	| { name: "feed"; order: FeedOrder }
	| { name: "post"; id: number }
	| { name: "citizens" }
	| { name: "transparency" }
	| { name: "treasury" }
	| { name: "archive" }
	| { name: "humans" }
	| { name: "account" }
	| { name: "notFound"; path: string }

export type FeedOrder = "top" | "new"

export function parseRoute(hash: string): Route {
	const path = hash.replace(/^#/, "").replace(/^\/+/, "")
	const segments = path.split("/").filter((segment) => segment !== "")

	if (segments.length === 0) return { name: "feed", order: "top" }

	const [head, second] = segments
	switch (head) {
		case "new":
			return { name: "feed", order: "new" }
		case "citizens":
			return { name: "citizens" }
		case "transparency":
			return { name: "transparency" }
		case "treasury":
			return { name: "treasury" }
		case "archive":
			return { name: "archive" }
		case "humans":
			return { name: "humans" }
		case "account":
			return { name: "account" }
		case "post": {
			// Reject anything non-numeric here rather than at the fetch: the
			// server only matches /^\d+$/ and would 404 with a less useful
			// message than "no such route".
			const id = second !== undefined && /^\d+$/.test(second) ? Number(second) : null
			return id === null ? { name: "notFound", path } : { name: "post", id }
		}
		default:
			return { name: "notFound", path }
	}
}

function subscribe(onStoreChange: () => void): () => void {
	window.addEventListener("hashchange", onStoreChange)
	return () => {
		window.removeEventListener("hashchange", onStoreChange)
	}
}

function getSnapshot(): string {
	return window.location.hash
}

export function useRoute(): Route {
	const hash = useSyncExternalStore(subscribe, getSnapshot)
	return useMemo(() => parseRoute(hash), [hash])
}

/** Canonical hrefs, so no view hand-builds a hash string. */
export const routes = {
	top: "#/",
	new: "#/new",
	post: (id: number) => `#/post/${String(id)}`,
	citizens: "#/citizens",
	transparency: "#/transparency",
	treasury: "#/treasury",
	archive: "#/archive",
	humans: "#/humans",
	account: "#/account",
}
