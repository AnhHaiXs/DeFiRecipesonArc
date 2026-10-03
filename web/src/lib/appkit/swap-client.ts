'use client';

import { SwapChain } from '@circle-fin/app-kit';
import type { Connector } from 'wagmi';
import { getAppKit } from './client';
import { getBrowserAdapter } from './adapter';

export type FxToken = 'USDC' | 'EURC';

export type QuoteResult = {
  amountOut: string;
  effectiveRate: string;
};

export type ExecuteResult = {
  amountOut?: string;
  txHash?: string;
};

// Resolve chain from env — default Arc_Testnet.
// USDC↔EURC swaps are only available on Arc mainnet (LiFi has no testnet route).
const envChain = process.env.NEXT_PUBLIC_ARC_CHAIN ?? 'Arc_Testnet';
export const SWAP_CHAIN: SwapChain =
  (SwapChain as Record<string, SwapChain>)[envChain] ?? SwapChain.Arc_Testnet;

/** True when on testnet — USDC↔EURC routes are unavailable. */
export const SWAP_REQUIRES_MAINNET = SWAP_CHAIN === SwapChain.Arc_Testnet;

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
      'USDC ↔ EURC swaps are not available on Arc Testnet — the liquidity provider has no testnet route. Set NEXT_PUBLIC_ARC_CHAIN=Arc to use mainnet.'
    );
  }

  const adapter = await getBrowserAdapter(connector);
  const result = await getAppKit().estimateSwap({
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
      'USDC ↔ EURC swaps are not available on Arc Testnet. Set NEXT_PUBLIC_ARC_CHAIN=Arc to use mainnet.'
    );
  }

  const adapter = await getBrowserAdapter(connector);

  const feeConfig =
    appFeeRecipient && appFeeRecipient !== '0x0000000000000000000000000000000000000000'
      ? { customFee: { percentageBps: appFeeBps, recipientAddress: appFeeRecipient } }
      : {};

  const result = await getAppKit().swap({
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

  return { amountOut: result.amountOut, txHash: result.txHash };
}
