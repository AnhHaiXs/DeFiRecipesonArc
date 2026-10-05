#!/usr/bin/env node
/**
 * whitelist-curve-pool.js
 *
 * Whitelist Curve USDC/EURC pool (0x311d3f55...) trên RecipeGuardrail contract.
 *
 * Pool đúng được xác nhận từ txn 0x8f1d2b11... (swap thực tế trên Arc Testnet).
 * Selector: 0xdc6b8812 = addWhitelist(address) — chỉ cần address, không cần bool.
 *
 * Chạy:
 *   OWNER_PRIVATE_KEY=0x<key> node keeper/scripts/whitelist-curve-pool.js
 *
 * Yêu cầu: owner wallet = 0xecd06d7a0191f74b9c1fe007e02ed0b8ef32e866
 */

import { createPublicClient, createWalletClient, http, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.testnet.arc.network/'] },
    public:  { http: ['https://rpc.testnet.arc.io/'] },
  },
});

const GUARDRAIL = '0xB9b1C570fa0F633bc5cc0B833078d749f108748d';

// Pool đúng — verified từ txn 0x8f1d2b11... (swap thực tế 2026-10-05)
// get_dy(0,1,1_000_000) = 1.002072 EURC per USDC (healthy pool)
const CURVE_POOL = '0x311d3f5530245b839dae6cf91685ae64c605e956';

// Selectors đã xác nhận từ bytecode analysis:
// 0xdc6b8812 = addWhitelist(address)   — thêm vào whitelist
// 0x9387bbd4 = isWhitelisted(address)  — đọc trạng thái
const ADD_WHITELIST_SELECTOR = '0xdc6b8812';
const IS_WHITELISTED_SELECTOR = '0x9387bbd4';

const RPC = 'https://rpc.testnet.arc.network/';

function padAddress(addr) {
  return '000000000000000000000000' + addr.slice(2).toLowerCase();
}

async function isWhitelisted(publicClient, address) {
  const data = (IS_WHITELISTED_SELECTOR + padAddress(address));
  const result = await publicClient.call({
    to: GUARDRAIL,
    data: data,
  });
  const hex = result.data;
  return hex === ('0x' + '0'.repeat(63) + '1');
}

async function main() {
  const pk = process.env.OWNER_PRIVATE_KEY;
  if (!pk) {
    console.error('❌ OWNER_PRIVATE_KEY env var required');
    console.error('   Usage: OWNER_PRIVATE_KEY=0x<key> node keeper/scripts/whitelist-curve-pool.js');
    process.exit(1);
  }

  const account = privateKeyToAccount(pk);
  console.log('Owner wallet:', account.address);

  const publicClient = createPublicClient({ chain: arcTestnet, transport: http() });
  const walletClient = createWalletClient({ account, chain: arcTestnet, transport: http() });

  // 1. Pre-check
  console.log('\n--- Pre-check ---');
  const before = await isWhitelisted(publicClient, CURVE_POOL);
  console.log(`isWhitelisted(${CURVE_POOL}): ${before ? 'TRUE ✓ (already done)' : 'false'}`);

  if (before) {
    console.log('\n✅ Pool already whitelisted. Nothing to do.');
    return;
  }

  // 2. Send tx: addWhitelist(CURVE_POOL)
  console.log('\n--- Sending tx: addWhitelist(pool) ---');
  const calldata = (ADD_WHITELIST_SELECTOR + padAddress(CURVE_POOL));
  console.log('to:   ', GUARDRAIL);
  console.log('data: ', calldata);

  const txHash = await walletClient.sendTransaction({
    to: GUARDRAIL,
    data: calldata,
  });

  console.log('txHash:', txHash);
  console.log('Waiting for confirmation...');

  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log('status:', receipt.status === 'success' ? '✅ success' : '❌ FAILED');
  console.log('gasUsed:', receipt.gasUsed.toString());

  if (receipt.status !== 'success') {
    console.error('❌ Transaction reverted. Check owner address and contract state.');
    process.exit(1);
  }

  // 3. Post-check
  console.log('\n--- Post-check ---');
  const after = await isWhitelisted(publicClient, CURVE_POOL);
  console.log(`isWhitelisted(${CURVE_POOL}): ${after ? 'TRUE ✓' : 'false ✗ — something went wrong'}`);

  if (after) {
    console.log('\n✅ Done! Pool whitelisted successfully.');
    console.log('   Now set DCA_ROUTE_PROVIDER=CURVE_DIRECT in keeper/.env to activate.');
  } else {
    console.error('\n❌ Pool still not whitelisted after tx. Inspect the transaction.');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
