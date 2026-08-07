import { useCallback, useEffect, useMemo, useState } from "react"

import {
	fetchAttest,
	fetchEvents,
	fetchOfficial,
	type WitnessAnchors,
} from "../api/client"
import {
	clearWitness,
	readWitness,
	writeWitness,
	type ChainId,
	type Witness,
} from "../lib/witness"
import {
	EVENT_KINDS,
	type Attest,
	type Official,
	type TableAttestation,
} from "../api/schemas"
import { useAsync } from "../lib/useAsync"
import { formatAbsolute, formatRelative } from "../lib/time"
import {
	ErrorPanel,
	ExternalLink,
	Hash,
	Loading,
	TimeStamp,
} from "../components/common"
import { safeExternalHref } from "../lib/links"

/**
 * "verified" is the only good outcome and "broken" the only proven-bad one.
 * Everything else — incomplete, empty, mismatch, or a status this build has
 * never heard of — is amber: not a failure, but not a clean bill of health
 * either, and the reason string is what tells them apart.
 */
function statusTone(status: string): string {
	if (status === "verified") return "status--good"
	if (status === "broken") return "status--bad"
	return "status--warn"
}

interface WitnessPanelProps {
	chainId: ChainId
	chain: TableAttestation
	witness: Witness | null
	storageBlocked: boolean
	onSave: (chainId: ChainId, chain: TableAttestation) => void
	onClear: (chainId: ChainId) => void
}

/**
 * The witness affordance for one chain.
 *
 * `expect_matches` is only present when this request carried an anchor, so its
 * absence means "not asked", never "no". Undefined must therefore not fall into
 * the mismatch branch — that would scream tampering at a reader who simply has
 * no witness saved yet.
 */
function WitnessPanel({
	chainId,
	chain,
	witness,
	storageBlocked,
	onSave,
	onClear,
}: WitnessPanelProps) {
	// Session-scoped only. A tamper warning that could be permanently silenced
	// with one click would be worth very little, so this deliberately does not
	// persist: reload and it is back.
	const [dismissed, setDismissed] = useState(false)

	if (storageBlocked) {
		return (
			<p className="witness muted small">
				Witnessing needs browser storage, which is unavailable here (private mode or a
				storage policy). The attestation above still works; it just cannot be compared
				against a copy you saved earlier.
			</p>
		)
	}

	if (witness === null) {
		// Anchoring needs an id to anchor AT. A chain that has not verified, or
		// has no sealed row yet, gives nothing meaningful to save.
		const canWitness = chain.status === "verified" && chain.verified_through_id !== null
		return (
			<p className="witness">
				<button
					type="button"
					disabled={!canWitness}
					onClick={() => {
						onSave(chainId, chain)
					}}
				>
					Start witnessing
				</button>{" "}
				<span className="muted small">
					{canWitness
						? "Saves this chain's current head in your browser, so a later visit can prove nothing before this point was rewritten."
						: "Available once this chain reports a verified sealed head."}
				</span>
			</p>
		)
	}

	if (chain.expect_matches === false && !dismissed) {
		return (
			<div className="witness witness--alert" role="alert">
				<p>
					<strong>This chain no longer matches what you saved.</strong>
				</p>
				<p className="small">
					At row {witness.verified_through_id} the forum previously hashed to the first
					value below. It now hashes to the second. A hash chain cannot change at an old
					row through normal appends — so the record at or before that point was
					rewritten or truncated after {formatAbsolute(witness.checked_at)}. The other
					possibility is far more mundane: a saved value from a different chain or a
					different site. Treat it as serious until you have ruled that out, and compare
					against another citizen&apos;s independently saved head before drawing a
					conclusion.
				</p>
				<div className="hash-row">
					<span className="label">You saved</span>
					<Hash value={witness.head} />
				</div>
				<div className="hash-row">
					<span className="label">Chain holds now</span>
					<Hash value={chain.anchor_at_from ?? null} />
				</div>
				{chain.reason === undefined ? null : (
					<p className="small muted">{chain.reason}</p>
				)}
				<p>
					<button
						type="button"
						onClick={() => {
							setDismissed(true)
						}}
					>
						Keep my witness
					</button>{" "}
					<button
						type="button"
						onClick={() => {
							onSave(chainId, chain)
						}}
					>
						Replace with the current head
					</button>
				</p>
			</div>
		)
	}

	// Three distinct states, and collapsing any two of them would misinform:
	//   true      — re-checked and consistent.
	//   false     — re-checked and NOT consistent; the reader dismissed the full
	//               alert, so this is the compact form. It stays red, because
	//               dismissing a mismatch does not resolve it.
	//   undefined — the server was not asked (no anchor on this request), which
	//               is not evidence either way.
	const saved = formatAbsolute(witness.checked_at)
	const [tone, summary] =
		chain.expect_matches === true
			? ["status--good", `Witness from ${saved} — chain consistent with what you saved`]
			: chain.expect_matches === false
				? ["status--bad", `Witness from ${saved} — MISMATCH, dismissed for this visit`]
				: ["status--warn", `Witness from ${saved} — not re-checked in this response`]

	return (
		<p className="witness">
			<span className={tone}>{summary}</span>{" "}
			<button
				type="button"
				onClick={() => {
					onSave(chainId, chain)
				}}
			>
				Update witness
			</button>{" "}
			<button
				type="button"
				className="linkish"
				onClick={() => {
					onClear(chainId)
				}}
			>
				Clear witness
			</button>
		</p>
	)
}

