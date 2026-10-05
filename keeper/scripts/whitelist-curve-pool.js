#!/usr/bin/env node
/**
 * Whitelist Curve USDC/EURC pool trên RecipeGuardrail contract.
 *
 * Verified on-chain 2026-10-05:
 *   - pool 0x311d3f55 là pool THỰC SỰ được FlyDEX dùng trong swap txn
 *   - setWhitelisted selector: 0x2a683795
 *   - owner: 0xecd06d7a0191f74b9c1fe007e02ed0b8ef32e866
 *
 * Usage:
 *   OWNER_PRIVATE_KEY=0x<your_key> node keeper/scripts/whitelist-curve-pool.js
 *
 * KHÔNG commit file này với private key. Chỉ dùng env var.
 */

const RPC = process.env.ARC_RPC_URL || 'https://rpc.testnet.arc.network/';
const GUARDRAIL = '0xB9b1C570fa0F633bc5cc0B833078d749f108748d';
const CURVE_POOL = '0x311d3f5530245b839dae6cf91685ae64c605e956';
const CHAIN_ID = 5042002; // Arc Testnet

const PRIVATE_KEY = process.env.OWNER_PRIVATE_KEY;
if (!PRIVATE_KEY) {
  console.error('❌  Set OWNER_PRIVATE_KEY=0x<your_key> trước khi chạy');
  process.exit(1);
}

// ─── Minimal viem-free tx signer (chỉ dùng Node built-ins + secp256k1 nếu có) ───
// Dùng viem nếu có sẵn trong node_modules
async function main() {
  let createWalletClient, http, publicActions;
  try {
    const viem = await import('viem');
    const viemChains = await import('viem/chains');
    const accounts = await import('viem/accounts');

    const arcTestnet = {
      id: CHAIN_ID,
      name: 'Arc Testnet',
      nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
      rpcUrls: { default: { http: [RPC] } },
    };

    const account = accounts.privateKeyToAccount(/** @type {`0x${string}`} */ (PRIVATE_KEY));
    console.log('Owner wallet:', account.address);

    const client = viem.createWalletClient({
      account,
      chain: arcTestnet,
      transport: viem.http(RPC),
    }).extend(viem.publicActions);

    // 1. Check current state
    const isWhitelisted = await client.readContract({
      address: /** @type {`0x${string}`} */ (GUARDRAIL),
      abi: [{ name: 'isWhitelisted', type: 'function', inputs: [{ type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' }],
      functionName: 'isWhitelisted',
      args: [/** @type {`0x${string}`} */ (CURVE_POOL)],
    }).catch(() => null);

    console.log(`isWhitelisted(${CURVE_POOL}):`, isWhitelisted ?? '(selector mismatch — using raw calldata)');

    if (isWhitelisted === true) {
      console.log('✅  Pool đã được whitelist rồi — không cần làm gì thêm.');
      return;
    }

    // 2. Send setWhitelisted(pool, true)
    console.log(`\nGửi setWhitelisted(${CURVE_POOL}, true)...`);

    const hash = await client.sendTransaction({
      to: /** @type {`0x${string}`} */ (GUARDRAIL),
      data: /** @type {`0x${string}`} */ (
        '0x2a683795' +
        '000000000000000000000000' + CURVE_POOL.slice(2).toLowerCase() +
        '0000000000000000000000000000000000000000000000000000000000000001'
      ),
      gas: 100000n,
    });

    console.log('Tx sent:', hash);
    console.log(`Explorer: https://explorer.testnet.arc.io/tx/${hash}`);

    // 3. Wait for receipt
    console.log('Chờ confirmation...');
    const receipt = await client.waitForTransactionReceipt({ hash });
    console.log('Status:', receipt.status === 'success' ? '✅  SUCCESS' : '❌  FAILED');

    // 4. Verify
    const after = await client.readContract({
      address: /** @type {`0x${string}`} */ (GUARDRAIL),
      abi: [{ name: 'isWhitelisted', type: 'function', inputs: [{ type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' }],
      functionName: 'isWhitelisted',
      args: [/** @type {`0x${string}`} */ (CURVE_POOL)],
    }).catch(() => 'N/A');

    console.log(`isWhitelisted(pool) AFTER: ${after}`);

    if (after === true || after === 'N/A') {
      console.log('\n✅  Xong! Giờ set DCA_ROUTE_PROVIDER=CURVE_DIRECT trong keeper/.env để bật swap trực tiếp.');
    }

  } catch (err) {
    // Fallback: in calldata để dùng cast hoặc MetaMask manually
    console.error('viem không khả dụng hoặc lỗi:', err.message);
    console.log('\n─── Fallback: dùng cast send ───');
    console.log(`cast send \\`);
    console.log(`  --rpc-url ${RPC} \\`);
    console.log(`  --private-key $OWNER_PRIVATE_KEY \\`);
    console.log(`  ${GUARDRAIL} \\`);
    console.log(`  "0x2a683795000000000000000000000000311d3f5530245b839dae6cf91685ae64c605e9560000000000000000000000000000000000000000000000000000000000000001"`);
  }
}

main().catch(console.error);
