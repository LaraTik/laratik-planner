# AI provider — switch, rotate, extend

> Companion to `src/lib/ai/provider-secret.ts` (per-agency managed AI key, M3.4) and `src/lib/ai/key-management.ts`. The provider switch has three surfaces: per-agency managed secret, global env-var fallback, and capability model choice. This file is the operational procedure for all three.

## 1. The two-key model

The system has two parallel surfaces for the AI provider key:

- **Per-agency managed secret** — the `ai_provider_secret` table (migration `0013_ai_provider_secret`). One row per agency. The plaintext key is encrypted at rest with AES-256-GCM via the platform `SOCIAL_TOKEN_ENCRYPTION_KEY`-style helper. The agency admin sets the key in the UI; the key is shown to the admin exactly once and is never persisted in plaintext. Source: `src/lib/ai/provider-secret.ts`.
- **Global env-var fallback** — the `MINIMAX_API_KEY` / `MINIMAX_BASE_URL` / `MINIMAX_MODEL` env vars (validated by `src/lib/validation/env.ts:100-102`). The global key is the default for every agency that has not configured a managed secret. The `ai_feature_setting.key_source` column records which surface the agency uses (`'environment'` or `'managed_secret'`).

The read path in `/api/ai/generate` checks the agency's `key_source`: if `'managed_secret'`, it decrypts the row from `ai_provider_secret`; if `'environment'`, it reads the global env var. A missing managed secret AND a missing env var returns `503` (the user sees "AI is not configured").

## 2. Per-agency managed-key rotation

An agency admin can rotate the managed secret at any time. The procedure is the agency's, not the platform's:

1. **Open the AI configuration surface** at `/app/agency-settings/ai` as an agency admin.
2. **Paste the new API key** into the "Set managed key" form. The Zod schema (`SetManagedAiSecretSchema`) validates shape (`sk-` prefix, base64url chars, 12–256 chars) before encryption.
3. **Submit** — the service encrypts the key, writes the new `ai_provider_secret` row (overwriting the old ciphertext), upserts the `ai_feature_setting` row with the new `last_four` and `enabled = true`, and writes a `security_audit_events` row with the `lastFour` (never the plaintext).
4. **Test the connection** — the "Test connection" button runs a one-shot `/api/ai/generate` with `capability = 'completeness_check'` and a no-op content id; the response is the read / write round-trip proof.

The rotation is **in-place**: the same `agency_id` row is updated. No re-issue of any user-facing artifact. The old ciphertext is overwritten; the audit row records the new `lastFour` and the operator.

The key_version (`smallint`, 1 today) is the rotation seam. A future migration can introduce `key_version = 2` for agencies that have rotated past the current encryption key version. The helper reads the agency row's `key_version` and decrypts with the matching slot.

## 3. Global env-var fallback path

The global env-var path is the default for new agencies and the fallback for agencies that have not set a managed secret. The variables live in `.env` on the VPS (validated at boot by `src/lib/validation/env.ts:100-102`):

| Variable           | Required? | Default                            | Purpose                                             |
| ------------------ | :-------: | ---------------------------------- | --------------------------------------------------- |
| `MINIMAX_API_KEY`  | optional  | empty string                       | The MiniMax API key (or any OpenAI-compatible key). |
| `MINIMAX_BASE_URL` | optional  | `https://api.minimax.io/anthropic` | The provider's API base URL.                        |
| `MINIMAX_MODEL`    | optional  | `MiniMax-M3`                       | The default model identifier sent on every request. |

The variables are optional because the agency-managed secret is the preferred surface. If both are missing, `/api/ai/generate` returns `503` (the `AI_FEATURE_ENABLED` flag is independent — it gates the route, not the key).

### Rotation cadence

- `MINIMAX_API_KEY` — rotate at the provider's recommended cadence (typically 90 days for a long-lived key, immediately on suspected compromise). The env-var path is shared across every agency that uses it, so a rotation invalidates AI for every agency on the global key. Prefer per-agency managed secrets for production tenants.
- `MINIMAX_BASE_URL` — change only when switching providers. See §4.
- `MINIMAX_MODEL` — change when the provider releases a new model. The change is reversible; the old model identifier continues to work until the provider deprecates it.

### Rotation procedure (env-var path)

1. **Generate the new key** in the provider's console.
2. **Update `.env`** on the VPS: `ssh laratik-vps 'cd /opt/laratik-planner && sed -i "s|^MINIMAX_API_KEY=.*|MINIMAX_API_KEY=<new>|" .env'`.
3. **Restart the app**: `ssh laratik-vps 'cd /opt/laratik-planner && docker compose up -d --no-deps app'`.
4. **Curl `/api/health`** — must return `db: up` + `schema: ready`.
5. **Test one AI call** as an agency on the env-var path: open the content detail page, click "Improve brief", verify the response.
6. **Revoke the old key** in the provider's console.
7. **Record the rotation** in `docs/operations/runbook.md` §"Rotation log" (operator + date + key suffix).

## 4. Switching the global provider

A provider switch (e.g. MiniMax → Anthropic → OpenAI) touches four places. The procedure is:

