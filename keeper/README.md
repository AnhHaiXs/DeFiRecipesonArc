# Keeper Service Notes

## Chế độ Redis queue (tùy chọn qua .env)

Keeper hỗ trợ 2 chế độ chạy qua biến môi trường `KEEPER_USE_REDIS_QUEUE`:

1. `KEEPER_USE_REDIS_QUEUE=true` (khuyến nghị cho production)
   - Cron scheduler đẩy job vào BullMQ.
   - Xác nhận giao dịch chạy qua queue xác nhận (`tx-confirmation-queue`).
   - Cần `REDIS_URL` hợp lệ.

2. `KEEPER_USE_REDIS_QUEUE=false` (phù hợp local/dev hoặc chế độ suy giảm)
   - Cron scheduler thực thi trực tiếp, không cần Redis.
   - Nếu `KEEPER_SYNC_CONFIRMATION_IN_HOT_PATH=false`, keeper tự động fallback sang xác nhận đồng bộ để tránh mất trạng thái xác nhận tx.
   - Không có durability/retry ở tầng queue, không phù hợp cho tải production.

Ví dụ `.env`:

```bash
KEEPER_USE_REDIS_QUEUE=true
REDIS_URL=redis://localhost:6379
```

```bash
KEEPER_USE_REDIS_QUEUE=false
# REDIS_URL có thể bỏ qua trong chế độ này
```

## Database migrations (SQL runner)

Legacy ORM integration has been removed from keeper runtime and package scripts.
Migrations are executed via SQL files in `db-migrations/migrations` using:

```bash
npm run db:migrate
```

### Safety checklist for staging -> production

1. Ensure `DATABASE_URL` points to the target environment.
2. Run `npm run db:migrate` in staging first.
3. Validate API and scheduler behavior in staging:
   - `POST /recipes/register`
   - `POST /recipes/status`
   - `GET /recipes/logs`
   - `GET /healthz`
4. Promote the same migration set to production.

### Migration tracking

The SQL runner stores applied migrations in `_sql_migrations` with checksum verification.
If a migration checksum changes after being applied, the runner will fail to prevent drift.

## DCA routing policy

`RECURRING_DCA` recipes use `dcaSwapRouteClient` to resolve a swap route on Arc Testnet and return a
`targetProtocolAddress` + `callData` pair for execution.

### Providers (controlled by `DCA_ROUTE_PROVIDER` in `.env`)

| Value | Aliases | Description |
|---|---|---|
| `ARC_LIFI_SWAP` | `LIFI_SWAP`, `LIFI` | Default. Uses `@lifi/sdk` with Arc Testnet chain registration. Intermittent on testnet. |
| `ARC_APP_KIT_SWAP` | `APP_KIT_SWAP`, `APP_KIT` | Circle Stablecoin Service — requires testnet liquidity. |
| `LIFI_DIRECT` | `LIFI_REST`, `LIFI_API` | LI.FI REST `/v1/quote` without SDK. Do **not** set `LIFI_API_KEY` or `LIFI_INTEGRATOR` (partner mode blocks the `fly` exchange). Intermittent. |
| `CURVE_DIRECT` | `CURVE`, `CURVE_STABLE` | **Recommended for Arc Testnet.** Calls Curve WUSDC/EURC pool (`0x311d3f55…`) directly via `ArcSwapAdapter`. Quotes on-chain, no external API dependency. |

### Recommended setup (Arc Testnet)

```bash
DCA_ROUTE_PROVIDER=CURVE_DIRECT
```

#### One-time on-chain setup (run once from RecipeGuardrail owner wallet)

```bash
# Whitelist ArcSwapAdapter (required for all DCA providers except LIFI direct)
node scripts/whitelist-appkit-swap-adapter.js

# Whitelist Curve WUSDC/EURC pool (required for CURVE_DIRECT)
node scripts/whitelist-curve-pool.js

# Or whitelist all at once
node scripts/whitelist-all-protocols.js
```

