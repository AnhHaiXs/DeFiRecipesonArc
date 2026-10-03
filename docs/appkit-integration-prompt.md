# Prompt: Tích hợp toàn bộ Circle App Kit vào DeFi Recipes on Arc (web/)

## Mục tiêu

Tích hợp **tất cả** các tính năng của `@circle-fin/app-kit` vào project `web/` (Next.js).
- **Chỉ frontend** — không có backend, không có server route mới (các `/api/*` route hiện có giữ nguyên)
- **Browser wallet** — người dùng kết nối ví của họ (RainbowKit / wagmi đã có sẵn)
- **Keyless / permissionless** — không dùng Kit Key, không dùng private key trong browser
- **Arc Testnet** mặc định — mọi tính năng testnet-ready; mainnet chỉ khi user xác nhận

---

## App Kit capabilities cần tích hợp

`@circle-fin/app-kit` bao gồm 4 tính năng chính. Tích hợp **tất cả 4**:

### 1. Swap (USDC ↔ EURC, cross-chain tokens)

**Skill:** `swap-tokens`

**Yêu cầu:**
- Dùng `kit.estimateSwap()` để lấy quote trước khi thực hiện
- Dùng `kit.swap()` chỉ từ button click của user (KHÔNG auto-call)
- Adapter: `createViemAdapterFromProvider({ provider })` từ `@circle-fin/adapter-viem-v2`
- Lấy provider từ `connector.getProvider()` (wagmi), KHÔNG dùng `window.ethereum`
- Chain identifier: string `"Arc_Testnet"` hoặc `"Arc"` (KHÔNG dùng `SwapChain` enum nếu SDK không cần)
- Hiển thị quote (rate, fee, slippage) TRƯỚC khi cho phép bấm Swap
- **Arc rule**: USDC ↔ NATIVE là no-op — detect và reject trước khi routing
- **Testnet limitation**: USDC↔EURC route chỉ có trên Arc mainnet (LiFi không có testnet liquidity) — hiển thị banner cảnh báo rõ ràng khi `NEXT_PUBLIC_ARC_CHAIN=Arc_Testnet`
- File hiện có: `web/src/lib/appkit/swap-client.ts`, `web/src/components/SwapPanel.tsx`

**Env var:** `NEXT_PUBLIC_ARC_CHAIN=Arc_Testnet` (testnet) hoặc `=Arc` (mainnet)

---

### 2. Bridge (USDC cross-chain via CCTP)

**Skill:** `bridge-stablecoin`

**Yêu cầu:**
- Dùng `kit.bridge()` — App Kit orchestrate toàn bộ CCTP lifecycle (approve → burn → fetchAttestation → mint)
- Adapter: `createViemAdapterFromProvider` cho source; destination có thể là cùng adapter hoặc address khác
- Chain identifiers: string như `"Arc_Testnet"`, `"Base_Sepolia"`, `"Ethereum_Sepolia"` (KHÔNG dùng numeric chain ID)
- Không cần Kit Key — bridge là permissionless
- **Supported testnet bridges:** Arc_Testnet ↔ Base_Sepolia, Arc_Testnet ↔ Ethereum_Sepolia (và các chain CCTP hỗ trợ)
- Subscribe events: `kit.on('bridge:stepUpdated', ...)` để hiển thị progress real-time (approve → burn → attestation → mint)
- Recovery: dùng `kit.retry(result, ...)` khi soft error — KHÔNG re-call `kit.bridge()` từ đầu
- Hiển thị: source chain, destination chain, recipient, amount TRƯỚC khi user confirm
- Tạo component `BridgePanel.tsx` mới tại `web/src/components/BridgePanel.tsx`
- Tạo page `/bridge` tại `web/src/app/bridge/page.tsx`
- Thêm link Bridge vào `Navbar.tsx`

**Reference:** `skills/built-in/bridge-stablecoin/references/adapter-wagmi.md`

---

### 3. Send (USDC transfer cùng chain)

**Skill:** `payments`

**Yêu cầu:**
- Direct USDC send từ user wallet đến địa chỉ bất kỳ trên cùng chain
- Input: recipient address (validate `0x...` format) + amount (validate > 0, ≤ balance)
- Dùng wagmi `useWriteContract` + USDC ERC-20 `transfer()` — KHÔNG cần App Kit cho same-chain send thuần túy
  - Hoặc nếu App Kit có `kit.send()`, dùng đó
- Kiểm tra chain: user phải đang ở Arc Testnet (chain ID `5042002`) trước khi send
- Hiển thị tx hash + explorer link sau khi confirmed
- Tạo component `SendPanel.tsx` tại `web/src/components/SendPanel.tsx`
- Tạo page `/send` tại `web/src/app/send/page.tsx`
- Thêm link Send vào `Navbar.tsx`

