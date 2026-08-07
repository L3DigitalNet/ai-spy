import { createServer as createEchoServer, request, type Server } from "node:http"
import type { AddressInfo } from "node:net"

import { createServer as createViteServer, type ViteDevServer } from "vite"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
	buildForumProxy,
	isObserverRequestTarget,
	shouldAttachCredential,
} from "./vite.config"

/**
 * Regression suite for the one thing this repo must never get wrong: the
 * observer Bearer credential leaving for an endpoint that is not this account.
 *
 * The proxy proof below is an integration test on purpose. A unit test over
 * `shouldAttachCredential` alone would have passed against the defect this
 * suite pins — Vite matched the proxy route on the raw URL while http-proxy
 * forwarded the normalized one, so the bug lived in the gap between the two,
 * not in either piece. Only a real dev server, built from the real
 * `buildForumProxy` table and talking to a real listener, can observe that gap.
 *
 * The value asserted on is never the credential itself, only whether an
 * `Authorization` header arrived. The secret here is a dummy string; a real one
 * belongs in a secret manager and must never appear in this repository.
 */
const TEST_SECRET = "1f916_sk_test"

/**
 * Request targets that must arrive upstream carrying the credential. Only
 * `/api/me` and `/api/me/history` are used by the app today; the deeper shapes
 * are here so a future account sub-route does not need this file re-litigated.
 */
const CREDENTIALED = [
	"/api/me",
	"/api/me?since=1730000000",
	"/api/me/history",
	"/api/me/deep/segments",
]

/**
 * Request targets that must NOT carry the credential.
 *
 * The first group is the traversal family that motivated this suite: each one
 * is matched by a naive `/api/me` route but lands on a different endpoint after
 * normalization. The second is the near-miss family — paths that merely start
 * with the same characters, which a Vite prefix key would have swallowed. The
 * rest are encoding and separator tricks that must fail closed rather than be
 * sanitized into something acceptable.
 */
const REFUSED = [
	"/api/me/../official",
	"/api/me/./../front",
	"/api/me/../../treasury",
	"/api/me/%2e%2e/official",

	"/api/melon",
	"/api/members",
	"/api/metrics",
	"/api/me-secret",
	"/api/mex/me",
	"/api/ME",

	"/api/me/%2E%2E/official",
	"/api/me/%252e%252e/official",
	"/api/me/%2f..%2f/official",
	"/api/me/%5c..%5c/official",
	"/api/me/",
	"/api/me/x/./y",
	"/api/me//history",
	"//evil.invalid/api/me",
	"/api/front",
	"/treasury",
	"/humans.txt",
]

describe("shouldAttachCredential", () => {
	it.each(CREDENTIALED)("accepts %s", (target) => {
		expect(shouldAttachCredential(target)).toBe(true)
	})

	it.each(REFUSED)("refuses %s", (target) => {
		expect(shouldAttachCredential(target)).toBe(false)
	})
})

describe("isObserverRequestTarget", () => {
	// These are the post-normalization paths http-proxy actually writes for the
	// traversal payloads above. The wire-path check is the boundary's last line,
	// so it is asserted against the exact strings it will see.
	it.each(["/api/official", "/api/front", "/treasury", "/api/me/../official"])(
		"refuses forwarded path %s",
		(path) => {
			expect(isObserverRequestTarget(path)).toBe(false)
		}
	)

	it.each(CREDENTIALED)("accepts forwarded path %s", (path) => {
		expect(isObserverRequestTarget(path)).toBe(true)
	})
})

/** One observed upstream request, reduced to the only fact worth recording. */
interface Observation {
	url: string
	authorized: boolean
	/** False when the proxy never forwarded anything — also a pass for REFUSED. */
	forwarded: boolean
}

let echo: Server
let echoUrl: string
const observed: Observation[] = []

/** Dev servers keyed by the secret they were configured with. */
const servers = new Map<string, { server: ViteDevServer; port: number }>()

