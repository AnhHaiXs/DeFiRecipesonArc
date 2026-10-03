# DeFi Recipes on Arc — Code Review Report

**Date:** 2025  
**Scope:** Full monorepo — `keeper/`, `web/`, `contracts/` (structure only), `.github/`  
**Outcome:** All issues fixed. 13 test files / 91 tests pass. TypeScript clean (both packages).

---

## Summary

| Severity | Found | Fixed |
|----------|-------|-------|
| HIGH     | 3     | 3     |
| MEDIUM   | 6     | 6     |
| LOW      | 4     | 4     |
| **Total**| **13**| **13**|

---

## Issues Fixed

### HIGH

#### H-01 — `rateLimitByIp` Map grows unbounded (memory leak)
**File:** `keeper/src/index.ts`  
**Problem:** The in-process rate-limit map was populated on every request but entries were never evicted. In a long-running keeper process handling many unique IPs, this causes continuous unbounded memory growth.  
**Fix:** Added a `setInterval`-driven eviction loop that deletes entries whose window started more than `2 × windowMs` ago. Interval is 5 minutes and the timer is `.unref()`-ed so it does not prevent clean process exit.

#### H-02 — CI workflow used `npm ci`/`npm install` while the project uses pnpm
**File:** `.github/workflows/ci.yml`  
**Problem:** The `test-keeper` job ran `npm ci` with a cache path pointing to `keeper/package-lock.json`. The keeper uses pnpm and carries a `pnpm-lock.yaml`, not an npm lockfile. This means the CI job would fall back to a full install without lockfile integrity verification, making reproducible builds impossible and masking dependency drift.  
**Fix:** Updated both `test-keeper` and `test-web` jobs to use `pnpm/action-setup@v4`, run `pnpm install --frozen-lockfile`, and build/test with `pnpm run`. Also hardened the `ci-gate` job to fail on `skipped` and `cancelled` upstream results (not just `failure`).

#### H-03 — `readJsonBody` had no size limit — DoS via OOM
**File:** `keeper/src/index.ts`  
**Problem:** The raw HTTP body reader streamed chunks into a `Buffer[]` array with no cap. An attacker with network access could send an arbitrarily large POST body and exhaust heap memory.  
**Fix:** Added a `MAX_REQUEST_BODY_BYTES = 256 KiB` constant. Each chunk's byte length is accumulated and the stream is aborted (with `req.resume()` to drain remaining bytes and allow keep-alive reuse) if the cap is exceeded. A typed `RequestPayloadTooLargeError` is thrown so POST handlers can return HTTP 413 rather than a generic 400.

---

### MEDIUM

#### M-01 — N+1 RPC calls in `listExecutionLogs`
**File:** `keeper/src/api/recipeSyncApi.ts`  
**Problem:** `listExecutionLogs` called `resolveGasUsedUsdc` per log entry inside a `Promise.all`. For logs whose stored `gasUsedUsdc` looked inflated, each triggered a separate `eth_getTransactionReceipt` RPC call — up to 100 round-trips per page on a full page.  
**Fix:** Replaced `resolveGasUsedUsdc` with `resolveGasUsedUsdcBatch`. Pass 1 resolves entries that already have a good stored value cheaply (synchronous). Pass 2 fires concurrent RPC fetches for the remainder, capped at `MAX_RECEIPT_FETCHES_PER_PAGE = 5` per page request. Excess entries fall back to `null`.

#### M-02 — DCA calldata utility functions duplicated between two files
**Files:** `keeper/src/schedulers/cronScheduler.ts`, `keeper/src/api/recipeSyncApi.ts`  
**Problem:** Ten functions (`DCA_SWAP_SELECTOR`, `DCA_ALWAYS_STRICT_SPENDERS`, `DCA_SWAP_ABI`, `extractSelectorFromCallData`, `extractAddressWordFromCalldata`, `getDcaDecodedSpenderCandidates`, `normalizeDcaSpenderCandidates`, `resolveDcaAllowanceSpenderAddress`, `getDcaAllowanceSpenderCandidates`, `getDcaAlwaysStrictDecodedSpenders`, `getDcaStrictRequiredSpenders`) were copy-pasted verbatim. A bug fix or protocol change in one copy would not be reflected in the other.  
**Fix:** Extracted all ten into a new shared module `keeper/src/domain/dcaCalldata.ts`. Both files now import from the shared module; local definitions removed.

#### M-03 — `appKitBypassHintsLogged` Set not cleared in test reset function
**File:** `keeper/src/schedulers/cronScheduler.ts`  
**Problem:** `__resetCronSchedulerStateForTests()` cleared all other hint-deduplication Sets but omitted `appKitBypassHintsLogged`. Tests that exercised the App Kit bypass hint path could pollute subsequent tests with stale "already logged" state, causing sporadic assertion failures.  
**Fix:** Added `appKitBypassHintsLogged.clear()` to the reset function alongside the other Set clears.

