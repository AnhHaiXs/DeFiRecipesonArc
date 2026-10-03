# Security Audit Report — DeFi Recipes on Arc
**Date:** 2026-10-03  
**Scope:** `web/`, `keeper/`, `docs-site/`  
**Package manager:** pnpm v12.8.1  
**Node:** v24.21.0

---

## 1. Initial Audit Results

### web/ — 8 vulnerabilities (1 low, 2 moderate, 5 high, 0 critical)

| Severity | Package | Vulnerable Range | Dev-only |
|----------|---------|-----------------|----------|
| LOW | elliptic | <=6.6.1 | No (via @circle-fin/app-kit → @ethersproject) |
| MODERATE | brace-expansion v1 | <1.1.21 | Yes (via eslint) |
| MODERATE | brace-expansion v5 | >=4.0.0 <5.0.12 | Yes (via eslint-config-next) |
| HIGH | brace-expansion v1 | <1.1.20 | Yes (via eslint) |
| HIGH | brace-expansion v1 | <1.1.19 | Yes (via eslint) |
| HIGH | brace-expansion v5 | <5.0.11 | Yes (via eslint-config-next) |
| HIGH | brace-expansion v5 | <5.0.10 | Yes (via eslint-config-next) |
| HIGH | braces | <=3.0.3 | No (via tailwindcss) |

### keeper/ — 17 vulnerabilities (1 low, 6 moderate, 9 high, 1 critical)

| Severity | Package | Vulnerable Range | Dev-only |
|----------|---------|-----------------|----------|
| CRITICAL | vitest | <3.2.6 | Yes — arbitrary file read/exec via UI server |
| HIGH | brace-expansion v1 | <1.1.17/18/19/20/21 | Yes (via ts-node-dev) |
| HIGH | toml | <4.1.2, <4.2.0 | No (via @circle-fin/app-kit → @coral-xyz/anchor) |
| HIGH | braces | <=3.0.3 | Yes (via ts-node-dev → chokidar) |
| HIGH | vite | <=6.4.2 | Yes (via vitest) |
| HIGH | nanoid | <3.3.18 | Yes (via vitest → vite → postcss) |
| MODERATE | esbuild | <=0.24.2 | Yes (via vitest) |
| MODERATE | vite | <=6.4.1/2 | Yes (via vitest) |
| MODERATE | uuid | <11.1.1 | No (via @circle-fin/app-kit → @solana/web3.js) |
| MODERATE | stream-json | <=3.4.0 | No (via @circle-fin/app-kit → jayson) |
| MODERATE | vitest/mocker | <4.1.11 | Yes — path traversal |
| LOW | elliptic | <=6.6.1 | No (via @circle-fin/app-kit) |

### docs-site/ — 1 vulnerability (0 low, 0 moderate, 0 high, 1 critical)

| Severity | Package | Vulnerable Range | Dev-only |
|----------|---------|-----------------|----------|
| CRITICAL | next | >=16.2.0 <16.3.6 | No — Remote Code Execution in next/og ImageResponse |

---

## 2. Fixes Applied