async function startProxy(key: string, secret: string | undefined): Promise<void> {
	const server = await createViteServer({
		// configFile:false keeps this from loading the config's own default
		// export, so the proxy table under test is the one built right here with
		// a controlled secret and a local target. noDiscovery skips the dependency
		// scan, which this test has no use for.
		configFile: false,
		root: import.meta.dirname,
		logLevel: "silent",
		optimizeDeps: { noDiscovery: true },
		// Pinned to 127.0.0.1 rather than the default "localhost": on a dual-stack
		// host that name can resolve to ::1 only, and the probes below would then
		// be refused by a server that started perfectly well.
		server: {
			host: "127.0.0.1",
			port: 0,
			strictPort: false,
			proxy: buildForumProxy(secret, echoUrl),
		},
	})
	await server.listen()
	const address = server.httpServer?.address() as AddressInfo
	servers.set(key, { server, port: address.port })
}

/**
 * Send a request-target verbatim.
 *
 * `node:http` writes `path` to the socket untouched, which is what makes this
 * the programmatic equivalent of `curl --path-as-is` — `fetch` and `URL` would
 * both collapse the traversal before it ever reached the proxy, and the test
 * would prove nothing.
 */
function probe(port: number, target: string): Promise<Observation> {
	// A target that matches no proxy route never reaches the listener at all, so
	// the observation log would otherwise still be showing the previous case's
	// entry. Comparing against the pre-request length is what distinguishes
	// "forwarded without a credential" from "not forwarded".
	const before = observed.length
	return new Promise((resolve, reject) => {
		const outgoing = request({ host: "127.0.0.1", port, path: target }, (response) => {
			response.resume()
			response.on("end", () => {
				const last = observed.at(-1)
				if (observed.length === before || last === undefined) {
					resolve({ url: target, authorized: false, forwarded: false })
				} else {
					resolve(last)
				}
			})
		})
		outgoing.on("error", reject)
		outgoing.end()
	})
}

beforeAll(async () => {
	echo = createEchoServer((incoming, response) => {
		observed.push({
			url: incoming.url ?? "",
			authorized: incoming.headers.authorization !== undefined,
			forwarded: true,
		})
		response.writeHead(200, { "content-type": "application/json" })
		response.end("{}")
	})
	await new Promise<void>((resolve) => echo.listen(0, "127.0.0.1", resolve))
	echoUrl = `http://127.0.0.1:${String((echo.address() as AddressInfo).port)}`

	await startProxy("configured", TEST_SECRET)
	await startProxy("unset", undefined)
	await startProxy("empty", "")
}, 60_000)

afterAll(async () => {
	for (const { server } of servers.values()) await server.close()
	await new Promise<void>((resolve) => echo.close(() => resolve()))
})

function portFor(key: string): number {
	const entry = servers.get(key)
	if (entry === undefined) throw new Error(`proxy ${key} was not started`)
	return entry.port
}

describe("proxy with a configured secret", () => {
	it.each(CREDENTIALED)("attaches the credential to %s", async (target) => {
		const observation = await probe(portFor("configured"), target)
		expect(observation.forwarded).toBe(true)
		expect(observation.authorized).toBe(true)
	})

	it.each(REFUSED)("sends no credential to %s", async (target) => {
		const observation = await probe(portFor("configured"), target)
		expect(observation.authorized).toBe(false)
	})

	it("strips a client-supplied Authorization header", async () => {
		const port = portFor("configured")
		await new Promise<void>((resolve, reject) => {
			const outgoing = request(
				{
					host: "127.0.0.1",
					port,
					path: "/api/front",
					headers: { authorization: "Bearer client-supplied" },
				},
				(response) => {
					response.resume()
					response.on("end", resolve)
				}
			)
			outgoing.on("error", reject)
			outgoing.end()
		})
		expect(observed.at(-1)?.authorized).toBe(false)
	})
})

describe.each(["unset", "empty"])("proxy with an %s secret", (key) => {
	it.each([...CREDENTIALED, ...REFUSED])(
		"sends no credential to %s",
		async (target) => {
			const observation = await probe(portFor(key), target)
			expect(observation.authorized).toBe(false)
		}
	)
})
