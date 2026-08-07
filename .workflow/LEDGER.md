# ai-spy observer UI — Ledger

Base: main @ 7cbd616d6962f5fbf894aa215784a5797ebddeb4
Unrelated in-flight work to preserve: staged edit to .claude/settings.json (do not commit or revert).

## Items

- [x] 1. Read-API surface of 1f916.ai documented with exact JSON shapes (.workflow/api-surface.md) — V0: artifact written from live curls + upstream source; key facts: flat comments w/ parent_id+depth, feeds capped at 30, /treasury is JSON, epoch-ms timestamps
- [~] 1b. deferred: live-updates view via /api/changes?since= delta feed (out of initial scope)
- [x] 2. Vite + React + TS app scaffolded under web/ with dev/build/preview scripts and /api proxy to https://1f916.ai — V1: worker build/proxy/negative-test evidence + orchestrator-run `npm run check` exit 0
- [~] 2b. deferred discoveries: scripts/check.py does not invoke the JS gate; no react-hooks eslint plugin; prettier globs still exclude html/css
- [x] 3. Typed API client with Zod validation — V2: 12-case live parse harness (engineer) + verifier re-ran 9 live cases + novel-enum/absent-optional probes, CONFIRMED; two brittleness fixes in flight (official_token pin, next_since nullish)
- [x] 4. UI views (feed/thread/citizens/transparency/treasury) — V2: verifier CONFIRMED functional, XSS-safety (hostile fetch-injection pass), router; ErrorBoundary + timestamp-range fix in flight
- [x] 5. Verified — V2: verifier CONFIRMED x6; four verifier findings fixed and re-proven; orchestrator-run post-fix npm check/build pass, Python gate pass, handoff validators pass, browser smoke (feed/thread/transparency) clean console
- [x] 6. Docs updated (README, STATUS, TODO, architecture, handoff session/state) — V1: agent-handoff validate + drift-check exit 0 (worker), orchestrator re-run pending at closing gate; README CORS-claim correction in flight
- [x] 7. Committed d1036f5 and pushed to origin/main — V1: push output + post-push status verified; .claude/settings.json left untouched/uncommitted

## Dependencies

1 -> 3; 2 -> 3; 3 -> 4; 4 -> 5; 4 -> 6; 5,6 -> 7
READY frontier: {1, 2}

## Dispatch manifest

- researcher (sonnet) | read-only + single artifact write to .workflow/api-surface.md | item 1 | base n/a
- engineer (opus) | mutation, main working tree | item 2 | base 7cbd616

## Phase 2 — authenticated tier + remaining read capabilities (user-directed 2026-08-06)

Base: main @ d1036f5. User authorized registration on 1f916.ai; scope = everything except writes and MCP.

- [x] 8. Auth endpoints documented in api-surface.md addendum — V0: from upstream source, 401 shapes live-confirmed
- [x] 9. Registered on 1f916.ai as citizen #317 (handle ai-spy); secret at secret/apps/ai-spy — V1: orchestrator-run 201 + OpenBao round-trip + authenticated /api/me 200; temp file shredded; credentials.md reference pending in docs leg (item 15)
- [x] 10. Live updates via /api/changes polling on feed views — worker evidence: real-path poll proof, drain-cap 5, next_since cursor discipline, visibility pause; integrated verify at 14
- [x] 11. Attest witness mode — worker evidence: live save/recheck round-trip (expect_matches:true), simulated mismatch renders red, corrupt-storage safe; integrated verify at 14
- [x] 12. humans.txt easter egg + "(includes moderated)" census marker — karma column and census stats already existed in d1036f5 (earlier gap report was wrong on those two); integrated verify at 14
- [x] 13. Authenticated account views with proxy-side Bearer injection — worker evidence: echo-listener header-scoping proof (4 auth paths, 9 public + 3 decoy paths clean), bundle greps clean, byte-identical builds ± secret; integrated verify at 14
- [x] 14. Phase-2 verification COMPLETE — verifier pass (6 claims) + archive delta pass; all REFUTED/defect findings fixed and re-verified; orchestrator-run gates (npm check w/ 109 tests, build, Python, handoff validators) green; orchestrator visual review of 4 views + own secret audit (0 hits)
- [x] 15. Docs updated (README, STATUS, TODO, architecture, credentials, session, state; validators exit 0) — committed dc92a6c and pushed to origin/main
- [x] 17. Archive view (#/archive) — user instructed the implementer directly ("build it"). V2: adversarial audit CONFIRMED XSS-safe (all fields + control chars + 8 URL schemes), dedup 256 raw -> 201 distinct vs live API, cache/paging/race clean, a11y fixed
- [x] 23. Archive defect fixes A1-A4 + load politeness — worker-verified: truncation now surfaced as "partial index", ModBadge on moderated rows, counter reports failures, filter debounced (28->6 requests); session cost 82->51 requests cold, 0 warm
- [x] 25. Orphaned hairline above witness controls fixed at root cause (prose measure was applying to control rows)
- [~] 24. accepted cost: /api/changes has no projection param, so the index drain fetches ~1489 KiB to obtain 201 headlines (~90% discarded comments) — no client-side fix; document
- [x] 18. SECURITY traversal leak FIXED structurally (proxyReq-hook decision on final wire path, two fail-closed gates, inbound Authorization stripped) — V2: root cause confirmed in vite/http-proxy-3 source, 3-variant hollow-check, live echo-proxy matrix, 109-test suite now in `npm run check`; orchestrator-run gate green
- [x] 19. Defect fixes: /api/me in-flight join (1 request per mount, remount still refetches); archive filter labelled with id/name — worker-verified, gate green
- [~] 21. deferred: production hosting of web/dist must reimplement the proxy credential guard; nothing in-repo constrains that host (dev/preview only today)
- [~] 22. deferred: unauthenticated traversal (/api/me/../../treasury) still passes through to upstream uncredentialed — harmless for public read endpoints
- [~] 20. deferred: dev server serves web/vite.config.ts source at :5173 (standard Vite; leaks routing design, no values) — accept for localhost-only tool

## Process deviations (phase 2)

- User messages reached the implementer directly instead of the orchestrator; implementer built #/archive against my explicit "keep architecture" restyle constraint rather than flagging the conflict. Work retained (user-authorized); verification retrofitted.
- Implementer edited the tree during the verifier's audit, invalidating part of that pass; decisive checks were re-run by the verifier against the final tree, and vite.config.ts (the secret boundary) was unchanged during its proxy test.

- [ ] 16. Observation-deck RESTYLE (user-requested 2026-08-06, ref ~/Downloads/xa969n2smphh1.webp): visual design only — KEEP ai-spy's existing architecture, routes, nav, and single-column view structure; adopt the reference's visual language (dark observatory palette, accent-border cards, vote rail treatment, spaced-mono micro-labels, terminal-style stat readouts); USER CONSTRAINTS: no serif anywhere — clean modern sans for display and body, mono only for labels/hashes/readouts; no layout re-architecture; no REPLY affordances; all functionality preserved

Deps: 8 -> 9 -> 13; 10,11,12 independent; 13 -> 16 (same files, serialized); 10-13,16 -> 14 -> 15
Deviation note: item 13 implemented by the engineer (context continuity) instead of a fresh security-role worker; compensated by a security-focused verifier audit in 14.

## Deviations

- Harness Agent tool cannot pin minor model versions (only sonnet/opus/haiku) or per-agent effort; routing uses the nearest available tier.
