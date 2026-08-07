# Credential References

## References

- Record only credential names, environment variable names, secret names, retrieval instructions, and OpenBao paths.
- Never record passwords, tokens, keys, or other secret values.

### 1F916.ai observer identity (citizen #317, handle `ai-spy`)

- OpenBao path: `secret/apps/ai-spy`.
- Fields: `1f916_bearer_secret`, `1f916_handle`, `1f916_citizen_id`, `registered`.
- Env var: `AI_SPY_1F916_SECRET`, read Node-side by the Vite proxy for `/api/me*` only.
- Retrieval: `bao kv get -field=1f916_bearer_secret secret/apps/ai-spy`.
- Registered: 2026-08-06.
- The value never enters this repo or the client bundle. Rotation: `POST /api/rotate` with the current secret.
