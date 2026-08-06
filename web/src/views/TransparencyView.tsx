import { useCallback, useEffect, useState } from "react"

import { fetchAttest, fetchEvents, fetchOfficial } from "../api/client"
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

function ChainCard({ label, chain }: { label: string; chain: TableAttestation }) {
	return (
		<section className="card">
			<h3>
				{label}
				<span className={`status ${statusTone(chain.status)}`}>{chain.status}</span>
			</h3>

			{chain.reason === undefined ? null : <p className="muted">{chain.reason}</p>}

			<dl className="facts">
				<dt>Head</dt>
				<dd>
					<Hash value={chain.head} />
				</dd>

				{/* Only worth showing when it differs from head — equal values mean
				    this call verified all the way to the tip. */}
				{chain.verified_head === chain.head ? null : (
					<>
						<dt>Verified head</dt>
						<dd>
							<Hash value={chain.verified_head} />
						</dd>
					</>
				)}

				<dt>Sealed rows</dt>
				<dd>{chain.sealed_entries}</dd>

				<dt>Unsealed rows</dt>
				<dd>
					{chain.unsealed_entries}
					{chain.unsealed_entries > 0 ? (
						<span className="muted"> (legacy, pre-chain — never attestable)</span>
					) : null}
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
		</section>
	)
}

function Attestation({ attest }: { attest: Attest }) {
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
				<ChainCard label="Identity log" chain={attest.identity_log} />
				<ChainCard label="Treasury ledger" chain={attest.treasury} />
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

				<dt>Treasury address</dt>
				<dd>
					<code className="hash">{official.treasury.address}</code>
					<span className="muted">
						{" "}
						{official.treasury.asset} on {official.treasury.network}
					</span>
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
					<ExternalLink href={official.source_of_record}>
						{official.source_of_record}
					</ExternalLink>
				</dd>
			</dl>
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
				</>
			) : null}
		</section>
	)
}

export function TransparencyView() {
	// Attestation and official facts load together because they are one
	// statement: "here is what verified, and here is who is allowed to say so."
	const load = useCallback(
		async (signal: AbortSignal) =>
			Promise.all([fetchAttest(signal), fetchOfficial(signal)]),
		[]
	)
	const { state, retry } = useAsync(load)

	return (
		<>
			<h2 className="section-title">Chain attestation</h2>
			{state.status === "loading" ? <Loading what="the attestation" /> : null}
			{state.status === "error" ? (
				<ErrorPanel message={state.message} onRetry={retry} />
			) : null}
			{state.status === "ready" ? (
				<>
					<Attestation attest={state.data[0]} />
					<OfficialFacts official={state.data[1]} />
				</>
			) : null}

			<EventsLog />
		</>
	)
}
