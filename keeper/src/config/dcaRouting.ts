const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

export const ARC_USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const;
export const ARC_EURC_ADDRESS = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a' as const;
export const ARC_CIRBTC_ADDRESS = '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF' as const;
export const ARC_APP_KIT_DCA_USDC_SPENDER = '0xf992efcb5fa2ed7cb48310d9dd8cb4ce5fb7ddc9' as const;

// Circle Stablecoin Kit adapter contract on Arc Testnet. Every App Kit swap is a single
// `execute(ExecutionParams,TokenInput[],bytes)` call against this contract.
export const ARC_SWAP_ADAPTER_ADDRESS = '0xbbd70b01a1cabc96d5b7b129ae1aaabdf50dd40b' as const;
export const ARC_SWAP_ADAPTER_EXECUTE_SELECTOR = '0xaa3e079c' as const;

// LI.FI Fly DEX router on Arc Testnet (chainId=5042002).
// Verified live: GET /v1/quote returns transactionRequest.to = approvalAddress = this address.
// Source: li.quest/v1/quote?fromChain=5042002&toChain=5042002&fromToken=USDC&toToken=EURC
export const LIFI_FLY_DEX_ROUTER_ARC_TESTNET = '0xff70f4a1d11995621854f3692acf286d8acd04b2' as const;

// Curve StableSwap pool WUSDC/EURC on Arc Testnet (chainId=5042002).
// Verified on-chain 2026-10-05:
//   coin[0] = USDC (0x3600...), coin[1] = EURC (0x89B5...)
//   balances: ~170k USDC / ~18k EURC (4935 LP holders)
//   get_dy(0, 1, 1_000_000) = ~891_883 (0.89 EURC per 1 USDC, skewed pool)
//   exchange(i=0, j=1, dx, min_dy) — approve pool as spender before calling
//   Source: explorer.testnet.arc.io/address/0x0714027E44802b2Ff76389daF5371990CC3a4C24
export const CURVE_USDC_EURC_POOL_ARC_TESTNET = '0x0714027e44802b2ff76389daf5371990cc3a4c24' as const;
// Coin indices for CURVE_USDC_EURC_POOL_ARC_TESTNET
export const CURVE_POOL_USDC_INDEX = 0 as const;   // coin[0] = USDC
export const CURVE_POOL_EURC_INDEX = 1 as const;   // coin[1] = EURC


export const ARC_TESTNET_SUPPORTED_TOKENS = ['USDC', 'EURC', 'cirBTC'] as const;
export type ArcTestnetTokenSymbol = (typeof ARC_TESTNET_SUPPORTED_TOKENS)[number];

const ARC_TESTNET_TOKEN_BY_NORMALIZED_SYMBOL: Record<string, ArcTestnetTokenSymbol> = {
  usdc: 'USDC',
  eurc: 'EURC',
  cirbtc: 'cirBTC',
};

export const DEFAULT_DCA_TARGET_ASSET_SYMBOL: ArcTestnetTokenSymbol = 'EURC';

export const DEFAULT_DCA_MAX_SLIPPAGE_BPS = 100;
export const MIN_DCA_SLIPPAGE_BPS = 10;
export const MAX_DCA_SLIPPAGE_BPS = 1000;

export function normalizeAddressOrNull(value: unknown): `0x${string}` | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (!ADDRESS_REGEX.test(normalized)) {
    return null;
  }

  return normalized.toLowerCase() as `0x${string}`;
}

export function parseDcaMaxSlippageBpsStrict(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error('maxSlippageBps must be an integer.');
  }

  if (value < MIN_DCA_SLIPPAGE_BPS || value > MAX_DCA_SLIPPAGE_BPS) {
    throw new Error(
      `maxSlippageBps must be between ${MIN_DCA_SLIPPAGE_BPS} and ${MAX_DCA_SLIPPAGE_BPS}.`
    );
  }

  return value;
}

export function parseDcaMaxSlippageBpsWithFallback(value: unknown): {
  maxSlippageBps: number;
  usedFallback: boolean;
} {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return { maxSlippageBps: DEFAULT_DCA_MAX_SLIPPAGE_BPS, usedFallback: true };
  }

  if (value < MIN_DCA_SLIPPAGE_BPS || value > MAX_DCA_SLIPPAGE_BPS) {
    return { maxSlippageBps: DEFAULT_DCA_MAX_SLIPPAGE_BPS, usedFallback: true };
  }

  return { maxSlippageBps: value, usedFallback: false };
}

function normalizeSupportedArcTokenSymbol(value: unknown): ArcTestnetTokenSymbol | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  return ARC_TESTNET_TOKEN_BY_NORMALIZED_SYMBOL[normalized] ?? null;
}

export function parseDcaTargetAssetSymbolStrict(value: unknown): ArcTestnetTokenSymbol {
  const normalized = normalizeSupportedArcTokenSymbol(value);
  if (!normalized) {
    throw new Error(
      `targetAssetSymbol must be one of: ${ARC_TESTNET_SUPPORTED_TOKENS.join(', ')}.`
    );
  }

  return normalized;
}

export function parseDcaTargetAssetSymbolWithFallback(value: unknown): {
  targetAssetSymbol: ArcTestnetTokenSymbol;
  usedFallback: boolean;
} {
  const normalized = normalizeSupportedArcTokenSymbol(value);
  if (!normalized) {
    return {
      targetAssetSymbol: DEFAULT_DCA_TARGET_ASSET_SYMBOL,
      usedFallback: true,
    };
  }

  return {
    targetAssetSymbol: normalized,
    usedFallback: false,
  };
}