### docs-site/ — CRITICAL fixed
- `next` bumped from `^16.0.0` → `^16.3.6` in `package.json` (resolved to 16.3.8)
- `allowBuilds: esbuild: true, sharp: true` added to `pnpm-workspace.yaml` (was blocking install of new next's esbuild)

### web/ — pnpm-workspace.yaml overrides updated
All existing `brace-expansion` overrides were stale (pointing to 1.1.17, 5.0.9). Updated to cover the full advisory range:
- `brace-expansion@<1.1.17/18/19/20/21` → `^1.1.21`
- `brace-expansion@>=4.0.0 <5.0.9/10/11/12` → `^5.0.12`
- `stream-json@<=3.4.0` → `^3.5.0` (was pointing to 3.4.1 which is still vulnerable)
- `toml@<4.1.2` → `^4.2.0`
- `vite@<=6.4.2` → `^6.4.3` (added)
- Added all new patched versions to `minimumReleaseAgeExclude`

### keeper/ — pnpm-workspace.yaml overrides added (new file section)
- `brace-expansion` full range overrides (same as web)
- `nanoid@<3.3.18` → `^3.3.18`
- `toml@<4.1.2/<4.2.0` → `^4.2.0`
- `stream-json@<=3.4.0` → `^3.5.0`
- `uuid@<11.1.1` → `^11.1.1`
- `vite@<=6.4.2` → `^6.4.3`

### keeper/ — vitest bumped
- `vitest` in `package.json` bumped from `3.2.6` → `^4.1.11`
  - Resolves: CRITICAL (3.x arbitrary file read), MODERATE path traversal via @vitest/mocker
  - `esbuild` upgraded from 0.21.5 → 0.25.12 (also fixes the esbuild dev-server leak advisory)

---

## 3. Final Audit Results

### web/ — 2 remaining (down from 8)
| Severity | Package | Why it cannot be fixed |
|----------|---------|------------------------|
| HIGH | braces <=3.0.3 | `patched_versions: null, patched_versions_unpublished: true` — fix was committed to the repo but never published to npm. No version >=3.0.4 exists. Cannot override to a non-existent version. |
| LOW | elliptic <=6.6.1 | `patched_versions: null, patched_versions_unpublished: true` — 6.6.1 is the latest npm release. The advisory (GHSA-848j-6mx2-7j84) is LOW severity (CWE-1240: use of risky crypto primitive). No override possible. Introduced transitively by `@ethersproject` which is a transitive dep of `@circle-fin/app-kit`. |

### keeper/ — 2 remaining (down from 17)
| Severity | Package | Why it cannot be fixed |
|----------|---------|------------------------|
| HIGH | braces <=3.0.3 (dev-only) | Same as above — no patched version published. Only present via `ts-node-dev → chokidar`, which is a development-time watcher only. Not present in production runtime (`pnpm start`). |
| LOW | elliptic <=6.6.1 | Same as above — introduced by `@circle-fin/app-kit`. |

### docs-site/ — 0 remaining ✅

---

## 4. Build & Test Results

| Package | Build | Tests | Lint/Typecheck |
|---------|-------|-------|----------------|
| web/ | ✅ Next.js prod build succeeded (7 routes compiled) | n/a | ✅ No ESLint warnings or errors |
| keeper/ | ✅ `tsc` compiled without errors | ✅ 91/91 tests passed (13 test files) | ✅ tsc clean |
| docs-site/ | n/a (not built, no code changes) | n/a | ✅ `tsc --noEmit` clean |

---

## 5. Summary: Why the 2 Remaining Vulns Cannot Be Fixed

### braces (HIGH, GHSA-vfj7-8cjw-p6xm)
- **Current version:** 3.0.3 (latest published)
- **Patched version:** advisory lists `patched_versions_unpublished: true` — the fix exists in git but npm registry has no release ≥3.0.4
- **A pnpm override cannot point to a non-existent npm version**
- **Risk context (web/):** present at build/lint time only via tailwindcss → micromatch/chokidar. Exploiting a stack-exhaustion DoS requires feeding deeply nested glob patterns to tailwindcss during a build, not at runtime.
- **Risk context (keeper/):** dev-only via `ts-node-dev → chokidar`. Not present in `dist/` production runtime at all.
- **Recommended remediation:** Watch the npm registry for a braces 3.0.4+ release and add the override then. Alternatively, when tailwindcss releases a version that pins micromatch ≥3.1.0 (which itself pinned a fixed braces), update tailwindcss.

### elliptic (LOW, GHSA-848j-6mx2-7j84)
- **Current version:** 6.6.1 (latest published)
- **Severity:** LOW — CWE-1240 (use of a cryptographic primitive with risky implementation). Not a direct exploit.
- **Introduced by:** `@ethersproject/signing-key` which is a deep transitive dep of `@circle-fin/app-kit`. The fix requires Circle to update their SDK.
- **Recommended remediation:** Once `@circle-fin/app-kit` releases a version that drops `@ethersproject` or upgrades it to a version that replaces `elliptic`, update the Circle SDK.