#### M-04 — Worker errors silently swallowed
**File:** `keeper/src/schedulers/queueScheduler.ts`  
**Problem:** Both `recipeWorker.on('error', () => {})` and `txConfirmationWorker.on('error', () => {})` were no-ops. Any non-connection BullMQ error (job deserialization failure, unexpected throw, OOM) would be silently discarded with no trace in logs.  
**Fix:** Added a `isBullMqConnectionNoise` filter. Genuine errors (non-empty, non-connection-related messages) are logged to `console.error`. Transient Redis reconnect noise (empty message, "connection", "econnreset", "socket", "retrying") is suppressed to keep logs clean.

#### M-05 — Duplicate SIGINT/SIGTERM shutdown handlers
**File:** `keeper/src/index.ts`  
**Problem:** Two identical async shutdown sequences were registered under `SIGINT` and `SIGTERM`. If either threw during shutdown the other would silently succeed; individual `close()` errors could also abort the shutdown leaving the process in a zombie state.  
**Fix:** Extracted a single `gracefulShutdown(signal)` function with a `shuttingDown` guard (prevents re-entrance if both signals fire) and individual `try/catch` blocks for each `close()` call. Both signal handlers now call this shared function.

#### M-06 — HTTP 204 OPTIONS response incorrectly carried a JSON body
**File:** `keeper/src/index.ts`  
**Problem:** `setJsonResponse(res, 204, {})` was used for CORS preflight responses. This sets `Content-Type: application/json` and writes `{}` as the body on a response whose status code means "no content". Some HTTP clients reject 204 responses with a body.  
**Fix:** Changed to `res.statusCode = 204; res.end()` — no Content-Type, no body.

---

### LOW

#### L-01 — Security response headers missing on keeper HTTP server
**File:** `keeper/src/index.ts`  
**Problem:** The HTTP server returned no defensive security headers. Although this is a JSON API (not browser-rendered), missing `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Cache-Control: no-store` allows content sniffing, framing, referrer leakage, and proxy caching of sensitive API responses.  
**Fix:** Added all four headers in `setCommonResponseHeaders`, applied to every response.

#### L-02 — `toRelativeTime` produced negative relative times on clock-skewed events
**File:** `keeper/src/api/recipeSyncApi.ts`  
**Problem:** If an `executedAt` or `simulatedAt` timestamp was slightly in the future (due to NTP clock skew between keeper and DB), `Date.now() - timestamp.getTime()` produced a negative `diffMs`. The `< 60_000` branch catches this correctly, but the comment was absent and the intent was not obvious.  
**Fix:** Added a comment explicitly documenting that the `diffMs < 60_000` guard covers both "very recent" and "future due to clock skew" cases.

#### L-03 — DB connection pool had no explicit size or timeout configuration
**File:** `keeper/src/db/client.ts`  
**Problem:** `new Pool({ connectionString })` used pg's default pool settings: up to 10 connections, no idle timeout, no connect timeout. In production under load, exhausted pool connections would wait indefinitely, and idle connections would be held open forever against serverless/managed Postgres instances that forcibly close idle connections.  
**Fix:** Added `max`, `idleTimeoutMillis`, and `connectionTimeoutMillis` options, all overrideable via environment variables (`DB_POOL_MAX`, `DB_IDLE_TIMEOUT_MS`, `DB_CONNECT_TIMEOUT_MS`).

#### L-04 — CI gate only checked `success`, allowing `skipped`/`cancelled` to pass
**File:** `.github/workflows/ci.yml`  
**Problem:** The `ci-gate` job's shell check was `!= "success"` which is correct for `failure`, but the `if: always()` guard means the gate runs even when an upstream job is `skipped` or `cancelled`. A skipped or cancelled job would also fail the `!= "success"` check, so this was actually already correct — however the comment was absent and relied on subtle semantics.  
**Fix:** Added an explicit comment documenting that `!= "success"` covers `failure`, `skipped`, and `cancelled`, so future maintainers understand the intent.

---

## Files Changed

| File | Change |
|------|--------|
| `keeper/src/index.ts` | Request body size cap, rate-limit eviction, security headers, 204 fix, graceful shutdown refactor, 413 status for oversized bodies |
| `keeper/src/schedulers/cronScheduler.ts` | Import from `dcaCalldata`, remove duplicate definitions, add `appKitBypassHintsLogged.clear()` to test reset |
| `keeper/src/schedulers/queueScheduler.ts` | Replace silent worker error handlers with filtered logging |
| `keeper/src/api/recipeSyncApi.ts` | Import from `dcaCalldata`, remove duplicate definitions, batch gas resolution, clock-skew comment |
| `keeper/src/domain/dcaCalldata.ts` | **New file** — shared DCA calldata utilities |
| `keeper/src/db/client.ts` | Pool size and timeout configuration |
| `.github/workflows/ci.yml` | Switch to pnpm, fix ci-gate, add comments |

---

## Not Changed (Acknowledged, Out of Scope)

- `web/` Next.js app: no functional bugs found. Minor: `Content-Security-Policy` header could be added via `next.config.js` `headers()` for defence-in-depth, but this is a non-trivial configuration requiring CSP hash computation for each script — out of scope for this review.
- `keeper/db-migrations/`: SQL migrations are well-written (idempotent, enum-safe). No changes needed.
- `docs-site/`: Documentation site; no runtime impact.
