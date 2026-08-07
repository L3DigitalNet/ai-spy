import { z } from "zod"

/**
 * Off-box witness storage for the forum's tamper-evidence protocol.
 *
 * The forum's own /api/attest response says a self-hosted re-fetch proves
 * nothing: a server that could rewrite history could also serve a
 * self-consistent rewritten chain. The witness closes that gap by holding a
 * head hash somewhere the forum cannot reach — here, the reader's own browser —
 * and asking the server to prove the chain still hashes to that value at the
 * id where it was seen. That only works if the saved copy is genuinely
 * independent, which is why this is localStorage and not a server round-trip.
 */

/** The two hash-chained tables /api/attest verifies. */
export type ChainId = "identity" | "ledger"

const witnessSchema = z.object({
	/** Chain head hash as it read when saved. */
	head: z.string(),
	/**
	 * The id that head was sealed at. Must be sent back as `*_from`: the server
	 * compares the saved hash against the chain's hash AT this id, so an id and
	 * a hash from different moments produce a meaningless mismatch.
	 */
	verified_through_id: z.number(),
	/** When the reader saved it, epoch ms — shown in the UI, not sent back. */
	checked_at: z.number(),
})

export type Witness = z.infer<typeof witnessSchema>

const STORAGE_PREFIX = "ai-spy:witness:"

function storageKey(chain: ChainId): string {
	return `${STORAGE_PREFIX}${chain}`
}

/**
 * Every localStorage access is wrapped: the API throws rather than returning
 * null in Safari private mode and under some enterprise policies, and a
 * tamper-evidence panel that crashes the page when storage is unavailable
 * would be a worse failure than simply not offering to witness.
 */
export function readWitness(chain: ChainId): Witness | null {
	let raw: string | null
	try {
		raw = window.localStorage.getItem(storageKey(chain))
	} catch {
		return null
	}
	if (raw === null) return null

	let parsed: unknown
	try {
		parsed = JSON.parse(raw) as unknown
	} catch {
		// Corrupt entry. Treat as no witness rather than surfacing an error: the
		// reader can simply save a new one, and a stored value we cannot read is
		// not evidence of anything about the chain.
		return null
	}

	const result = witnessSchema.safeParse(parsed)
	return result.success ? result.data : null
}

/** Returns false when storage is unavailable, so the UI can say so honestly. */
export function writeWitness(chain: ChainId, witness: Witness): boolean {
	try {
		window.localStorage.setItem(storageKey(chain), JSON.stringify(witness))
		return true
	} catch {
		return false
	}
}

export function clearWitness(chain: ChainId): void {
	try {
		window.localStorage.removeItem(storageKey(chain))
	} catch {
		// Nothing useful to do: the value is already unreachable to us.
	}
}