/** Per-chain witness state and handlers, threaded down from the view. */
interface WitnessControls {
	witnesses: Record<ChainId, Witness | null>
	storageBlocked: boolean
	onSave: (chainId: ChainId, chain: TableAttestation) => void
	onClear: (chainId: ChainId) => void
}

function ChainCard({
	label,
	chainId,
	chain,
	controls,
}: {
	label: string
	chainId: ChainId
	chain: TableAttestation
	controls: WitnessControls
}) {
	return (
		<section className="card">
			<h3>
				{label}
				<span className={`status ${statusTone(chain.status)}`}>{chain.status}</span>
			</h3>

			{chain.reason === undefined ? null : <p className="muted">{chain.reason}</p>}

			<WitnessPanel
				chainId={chainId}
				chain={chain}
				witness={controls.witnesses[chainId]}
				storageBlocked={controls.storageBlocked}
				onSave={controls.onSave}
				onClear={controls.onClear}
			/>

			{/* Counts go in the readout grid, where right-aligned tabular figures
			    line up and compare at a glance. Hashes do not: 64 hex characters
			    cannot share a row with a label without either wrapping raggedly or
			    being truncated, and a truncated hash is useless for the one thing a
			    hash is for. They get their own full-width block instead. */}
			<dl className="facts">
				<dt>Sealed rows</dt>
				<dd>{chain.sealed_entries}</dd>

				<dt>Unsealed rows</dt>
				<dd>
					{chain.unsealed_entries}
					{chain.unsealed_entries > 0 ? <span className="muted"> legacy</span> : null}
				</dd>

				<dt>Total rows</dt>
				<dd>{chain.total_rows}</dd>

				<dt>Verified through id</dt>
				<dd>{chain.verified_through_id ?? "—"}</dd>

				{chain.broken_at === undefined ? null : (
					<>
						<dt>Broken at id</dt>
						<dd className="status--bad">{chain.broken_at}</dd>
					</>
				)}
			</dl>

			{chain.unsealed_entries > 0 ? (
				<p className="notice notice--quiet">
					Legacy rows predate hash-chain sealing and can never be attested.
				</p>
			) : null}

			<div className="hash-row">
				<span className="label">Head</span>
				<Hash value={chain.head} />
			</div>

			{/* Only worth showing when it differs from head — equal values mean
			    this call verified all the way to the tip. */}
			{chain.verified_head === chain.head ? null : (
				<div className="hash-row">
					<span className="label">Verified head</span>
					<Hash value={chain.verified_head} />
				</div>
			)}
		</section>
	)
}

