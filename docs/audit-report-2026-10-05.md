# Codebase Audit Report — DeFi Recipes on Arc

**Date:** 2026-10-05  
**Scope:** Full monorepo — `web/`, `keeper/`, `docs/`, `.github/`, `contracts/`  
**Commit:** `ddb652f`

---

## Summary

Audit covered 6 phases: discovery → classification → cleanup → refactor → validate → doc sync.
**5 verified issues** were fixed. No business behavior changed. All validation checks pass.

---

## Code Changes

| File | Change | Evidence |
|---|---|---|
| `web/package.json` | Removed `class-variance-authority` dependency | Zero imports in `src/`; only transitive consumers would keep it — confirmed not needed directly |
| `web/.env.example` | Removed duplicate `KEEPER_API_BASE_URL` entry (lines 24 and 27 identical) | Verified both lines pointed to same value; merged into single commented entry |
| `.github/workflows/ci.yml` | Added `find contracts -name '*.sol'` guard before `forge test` | `contracts/` is empty; CI was failing on every push. Guard exits 0 when no Solidity source exists |
| `keeper/README.md` | Rewrote stale "DCA routing policy" section | Section described `ARC_LIFI_SWAP` as default and omitted `CURVE_DIRECT`/`LIFI_DIRECT`; now reflects 4 providers, recommended setup, execution model and allowance flow |
| `docs/appkit-integration-prompt.md` | Deleted | Transient session prompt — not architecture documentation |
| `docs/dca-no-route-analysis.md` | Deleted | Session analysis superseded by `CURVE_DIRECT` implementation |
| `docs/lifi-vs-appkit-analysis.md` | Deleted | Session analysis superseded by implementation; conclusions in keeper/README.md |
| `docs/code-review-2025.md` | Deleted | Session output report, not a living doc |

---

## Dependency & Configuration

| Item | Status |
|---|---|
| `class-variance-authority` (web dep) | Removed — zero usage in src/ |
| `@lifi/sdk` (keeper dep) | **KEPT** — used by `LiFiArcDcaSwapRouteClient` (default `ARC_LIFI_SWAP` provider path). UNCERTAIN whether runtime import succeeds on Arc Testnet but removal would break the provider |
| `@circle-fin/app-kit` (keeper dep) | **KEPT** — used by `AppKitUnifiedBalanceProvider` when `ENABLE_UNIFIED_BALANCE=true`. Not active in default config but intentionally retained behind feature flag |
| `tailwindcss-animate` (web dep) | **KEPT** — required in `tailwind.config.js` plugins. Active usage via `animate-*` utility classes |
| `framer-motion` (web dep) | **KEPT** — used in `SimulationModal.tsx` and `RecipeCatalog.tsx` |
| Duplicate `KEEPER_API_BASE_URL` in `web/.env.example` | Fixed |
| `benchmark:perf` / `alerts:check` scripts in keeper | **KEPT** — reference `npm run build` internally (not `pnpm`). Low-risk; these are dev-only scripts |

---

## Documentation Changes

| File | Action | Reason |
|---|---|---|
| `keeper/README.md` DCA section | Rewritten | Reflected current 4 providers, CURVE_DIRECT recommendation, execution model |
| `docs/appkit-integration-prompt.md` | Deleted | Session prompt |
| `docs/dca-no-route-analysis.md` | Deleted | Superseded |
| `docs/lifi-vs-appkit-analysis.md` | Deleted | Superseded |
| `docs/code-review-2025.md` | Deleted | Session output |

---

## Validation

| Check | Command | Result |
|---|---|---|
| web TypeScript | `cd web && npx tsc --noEmit` | ✅ PASS (0 errors) |
| keeper TypeScript | `cd keeper && npx tsc --noEmit` | ✅ PASS (0 errors) |
| keeper unit tests | `cd keeper && npx vitest run` | ✅ PASS (13 suites, 91/91 tests) |
| web production build | `cd web && CI=true node scripts/next-build.js` | ✅ PASS (compiled in 49s, 0 lint errors) |

---

## Risks & Uncertainties

| Item | Assessment |
|---|---|
| `@circle-fin/app-kit` in keeper | Loaded dynamically only when `ENABLE_UNIFIED_BALANCE=true`. No test exercises the real network call. Risk: LOW (feature flag off by default) |
| `gatewayClient` / `unifiedBalanceClient` / `factory.ts` | ACTIVE behind feature flags; tested in `circleIntegration.test.ts` with mocks only. No production traffic observed. Kept as-is — removing would change API surface |
| `benchmark:perf` script uses `npm run build` | Should be `pnpm run build` to match project toolchain. Low-risk; dev-only. Not changed to avoid unintended side effects |
| `docs/design-system.md` color tokens | Describes HSL tokens not matching actual CSS variables in `globals.css` (which now uses `--ink`, `--muted`, `--accent` etc.). Stale design doc — not updated because full design-system doc rewrite was out of scope |
| `docs/feature-x-production-runbook.md` | Contains some placeholder env names. Kept — partial accuracy; full rewrite out of scope |
| `probe-lifi-direct.js` not in package.json scripts | Operational script without a named alias. No risk — can be run with `node scripts/probe-lifi-direct.js` |

---

## Remaining Technical Debt

1. **`benchmark:perf` and `alerts:check` use `npm run build`** instead of `pnpm run build`. Should be updated to match project package manager.
2. **`docs/design-system.md`** describes CSS token names (`--primary`, `--card`) from the old design system, not the current `globals.css` (`--ink`, `--muted`, `--accent`). Needs a full rewrite.
3. **`GatewayClient` / `UnifiedBalanceClient` / `AppKitUnifiedBalanceProvider`** — feature-flagged infrastructure with no production traffic. If these features are not on the roadmap, consider removing in a future cleanup pass (requires confirming with product owner).
4. **`@lifi/sdk`** — still in `keeper/package.json` as a runtime dep. `LiFiArcDcaSwapRouteClient` uses it but `CURVE_DIRECT` is now the recommended testnet provider. If LI.FI support is fully deprecated, the SDK and its client class can be removed.
5. **`docs/naming-conventions.md`** contains Solidity naming rules but `contracts/` is empty. Consider removing the Solidity section or adding a note that contracts are not yet in-repo.

---

## Recommendations

1. Set `DCA_ROUTE_PROVIDER=CURVE_DIRECT` in production `keeper/.env` (or confirm already set).
2. Run `node keeper/scripts/whitelist-all-protocols.js` from guardrail owner wallet if not already done.
3. Update `benchmark:perf` and `alerts:check` scripts to use `pnpm` instead of `npm`.
4. Schedule a follow-up doc pass for `docs/design-system.md` to reflect current CSS tokens.
5. Decide fate of `GatewayClient`/`UnifiedBalanceClient` — keep with `ENABLE_UNIFIED_BALANCE=true` docs or remove if not on roadmap.
