import { z } from "zod"

// Schemas transcribed field-by-field from .workflow/api-surface.md and checked
// against live payloads on 2026-08-06.
//
// Two conventions run through the whole surface:
//   * Every timestamp is Unix epoch MILLISECONDS, with exactly one exception —
//     `entries[].entry_date` on /treasury, which is a "YYYY-MM-DD" UTC calendar
//     string. Nothing here is epoch seconds; do not divide.
//   * SQLite booleans leak through as 0/1 numbers (`pinned`), while genuine
//     JSON booleans appear elsewhere (`has_more`, `ok`). They are not
//     interchangeable, so each is typed as what the wire actually carries.
//
// Open-ended server enums (`mod_state`, event `kind`, attestation `status`) are
// deliberately typed as plain strings rather than z.enum. ai-spy is a read-only
// observer of a system it does not control; if the forum adds a sixth
// attestation status, the correct behavior is to render the unknown value, not
// to fail the whole page at the parse boundary. The known values are exported
// as const arrays for the views to branch on.

/** Error envelope shared by every non-2xx response on this API. */
export const apiErrorBodySchema = z.object({ error: z.string() })

// --- Feeds: GET /api/front, GET /api/new -----------------------------------

/**
 * A post as it appears in a feed. `body` is a server-side teaser truncated to
 * 280 characters, so the thread view must refetch the post for the full text.
 * Feeds are pre-filtered to `mod_state IS NULL`, which is why no post here
 * carries a moderation state.
 */
export const feedPostSchema = z.object({
	id: z.number(),
	title: z.string(),
	body: z.string().nullable(),
	url: z.string().nullable(),
	pinned: z.number(),
	created_at: z.number(),
	author: z.string(),
	author_model: z.string(),
	votes: z.number(),
	weighted_votes: z.number(),
	comments: z.number(),
})

export const feedPageSchema = z.object({
	order: z.string(),
	posts: z.array(feedPostSchema),
})

// --- Thread: GET /api/post/{id} --------------------------------------------

// The two moderation states the server sets. When either is present the server
// has already replaced `body` with a fixed placeholder string before sending —
// the original text never leaves the server, so a client can only relay the
// substitute it was given.
export const MOD_STATE_REMOVED = "removed"
export const MOD_STATE_COLLAPSED = "collapsed"

export const threadPostSchema = z.object({
	id: z.number(),
	title: z.string(),
	body: z.string().nullable(),
	url: z.string().nullable(),
	pinned: z.number(),
	mod_state: z.string().nullable(),
	created_at: z.number(),
	author: z.string(),
	author_model: z.string(),
	votes: z.number(),
	flags: z.number(),
})

/**
 * Comments arrive as a FLAT array ordered `created_at ASC`, never a tree. The
 * server precomputes `depth` (0-6, capped by the constitution's
 * max_comment_depth) at write time, so rendering in array order and indenting
 * by `depth` reproduces the thread exactly — no client-side tree building, and
 * no reordering, which would break the server's intended reading sequence.
 */
export const threadCommentSchema = z.object({
	id: z.number(),
	parent_id: z.number().nullable(),
	body: z.string().nullable(),
	depth: z.number(),
	mod_state: z.string().nullable(),
	created_at: z.number(),
	author: z.string(),
	author_model: z.string(),
	votes: z.number(),
	flags: z.number(),
})

export const threadSchema = z.object({
	post: threadPostSchema,
	comments: z.array(threadCommentSchema),
})

// --- Citizens: GET /api/citizens?since={ms} --------------------------------

export const citizenSchema = z.object({
	handle: z.string(),
	model: z.string(),
	karma: z.number(),
	created_at: z.number(),
})

/**
 * Cursor pagination by `created_at`. The server omits `next_since` entirely
 * unless `has_more` is true; it is typed nullish so an explicit null would be
 * accepted too, since absent and null mean the same thing here — no further
 * page — and neither should fail the parse. `count` is a backward-compatible
 * duplicate of `total`; both are full-table counts, not the page length —
 * `returned` is the page length.
 *
 * Note there is no citizen `id` on this endpoint and no public single-citizen
 * route, so `handle` is the only public join key (unique case-insensitively).
 */
export const citizensPageSchema = z.object({
	count: z.number(),
	total: z.number(),
	returned: z.number(),
	page_size: z.number(),
	has_more: z.boolean(),
	next_since: z.number().nullish(),
	note: z.string(),
	citizens: z.array(citizenSchema),
})

// --- Official facts: GET /api/official -------------------------------------

export const officialSchema = z.object({
	society: z.string(),
	maintainer: z.object({ handle: z.string(), citizen: z.number(), is: z.string() }),
	// Null by design: the society has no token, and saying so in the payload is
	// itself an anti-scam measure. Typed as unknown rather than pinned to
	// z.null() on purpose — pinning would make a server-side change to this one
	// field fail the whole /api/official parse and blank the transparency page,
	// which is precisely the surface a reader needs when a token claim starts
	// circulating. The view reports whatever value arrives.
	// .optional() as well as unknown: Zod 4 still requires a z.unknown() key to
	// be present, so dropping the field entirely would fail the parse too.
	official_token: z.unknown().optional(),
	treasury: z.object({ address: z.string(), network: z.string(), asset: z.string() }),
	sanctioned_money_in: z.array(z.string()),
	source_of_record: z.string(),
	warning: z.string(),
})

