'use client';

import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2';
import type { EIP1193Provider } from 'viem';
import type { Connector } from 'wagmi';

/**
 * Build a viem browser adapter from the wagmi connector.
 * Always prefer connector.getProvider() over window.ethereum directly.
 */
export async function getBrowserAdapter(connector: Connector | undefined) {
  if (!connector) throw new Error('Connect a browser wallet first.');
  const provider = (await connector.getProvider()) as EIP1193Provider;
  return createViemAdapterFromProvider({ provider });
}