function Attestation({
	attest,
	controls,
}: {
	attest: Attest
	controls: WitnessControls
}) {
	return (
		<>
			<div className={`banner ${attest.ok ? "status--good" : "status--bad"}`}>
				<strong>
					{attest.ok ? "Both chains verified" : "Chain verification failed"}
				</strong>
				<span className="muted">
					checked <TimeStamp epochMs={attest.checked_at} />
				</span>
			</div>
			<div className="cards">
				<ChainCard
					label="Identity log"
					chainId="identity"
					chain={attest.identity_log}
					controls={controls}
				/>
				<ChainCard
					label="Treasury ledger"
					chainId="ledger"
					chain={attest.treasury}
					controls={controls}
				/>
			</div>
			<p className="muted small">{attest.what_this_proves}</p>
			<p className="muted small">{attest.what_this_does_not_prove}</p>
		</>
	)
}

/** Renders an unknown-typed field as text without trusting its shape. */
function describeToken(token: unknown): string {
	if (typeof token === "string") return token
	return JSON.stringify(token) ?? String(token)
}

function OfficialFacts({ official }: { official: Official }) {
	return (
		<section className="card">
			<h3>Official addresses</h3>
			<p className="warning">{official.warning}</p>
			<dl className="facts">
				<dt>Society</dt>
				<dd>{official.society}</dd>

				<dt>Maintainer</dt>
				<dd>
					{official.maintainer.handle} — {official.maintainer.is}
				</dd>

				<dt>Official token</dt>
				<dd>
					{/* Null by design, and rendering the absence explicitly is the
					    point: a blank here would read as "unknown" to a reader
					    deciding whether a token they were shown is genuine. The
					    non-null branch must never be dropped for being unreachable —
					    reporting the field's real value is the whole job of this row,
					    and a hardcoded "none" would become a lie the moment the
					    server changed its mind. */}
					{official.official_token == null ? (
						<strong>none — there is no official token</strong>
					) : (
						<strong className="status--bad">
							server now reports a token: {describeToken(official.official_token)}
						</strong>
					)}
				</dd>

				<dt>Treasury</dt>
				<dd>
					{official.treasury.asset} on {official.treasury.network}
				</dd>

				<dt>Sanctioned money in</dt>
				<dd>
					<ul className="plain">
						{official.sanctioned_money_in.map((entry) => (
							<li key={entry}>
								{/* These are prose today, but they come from the payload,
								    so anything URL-shaped is scheme-checked before it
								    becomes a link. */}
								{safeExternalHref(entry) === null ? (
									entry
								) : (
									<ExternalLink href={entry} />
								)}
							</li>
						))}
					</ul>
				</dd>

				<dt>Source of record</dt>
				<dd>
					<ExternalLink href={official.source_of_record}>github</ExternalLink>
				</dd>
			</dl>

			<div className="hash-row">
				<span className="label">Treasury address</span>
				<code className="hash">{official.treasury.address}</code>
			</div>
		</section>
	)
}

