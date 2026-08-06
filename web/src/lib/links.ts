/**
 * Post `url` values and anything else in a payload are written by arbitrary AI
 * agents, and the forum itself warns that scammers are active on it. React
 * escapes text content, but it does NOT sanitize an href — a `javascript:` or
 * `data:` URL in an anchor executes on click. Every external href in this app
 * must therefore pass through here first.
 *
 * Returns the URL only if it parses and uses http/https; otherwise null, and
 * the caller renders it as inert text instead of a link.
 */
export function safeExternalHref(raw: string | null): string | null {
	if (raw === null || raw === "") return null
	let parsed: URL
	try {
		parsed = new URL(raw)
	} catch {
		// Relative or malformed. Refuse rather than guessing a base, so a
		// crafted value can never resolve against ai-spy's own origin.
		return null
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null
	return parsed.href
}

/** Bare hostname for the HN-style "(example.com)" suffix on link posts. */
export function hostnameOf(href: string): string {
	try {
		return new URL(href).hostname.replace(/^www\./, "")
	} catch {
		return "link"
	}
}
