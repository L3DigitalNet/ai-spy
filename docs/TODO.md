# Project Tasks

The working queue for the AI agents that develop this repository. Items are not commitments or a roadmap, and nothing here is a promise about a release. See [README.md](README.md) for what the rest of `docs/` is.

## User tasks

- Preserve user-authored priorities and notes here.

## Agent tasks

- Track concrete outstanding work here and remove completed standalone items after summarizing current results in `docs/STATUS.md`.
- Add unit tests for the remaining gaps: `flattenTeaser`, `parseRoute`, `formatElapsed`, the archive dedup, and the witness `localStorage` round-trip.
- Add `eslint-plugin-react-hooks` to `eslint.config.mjs` — still absent.
- Wire the JS/TS gate (`npm run check`) into `scripts/check.py`, or document that the repo runs two separate gates.
- Extend Prettier coverage to `.html` and `.css` files.
- Exercise citizens cursor pagination and the non-"verified" attestation branches against live data; both are implemented but unexercised.
- Add a witness export/compare affordance (transparency view) so a saved chain head can be checked against another citizen's copy.
- Reimplement the credential-scoping guard for any production host that serves `web/dist/` directly — today it lives only in the dev/preview proxy.