function EventsLog() {
	const [kind, setKind] = useState<string | null>(null)
	// Held outside the async state so the filter buttons do not vanish while a
	// filtered refetch is in flight. Seeded with the compiled-in list, then
	// replaced by whatever the server actually reports.
	const [knownKinds, setKnownKinds] = useState<readonly string[]>(EVENT_KINDS)

	const load = useCallback((signal: AbortSignal) => fetchEvents(kind, signal), [kind])
	const { state, retry } = useAsync(load)

	useEffect(() => {
		if (state.status === "ready") setKnownKinds(state.data.kinds)
	}, [state])

	return (
		<section>
			<h2 className="section-title">Event log</h2>

			<p className="filters">
				<button
					type="button"
					className={kind === null ? "is-active" : ""}
					onClick={() => {
						setKind(null)
					}}
				>
					all
				</button>
				{knownKinds.map((candidate) => (
					<button
						key={candidate}
						type="button"
						className={kind === candidate ? "is-active" : ""}
						onClick={() => {
							setKind(candidate)
						}}
					>
						{candidate}
					</button>
				))}
			</p>

			{state.status === "loading" ? <Loading what="events" /> : null}
			{state.status === "error" ? (
				<ErrorPanel message={state.message} onRetry={retry} />
			) : null}

			{state.status === "ready" ? (
				<>
					<p className="notice notice--quiet">
						{/* count is this page's length, capped at 500 — not a total. */}
						{state.data.count} events on this page (newest first, no paging beyond 500).
					</p>
					<div className="table-scroll">
						<table className="table">
							<thead>
								<tr>
									<th scope="col" className="numeric">
										#
									</th>
									<th scope="col">Kind</th>
									<th scope="col">Actor</th>
									<th scope="col">Detail</th>
									<th scope="col">When</th>
									<th scope="col">Hash</th>
								</tr>
							</thead>
							<tbody>
								{state.data.events.map((event) => (
									<tr key={event.id}>
										<td className="numeric">{event.id}</td>
										<td>
											<span className="chip">{event.kind}</span>
										</td>
										<td>{event.citizen}</td>
										<td className="detail">{event.detail ?? "—"}</td>
										<td title={formatAbsolute(event.created_at)}>
											{formatRelative(event.created_at)}
										</td>
										<td>
											<Hash value={event.hash} />
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</>
			) : null}
		</section>
	)
}

export function TransparencyView() {
	// Read once on mount. Storage is only re-read through these handlers, so the
	// rendered state and the stored state cannot drift apart mid-session.
	const [witnesses, setWitnesses] = useState<Record<ChainId, Witness | null>>(() => ({
		identity: readWitness("identity"),
		ledger: readWitness("ledger"),
	}))
	const [storageBlocked, setStorageBlocked] = useState(false)

	/**
	 * Each saved witness contributes BOTH its anchor id and its hash. Sending
	 * the hash alone would have the server compare against genesis, and sending
	 * the id alone asks nothing at all.
	 */
	const anchors = useMemo<WitnessAnchors>(() => {
		const next: WitnessAnchors = {}
		if (witnesses.identity !== null) {
			next.identity = {
				from: witnesses.identity.verified_through_id,
				expect: witnesses.identity.head,
			}
		}
		if (witnesses.ledger !== null) {
			next.ledger = {
				from: witnesses.ledger.verified_through_id,
				expect: witnesses.ledger.head,
			}
		}
		return next
	}, [witnesses])

	// Attestation and official facts load together because they are one
	// statement: "here is what verified, and here is who is allowed to say so."
	// Saving or clearing a witness changes `anchors`, which re-runs this loader —
	// that refetch is what turns a freshly saved head into a confirmed
	// round-trip rather than an unverified local note.
	const load = useCallback(
		async (signal: AbortSignal) =>
			Promise.all([fetchAttest(anchors, signal), fetchOfficial(signal)]),
		[anchors]
	)
	const { state, retry } = useAsync(load)

	const handleSave = useCallback((chainId: ChainId, chain: TableAttestation) => {
		// head, not verified_head: head is the true chain tip independent of how
		// far this call paged, and it is the value the next check must anchor to.
		if (chain.verified_through_id === null) return
		const witness: Witness = {
			head: chain.head,
			verified_through_id: chain.verified_through_id,
			checked_at: Date.now(),
		}
		if (!writeWitness(chainId, witness)) {
			setStorageBlocked(true)
			return
		}
		setWitnesses((previous) => ({ ...previous, [chainId]: witness }))
	}, [])

	const handleClear = useCallback((chainId: ChainId) => {
		clearWitness(chainId)
		setWitnesses((previous) => ({ ...previous, [chainId]: null }))
	}, [])

	const controls: WitnessControls = {
		witnesses,
		storageBlocked,
		onSave: handleSave,
		onClear: handleClear,
	}

	return (
		<>
			<h2 className="section-title">Chain attestation</h2>
			{state.status === "loading" ? <Loading what="the attestation" /> : null}
			{state.status === "error" ? (
				<ErrorPanel message={state.message} onRetry={retry} />
			) : null}
			{state.status === "ready" ? (
				<>
					<Attestation attest={state.data[0]} controls={controls} />
					<OfficialFacts official={state.data[1]} />
				</>
			) : null}

			<EventsLog />
		</>
	)
}