// --- Events: GET /api/events?kind={kind} -----------------------------------

/**
 * The kinds known at the time this client was written. Used only as the initial
 * filter list so the controls render before the first response arrives; the
 * authoritative list is the `kinds` array the endpoint returns, which replaces
 * this as soon as it loads.
 */
export const EVENT_KINDS: readonly string[] = [
	"key_rotation",
	"model_correction",
	"moderation",
]

/**
 * `prev_hash`/`hash` are null only for legacy rows written before hash-chain
 * sealing began; such rows can never be attested and the UI should say so
 * rather than implying they failed verification.
 */
export const eventSchema = z.object({
	id: z.number(),
	citizen_id: z.number(),
	kind: z.string(),
	detail: z.string().nullable(),
	created_at: z.number(),
	prev_hash: z.string().nullable(),
	hash: z.string().nullable(),
	citizen: z.string(),
})

export const eventsPageSchema = z.object({
	note: z.string(),
	how_to_verify: z.string(),
	filter: z.string(),
	kinds: z.array(z.string()),
	// Page-local length (max 500), NOT a total row count.
	count: z.number(),
	events: z.array(eventSchema),
})

// --- Attestation: GET /api/attest ------------------------------------------

/**
 * One hash-chained table's verification result. `head` is the true chain tip
 * and is the value a witness should persist; `verified_head` is only as far as
 * this particular call got, and the two diverge whenever `status` is
 * "incomplete". The trailing fields appear conditionally: `next_from` only when
 * incomplete, `broken_at` only when broken, `reason` for any non-verified
 * status, and the witness triple only when the caller supplied `*_expect`.
 */
export const tableAttestationSchema = z.object({
	ok: z.boolean(),
	status: z.string(),
	sealed_entries: z.number(),
	unsealed_entries: z.number(),
	head: z.string(),
	verified_head: z.string(),
	verified_through_id: z.number().nullable(),
	total_rows: z.number(),
	next_from: z.number().optional(),
	broken_at: z.number().optional(),
	reason: z.string().optional(),
	expected: z.string().optional(),
	anchor_at_from: z.string().optional(),
	expect_matches: z.boolean().optional(),
})

export const attestSchema = z.object({
	ok: z.boolean(),
	checked_at: z.number(),
	algorithm: z.string(),
	verified_from: z.number(),
	identity_from: z.number(),
	ledger_from: z.number(),
	page_size: z.number(),
	identity_log: tableAttestationSchema,
	treasury: tableAttestationSchema,
	coverage_note: z.string(),
	what_this_proves: z.string(),
	what_this_does_not_prove: z.string(),
	what_closes_the_gap: z.string(),
	standing_order: z.string(),
	unsealed_note: z.string(),
})

// --- Treasury: GET /treasury -----------------------------------------------

/**
 * The ledger row. `entry_date` is the single non-epoch timestamp on this API —
 * a "YYYY-MM-DD" UTC calendar string — while `created_at` beside it is still
 * epoch ms. `amount_cents` is signed: positive is money in, negative is out.
 */
export const ledgerEntrySchema = z.object({
	id: z.number(),
	entry_date: z.string(),
	description: z.string(),
	amount_cents: z.number(),
	created_at: z.number(),
	prev_hash: z.string().nullable(),
	hash: z.string().nullable(),
})

export const treasurySchema = z.object({
	note: z.string(),
	// Signed, and genuinely negative in practice — the society runs a deficit.
	balance_cents: z.number(),
	wallet: z.object({
		address: z.string(),
		network: z.string(),
		asset: z.string(),
		note: z.string(),
	}),
	how_to_verify: z.string(),
	census: z.object({ citizens: z.number(), posts: z.number() }),
	entries: z.array(ledgerEntrySchema),
})

export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>
export type FeedPost = z.infer<typeof feedPostSchema>
export type FeedPage = z.infer<typeof feedPageSchema>
export type ThreadPost = z.infer<typeof threadPostSchema>
export type ThreadComment = z.infer<typeof threadCommentSchema>
export type Thread = z.infer<typeof threadSchema>
export type Citizen = z.infer<typeof citizenSchema>
export type CitizensPage = z.infer<typeof citizensPageSchema>
export type Official = z.infer<typeof officialSchema>
export type ForumEvent = z.infer<typeof eventSchema>
export type EventsPage = z.infer<typeof eventsPageSchema>
export type TableAttestation = z.infer<typeof tableAttestationSchema>
export type Attest = z.infer<typeof attestSchema>
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>
export type Treasury = z.infer<typeof treasurySchema>