#### User USDC allowance

Users must `approve` `ArcSwapAdapter` (`0xbbd70b01…`) for their per-execution USDC amount before
DCA executes. The web SimulationModal shows current allowance and an **Approve USDC** button for
each spender that needs approval.

### Swap execution model (CURVE_DIRECT and ARC_APP_KIT_SWAP)

The `CurveDirectDcaSwapRouteClient` wraps the Curve `exchange()` call inside an
`ArcSwapAdapter.execute(instructions, tokenInputs, signature)` envelope. This lets the adapter
internally approve the pool before calling `exchange`, avoiding the
`ERC20: transfer amount exceeds allowance` revert that occurs when `RecipeExecutor` calls the pool
directly without a prior approve.

### API contract for `POST /recipes/register` with `recipeType=RECURRING_DCA`

- `swapProvider` accepts `ARC_APP_KIT_SWAP` or `ARC_LIFI_SWAP`; defaults to `ARC_LIFI_SWAP`.
- `targetProtocol` is not accepted.

## Endpoint smoke and cleanup for staging pipeline

Run smoke test and cleanup in one command:

```bash
npm run pipeline:smoke-cleanup
```

This command executes:

1. `scripts/smoke-endpoints.js`
2. `scripts/cleanup-test-data.js`

Environment options:

- `KEEPER_BASE_URL`: target keeper API base URL (default `http://localhost:8787`)
- `SMOKE_USER_ADDRESS`: user address used by smoke test
- `SMOKE_LOG_LIMIT`: logs endpoint limit for smoke verification
- `CLEANUP_USER_ADDRESS`: user address to cleanup (defaults to smoke test address)
- `PIPELINE_RUN_CLEANUP`: set `false` to skip cleanup
- `PIPELINE_CLEANUP_ON_FAILURE`: set `false` to skip cleanup if smoke fails

## API security hardening (P0)

Keeper now enforces security controls on protected endpoints (`/recipes/*`, `/metrics`):

1. Bearer token authentication (recommended required in production).
2. CORS allowlist (no wildcard origin).
3. Per-IP fixed-window rate limiting.

Environment variables:

- `KEEPER_API_REQUIRE_AUTH`: `true`/`false` (defaults to `true` in production mode).
- `KEEPER_API_AUTH_TOKEN`: required when auth is enabled.
- `KEEPER_CORS_ALLOWED_ORIGINS`: comma-separated origins.
- `KEEPER_API_RATE_LIMIT_WINDOW_MS`: rate-limit window duration.
- `KEEPER_API_RATE_LIMIT_MAX_REQUESTS`: max requests per IP in each window.
- `KEEPER_INTERNAL_ONLY_ENFORCED`: app-layer enforcement for internal-only endpoints.
- `KEEPER_INTERNAL_ONLY_PATHS`: comma-separated paths restricted to internal network.

Ingress/reverse-proxy policy (required in production):

- Keep `GET /healthz` and `GET /metrics` internal-only (cluster/private network).
- Expose `POST /recipes/register`, `POST /recipes/status`, `POST /recipes/dca/allowance-precheck`, `GET /recipes/logs` only through authenticated ingress.

Example Nginx policy snippet:

```nginx
location /healthz {
   allow 10.0.0.0/8;
   allow 172.16.0.0/12;
   allow 192.168.0.0/16;
   deny all;
   proxy_pass http://keeper_upstream;
}

location /metrics {
   allow 10.0.0.0/8;
   allow 172.16.0.0/12;
   allow 192.168.0.0/16;
   deny all;
   proxy_pass http://keeper_upstream;
}
```

Reference file: `deploy/nginx/keeper-internal-only.conf`.

Example call to protected endpoint:

```bash
curl -X POST http://localhost:8787/recipes/register \
   -H "Authorization: Bearer $KEEPER_API_AUTH_TOKEN" \
   -H "Content-Type: application/json" \
   -d '{"userAddress":"0x...","recipeType":"RECURRING_DCA"}'
```
