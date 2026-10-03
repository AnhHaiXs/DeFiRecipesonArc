'use client';

import { AppKit, SwapChain } from '@circle-fin/app-kit';
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2';
import type { EIP1193Provider } from 'viem';
import type { Connector } from 'wagmi';

export type FxToken = 'USDC' | 'EURC';

export type QuoteResult = {
  amountOut: string;
  effectiveRate: string;
};

export type ExecuteResult = {
  amountOut?: string;
  txHash?: string;
};

// Resolve chain from env. Defaults to Arc_Testnet.
// USDC↔EURC swaps are only available on Arc mainnet (the LiFi aggregator has no
// testnet liquidity for this pair). Set NEXT_PUBLIC_ARC_CHAIN=Arc for mainnet.
const envChain = process.env.NEXT_PUBLIC_ARC_CHAIN ?? 'Arc_Testnet';
export const SWAP_CHAIN: SwapChain =
  (SwapChain as Record<string, SwapChain>)[envChain] ?? SwapChain.Arc_Testnet;

// True when running on testnet — USDC↔EURC routes are unavailable.
export const SWAP_REQUIRES_MAINNET = SWAP_CHAIN === SwapChain.Arc_Testnet;

let cachedKit: AppKit | null = null;

function kit() {
  if (!cachedKit) {
    cachedKit = new AppKit();
  }
  return cachedKit;
}

// Prefer connector.getProvider() (wagmi-managed) over window.ethereum directly.
// Falls back to window.ethereum for environments where no connector is passed.
async function getAdapter(connector?: Connector) {
  let provider: EIP1193Provider;

  if (connector) {
    provider = (await connector.getProvider()) as EIP1193Provider;
  } else if (typeof window !== 'undefined' && window.ethereum) {
    provider = window.ethereum as EIP1193Provider;
  } else {
    throw new Error('Connect a browser wallet to swap.');
  }

  return createViemAdapterFromProvider({ provider });
}

export async function estimateSwap({
  tokenIn,
  tokenOut,
  amountIn,
  connector,
}: {
  tokenIn: FxToken;
  tokenOut: FxToken;
  amountIn: string;
  connector?: Connector;
}): Promise<QuoteResult> {
  if (SWAP_REQUIRES_MAINNET) {
    throw new Error(
      'USDC ↔ EURC swaps are not available on Arc Testnet — the liquidity provider has no testnet route for this pair. Switch to Arc mainnet to swap.'
    );
  }

  const adapter = await getAdapter(connector);
  const result = await kit().estimateSwap({
    from: { adapter, chain: SWAP_CHAIN },
    tokenIn,
    tokenOut,
    amountIn,
  });

  const amountOut = result.estimatedOutput.amount;
  const inNum = Number(amountIn);
  const outNum = Number(amountOut);
  const effectiveRate = inNum > 0 ? (outNum / inNum).toString() : '0';

  return { amountOut, effectiveRate };
}

export async function executeSwap({
  tokenIn,
  tokenOut,
  amountIn,
  slippageBps,
  stopLimit,
  appFeeBps,
  appFeeRecipient,
  connector,
}: {
  tokenIn: FxToken;
  tokenOut: FxToken;
  amountIn: string;
  slippageBps: number;
  stopLimit?: string;
  appFeeBps: number;
  appFeeRecipient: string;
  connector?: Connector;
}): Promise<ExecuteResult> {
  if (SWAP_REQUIRES_MAINNET) {
    throw new Error(
      'USDC ↔ EURC swaps are not available on Arc Testnet. Switch to Arc mainnet to swap.'
    );
  }

  const adapter = await getAdapter(connector);

  const feeConfig =
    appFeeRecipient && appFeeRecipient !== '0x0000000000000000000000000000000000000000'
      ? {
          customFee: {
            percentageBps: appFeeBps,
            recipientAddress: appFeeRecipient,
          },
        }
      : {};

  const result = await kit().swap({
    from: { adapter, chain: SWAP_CHAIN },
    tokenIn,
    tokenOut,
    amountIn,
    config: {
      slippageBps,
      ...(stopLimit ? { stopLimit } : {}),
      ...feeConfig,
    },
  });

  return {
    amountOut: result.amountOut,
    txHash: result.txHash,
  };
}
