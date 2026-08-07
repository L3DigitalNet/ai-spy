// Every timestamp on the 1f916 API is epoch MILLISECONDS (the one exception,
// ledger entry_date, is a plain "YYYY-MM-DD" string and never reaches here).
// Nothing in this file may divide by 1000.

const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })

const absoluteFormat = new Intl.DateTimeFormat(undefined, {
	dateStyle: "medium",
	timeStyle: "short",
})

/**
 * Largest-unit-first ladder. Each `perUnit` is how many of the previous unit
 * make one of this one, so dividing successively walks the elapsed time up to
 * the coarsest unit that still reads as a whole number. The month and year
 * factors are averages — good enough for "3 months ago", wrong for arithmetic.
 */
const DIVISIONS: readonly { perUnit: number; unit: Intl.RelativeTimeFormatUnit }[] = [
	{ perUnit: 60, unit: "second" },
	{ perUnit: 60, unit: "minute" },
	{ perUnit: 24, unit: "hour" },
	{ perUnit: 7, unit: "day" },
	{ perUnit: 4.34524, unit: "week" },
	{ perUnit: 12, unit: "month" },
	{ perUnit: Number.POSITIVE_INFINITY, unit: "year" },
]

/**
 * ECMA-262 caps a Date at ±8.64e15 ms from the epoch. Beyond that, Date methods
 * throw RangeError rather than returning a sentinel — and 1e16 is a finite
 * number that passes z.number(), so a malformed or hostile payload can carry
 * one all the way to a formatter. Anything that touches Date must check this,
 * not merely Number.isFinite.
 */
const MAX_EPOCH_MS = 8.64e15

export function isRepresentableEpochMs(value: number): boolean {
	return Number.isFinite(value) && Math.abs(value) <= MAX_EPOCH_MS
}

/** Shown in place of a timestamp that no Date can represent. */
export const UNKNOWN_TIME = "unknown time"

/** "3 hours ago". Pass `now` to keep tests deterministic. */
export function formatRelative(epochMs: number, now: number = Date.now()): string {
	if (!isRepresentableEpochMs(epochMs)) return UNKNOWN_TIME
	let remaining = (epochMs - now) / 1000
	for (const division of DIVISIONS) {
		if (Math.abs(remaining) < division.perUnit) {
			return relativeFormat.format(Math.round(remaining), division.unit)
		}
		remaining /= division.perUnit
	}
	return relativeFormat.format(Math.round(remaining), "year")
}

/** Full local date and time, for the title-attribute tooltip. */
export function formatAbsolute(epochMs: number): string {
	if (!isRepresentableEpochMs(epochMs)) return UNKNOWN_TIME
	return absoluteFormat.format(new Date(epochMs))
}

/** Wall-clock HH:MM for the session-start readout. */
export function formatClock(epochMs: number): string {
	if (!isRepresentableEpochMs(epochMs)) return "--:--"
	return new Intl.DateTimeFormat(undefined, {
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	}).format(new Date(epochMs))
}

/**
 * Elapsed duration as mm:ss, growing to h:mm:ss past an hour. Built from
 * arithmetic rather than a Date so it stays correct beyond 24 hours — an
 * observer session left open overnight should read 19:04:12, not wrap to zero.
 */
export function formatElapsed(durationMs: number): string {
	const total = Math.max(0, Math.floor(durationMs / 1000))
	const seconds = String(total % 60).padStart(2, "0")
	const minutes = total % 3600
	const hours = Math.floor(total / 3600)
	const mm = Math.floor(minutes / 60)
	if (hours > 0) return `${String(hours)}:${String(mm).padStart(2, "0")}:${seconds}`
	return `${String(mm).padStart(2, "0")}:${seconds}`
}

/**
 * Signed money from integer cents. The treasury balance is routinely negative,
 * so the sign is meaningful and must never be dropped.
 */
export function formatCents(cents: number): string {
	const sign = cents < 0 ? "-" : ""
	const absolute = Math.abs(cents)
	const whole = Math.floor(absolute / 100).toLocaleString()
	const fraction = (absolute % 100).toString().padStart(2, "0")
	return `${sign}$${whole}.${fraction}`
}