**Arc rule:**
- USDC ERC-20 address trên Arc Testnet: `0x3600000000000000000000000000000000000000`
- 6 decimals cho ERC-20 view; dùng `parseUnits(amount, 6)` cho transfer
- KHÔNG hiển thị cả native balance lẫn ERC-20 balance riêng — chúng là cùng 1 pool

---

### 4. Unified Balance (cross-chain USDC balance)

**Skill:** `unify-balance`

**Yêu cầu:**
- Dùng `kit.unifiedBalance.getBalances({ adapter })` để đọc USDC balance tổng hợp across chains
- Dùng `kit.unifiedBalance.deposit({ from, amount })` để deposit vào unified balance
- Dùng `kit.unifiedBalance.spend({ to, amount })` để spend từ unified balance sang chain cụ thể
- Adapter: EIP-1193 browser wallet adapter từ `@circle-fin/adapter-viem-v2`
- Không cần Kit Key
- Hiển thị balance breakdown per chain
- Tạo component `UnifiedBalancePanel.tsx` tại `web/src/components/UnifiedBalancePanel.tsx`
- Tạo page `/unified-balance` tại `web/src/app/unified-balance/page.tsx`
- Thêm link vào `Navbar.tsx`

**Reference:** `skills/built-in/unify-balance/references/adapter-eip1193.md`

---

## Shared AppKit singleton

Tất cả 4 tính năng dùng **cùng một `AppKit` instance** — không tạo mới mỗi component:

```ts
// web/src/lib/appkit/client.ts
import { AppKit } from '@circle-fin/app-kit';

let _kit: AppKit | null = null;
export function getAppKit(): AppKit {
  if (!_kit) _kit = new AppKit();
  return _kit;
}
```

Import `getAppKit()` từ tất cả các panel thay vì `new AppKit()` riêng lẻ.

---

## Shared adapter helper

```ts
// web/src/lib/appkit/adapter.ts
'use client';
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2';
import type { EIP1193Provider } from 'viem';
import type { Connector } from 'wagmi';

export async function getBrowserAdapter(connector: Connector | undefined) {
  if (!connector) throw new Error('Wallet not connected. Please connect a wallet first.');
  const provider = (await connector.getProvider()) as EIP1193Provider;
  return createViemAdapterFromProvider({ provider });
}
```

---

## Navbar navigation

Cập nhật `web/src/components/Navbar.tsx` thêm 4 navigation items:

| Label | Path |
|-------|------|
| Swap | `/swap` |
| Bridge | `/bridge` |
| Send | `/send` |
| Unified Balance | `/unified-balance` |

---

## Constraints

1. **Không backend** — tất cả chạy client-side trong browser
2. **Không Kit Key** — omit hoàn toàn, không expose qua `NEXT_PUBLIC_*`
3. **Không `window.ethereum` trực tiếp** — luôn dùng `connector.getProvider()` từ wagmi
4. **Không auto-invoke** — `swap()`, `bridge()`, `send()` chỉ được call từ button click handler
5. **Chain validation** — kiểm tra user đang đúng chain trước mỗi tx; nếu sai, prompt switch chain
6. **Error boundaries** — mỗi panel bắt lỗi và hiển thị message thân thiện; không crash toàn trang
7. **TypeScript strict** — không dùng `any`, không `@ts-ignore`; `bun run check` phải pass 0 errors
8. **Testnet default** — default sang testnet; mainnet chỉ khi `NEXT_PUBLIC_ARC_CHAIN=Arc` được set
9. **Arc dual-view rule** — USDC ERC-20 (6 decimals) cho display/transfer; native (18 decimals) chỉ cho gas; KHÔNG hiển thị hoặc sum cả hai

---

## Files cần tạo mới

```
web/src/lib/appkit/client.ts           # Singleton AppKit instance
web/src/lib/appkit/adapter.ts          # Shared browser adapter helper
web/src/components/BridgePanel.tsx     # Bridge UI
web/src/components/SendPanel.tsx       # Send UI
web/src/components/UnifiedBalancePanel.tsx  # Unified balance UI
web/src/app/bridge/page.tsx            # /bridge route
web/src/app/send/page.tsx              # /send route
web/src/app/unified-balance/page.tsx   # /unified-balance route
```

## Files cần update

```
web/src/lib/appkit/swap-client.ts      # Dùng shared client.ts + adapter.ts
web/src/components/SwapPanel.tsx       # Dùng shared adapter
web/src/components/Navbar.tsx          # Thêm nav links
```

---

## Verification

Sau khi xong, chạy:
```bash
cd web && npx tsc --noEmit   # 0 errors
```

Build local phải thành công:
```bash
cd web && CI=true node scripts/next-build.js
```

Tất cả 4 route (`/swap`, `/bridge`, `/send`, `/unified-balance`) phải render được khi connect ví.
