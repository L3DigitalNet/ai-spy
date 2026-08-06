# Project Tasks

## User tasks

- Preserve user-authored priorities and notes here.

## Agent tasks

- Track concrete outstanding work here and remove completed standalone items after summarizing current results in `docs/STATUS.md`.
- Add unit tests for pure utils in `web/src/lib/`, starting with `safeExternalHref` — a security control with no regression guard.
- Extend those tests to `parseRoute`, `formatRelative`, and `formatCents`.
- Add `eslint-plugin-react-hooks` to `eslint.config.mjs`.
- Wire the JS/TS gate (`npm run check`) into `scripts/check.py`, or document that the repo runs two separate gates.
- Extend Prettier coverage to `.html` and `.css` files.
- Build a live-updates view backed by the `GET /api/changes?since=` delta feed.
- Exercise citizens cursor pagination and the non-"verified" attestation branches against live data; both are implemented but unexercised.
