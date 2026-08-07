import { useCallback } from "react"

import { fetchTreasury } from "../api/client"
import { useAsync } from "../lib/useAsync"
import { formatCents } from "../lib/time"
import { ErrorPanel, Hash, Loading, TimeStamp } from "../components/common"

export function TreasuryView() {
	const load = useCallback((signal: AbortSignal) => fetchTreasury(signal), [])
	const { state, retry } = useAsync(load)

	if (state.status === "loading") return <Loading what="the treasury" />
	if (state.status === "error")
		return <ErrorPanel message={state.message} onRetry={retry} />

	const treasury = state.data
	const inflow = treasury.entries
		.filter((entry) => entry.amount_cents > 0)
		.reduce((sum, entry) => sum + entry.amount_cents, 0)
	const outflow = treasury.entries
		.filter((entry) => entry.amount_cents < 0)
		.reduce((sum, entry) => sum + entry.amount_cents, 0)

	return (
		<>
			<div
				className={`banner ${treasury.balance_cents < 0 ? "status--warn" : "status--good"}`}
			>
				<strong className="balance">{formatCents(treasury.balance_cents)}</strong>
				<span className="muted">
					{treasury.wallet.asset} balance
					{treasury.balance_cents < 0 ? " — the society is running a deficit" : ""}
				</span>
			</div>

			<p className="muted small">{treasury.note}</p>

			<div className="cards">
				<section className="card">
					<h3>Wallet</h3>
					<dl className="facts">
						<dt>Network</dt>
						<dd>{treasury.wallet.network}</dd>
						<dt>Asset</dt>
						<dd>{treasury.wallet.asset}</dd>
					</dl>
					{/* An on-chain address is checked character by character, like a
					    hash — it needs a full line, never a truncated readout cell. */}
					<div className="hash-row">
						<span className="label">Address</span>
						<code className="hash">{treasury.wallet.address}</code>
					</div>
					<p className="muted small">{treasury.wallet.note}</p>
				</section>

				<section className="card">
					<h3>Census</h3>
					<dl className="facts">
						<dt>Citizens</dt>
						<dd>{treasury.census.citizens}</dd>
						<dt>Posts</dt>
						<dd>
							{treasury.census.posts}
							<span className="muted"> (includes moderated)</span>
						</dd>
						<dt>Ledger in</dt>
						<dd>{formatCents(inflow)}</dd>
						<dt>Ledger out</dt>
						<dd>{formatCents(outflow)}</dd>
					</dl>
					<p className="muted small">
						These are live counts of the whole society, so they will not match the
						feeds: the post total counts moderated posts, which the feeds filter out
						entirely, and a feed shows at most 30 rows regardless.
					</p>
					<p className="muted small">
						Ledger totals cover the {treasury.entries.length} entries below, which are
						capped at 200 by the API — not necessarily the whole ledger.
					</p>
				</section>
			</div>

			<h2 className="section-title">Ledger</h2>
			<div className="table-scroll">
				<table className="table">
					<thead>
						<tr>
							<th scope="col" className="numeric">
								#
							</th>
							<th scope="col">Date</th>
							<th scope="col">Description</th>
							<th scope="col" className="numeric">
								Amount
							</th>
							<th scope="col">Recorded</th>
							<th scope="col">Hash</th>
						</tr>
					</thead>
					<tbody>
						{treasury.entries.map((entry) => (
							<tr key={entry.id}>
								<td className="numeric">{entry.id}</td>
								{/* entry_date is already a YYYY-MM-DD calendar string; it is
							    not epoch ms and must not go through a date formatter. */}
								<td>{entry.entry_date}</td>
								<td className="detail">{entry.description}</td>
								<td
									className={`numeric ${entry.amount_cents < 0 ? "status--bad" : "status--good"}`}
								>
									{formatCents(entry.amount_cents)}
								</td>
								<td>
									<TimeStamp epochMs={entry.created_at} />
								</td>
								<td>
									<Hash value={entry.hash} />
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			<p className="muted small">{treasury.how_to_verify}</p>
		</>
	)
}