1. **Generate the new key** in the new provider's console. Capture the model identifier and the base URL.
2. **Update the three env vars** on the VPS: `MINIMAX_API_KEY`, `MINIMAX_BASE_URL`, `MINIMAX_MODEL`. The default base URL in `src/lib/validation/env.ts:101` is `https://api.minimax.io/anthropic`; for a different provider, override the env var.
3. **Update the AI client** in `src/lib/ai/` if the new provider's API surface differs from OpenAI-compatible (e.g. Anthropic's `/v1/messages` requires a `system` field, not a `system` message in the messages array). The client is the only code that touches the wire format.
4. **Update the Sentry alert rules** in `docs/operations/observability.md:73-78` if the new provider's error model differs (HTTP status, error body shape). The four alert rules (5xx rate, latency p95, token budget exhausted, capability denied) are provider-agnostic at the surface; the dashboard queries are provider-agnostic.
5. **Migrate agencies with managed secrets** — the managed-secret path is provider-specific in shape (the Zod schema enforces `sk-` prefix + base64url). A new provider may have a different key shape; in that case, the agencies must re-paste their keys under the new schema.
6. **Smoke test** on a non-production workspace: `/api/ai/generate` with `capability = 'completeness_check'`, then a real `brief_improvement` call against a content id.
7. **Update `docs/operations/environment.md`** — the env-var table records the new default `MINIMAX_BASE_URL` and the new default `MINIMAX_MODEL`.
8. **Record the switch** in `docs/operations/runbook.md` §"Provider switch log".

The provider switch is reversible. The old env vars stay in `.env` (commented out) for one rollback window; after the observation period, the operator removes them.

## 5. Model-version update

A model-version update is a smaller surface than a provider switch — only the model identifier changes, the wire format is unchanged. The procedure is:

1. **Update `MINIMAX_MODEL`** in `.env` on the VPS.
2. **Restart the app**.
3. **Smoke test** as in §4 step 6.
4. **Update the default** in `src/lib/validation/env.ts:102` so a fresh deploy lands the new model.
5. **Record the update** in the runbook.

For per-agency managed secrets, the model identifier lives on `ai_feature_setting` (the agency's chosen model, not the global default). A model-version update is opt-in per agency: the agency admin sets the model on `/app/agency-settings/ai`.

## 6. Adding a new provider

The system is provider-agnostic at the wire-format layer. The MiniMax integration uses the OpenAI-compatible surface, so a new provider is a config change, not a code change, for any OpenAI-compatible provider (Anthropic, OpenAI, Groq, Together, OpenRouter, etc.). The procedure is:

1. **Capture the new provider's API surface** — base URL, model identifier, key shape, and any non-standard request / response fields. Document the differences in `docs/operations/ai-provider.md` §"Provider matrix".
2. **Update the AI client** in `src/lib/ai/` if the new provider requires a non-OpenAI surface. The client takes a `ProviderConfig` and the model identifier; the wire format is per-provider.
3. **Update the Zod schema** in `src/lib/ai/provider-secret.ts` if the new provider's key shape is different. The current `isValidApiKeyShape` enforces `sk-` + base64url; a new provider may use `pk-` or a different prefix.
4. **Update the env-var defaults** in `src/lib/validation/env.ts:100-102`. The defaults point at MiniMax; a new provider override is a `.env` change.
5. **Update the per-agency surface** — the AI configuration page lists the supported providers; the new provider is a new dropdown entry.
6. **Smoke test** on a non-production workspace.
7. **Update the Sentry alert rules** and the runbook rotation table.
8. **Add a UAT row** in `docs/production-readiness/EXTERNAL_SERVICES_UAT.md` (provider name, key shape, model identifier, test result, operator + date).

A non-OpenAI-compatible provider (e.g. a provider that uses a different streaming protocol, a different tool-call shape, or a different message structure) is a larger lift — the AI client must grow a new adapter. The contract is the same; the implementation is per-provider. Document the adapter in `docs/decisions/00XX-<provider>-integration.md`.

## 7. Common hazards

- **Rotating the env-var key while a managed-secret agency is active** — the rotation does not affect the managed-secret agency. Verify with `SELECT key_source FROM ai_feature_setting WHERE agency_id = '<id>';`.
- **Pasting the plaintext key into a commit, a screenshot, or a Slack message** — the audit row records the `lastFour`; the plaintext is never recoverable from the database. If the plaintext is exposed, rotate the key immediately.
- **Forgetting to restart the app after an env-var change** — the boot-time env validation catches missing vars; a successful restart confirms the new value is in effect. The `MINIMAX_*` vars are read on every request, but the validated schema is enforced only at boot.
- **Switching providers without updating the Sentry dashboard** — the 5xx rate, latency p95, and capability-denied alerts are provider-agnostic at the surface, but the token-budget-exhausted alert may need a different metric name in the new provider.
- **Setting `AI_FEATURE_ENABLED=false` after a provider switch** — the `AI_FEATURE_ENABLED` flag is independent of the provider. The flag gates the route; the provider is the upstream. A provider switch with the flag off is a no-op for end users until the flag flips.

## 8. Cross-references

- `src/lib/ai/provider-secret.ts` — the per-agency managed-secret service.
- `src/lib/ai/key-management.ts` — the key-management helpers (rotation seam, audit context).
- `src/lib/validation/env.ts:100-102` — the env-var schema and defaults.
- `docs/operations/environment.md` — the env-var table that the operator reads.
- `docs/operations/runbook.md` §"Rotation" — the rotation cadence table (extended to include `MINIMAX_API_KEY`).
- `docs/production-readiness/EXTERNAL_SERVICES_UAT.md` — the per-provider UAT rows.
- `docs/architecture/ai-governance-and-support-access.md` — the AI feature surface and the audit row contract.
