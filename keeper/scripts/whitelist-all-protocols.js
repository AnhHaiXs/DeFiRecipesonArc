#!/usr/bin/env node
/**
 * Whitelist tất cả protocols cần thiết trên RecipeGuardrail.
 *
 * Usage:
 *   OWNER_PRIVATE_KEY=0x<key> node keeper/scripts/whitelist-all-protocols.js
 *
 * Contracts cần whitelist (verified từ keeper logs 2026-10-05):
 *   1. Curve USDC/EURC pool  0x311d3f55... selector 0x3df02124 (exchange)
 *   2. AutoCompounder        0x6cB6eE2a... selector 0x37619e76
 */

const { createPublicClient, createWalletClient, http, defineChain } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');

const ARC_TESTNET = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network/'] } },
});

const GUARDRAIL = '0xB9b1C570fa0F633bc5cc0B833078d749f108748d';

// selector: addWhitelist(address) = 0xdc6b8812 (verified từ on-chain analysis)
const ADD_WHITELIST_SELECTOR = '0xdc6b8812';

const PROTOCOLS = [
  {
    address: '0x311d3f5530245b839dae6cf91685ae64c605e956',
    name:    'Curve USDC/EURC pool',
    selector: '0x3df02124', // exchange(int128,int128,uint256,uint256)
  },
  {
    address: '0x6cB6eE2a33F497C1a682657f15A874dc675Fa773',
    name:    'AutoCompounder (LendingBorrowing)',
    selector: '0x37619e76',
  },
];

async function main() {
  const pk = process.env.OWNER_PRIVATE_KEY;
  if (!pk) {
    console.error('ERROR: OWNER_PRIVATE_KEY env var required.');
    console.error('Usage: OWNER_PRIVATE_KEY=0x<key> node keeper/scripts/whitelist-all-protocols.js');
    process.exit(1);
  }

  const account = privateKeyToAccount(pk.startsWith('0x') ? pk : `0x${pk}`);
  console.log('Owner wallet:', account.address);
  console.log('RecipeGuardrail:', GUARDRAIL);
  console.log('');

  const publicClient = createPublicClient({ chain: ARC_TESTNET, transport: http() });
  const walletClient = createWalletClient({ chain: ARC_TESTNET, transport: http(), account });

  // ABI minimal
  const abi = [
    { name: 'addWhitelist',      type: 'function', inputs: [{ name: 'protocol', type: 'address' }], outputs: [], stateMutability: 'nonpayable' },
    { name: 'isWhitelisted',     type: 'function', inputs: [{ name: 'protocol', type: 'address' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  ];

  for (const protocol of PROTOCOLS) {
    console.log(`--- ${protocol.name} ---`);
    console.log(`  address:  ${protocol.address}`);
    console.log(`  selector: ${protocol.selector}`);

    // Check current state
    const isWL = await publicClient.readContract({
      address: GUARDRAIL,
      abi,
      functionName: 'isWhitelisted',
      args: [protocol.address],
    });

    if (isWL) {
      console.log('  ✅ Already whitelisted — skipping.');
      console.log('');
      continue;
    }

    console.log('  ⏳ Not whitelisted. Sending addWhitelist tx...');
    const hash = await walletClient.writeContract({
      address: GUARDRAIL,
      abi,
      functionName: 'addWhitelist',
      args: [protocol.address],
    });
    console.log('  tx hash:', hash);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status === 'success') {
      console.log('  ✅ Whitelisted successfully (block', receipt.blockNumber, ')');
    } else {
      console.log('  ❌ Tx FAILED:', receipt);
    }
    console.log('');
  }

  // Final verification
  console.log('=== Final state ===');
  for (const p of PROTOCOLS) {
    const wl = await publicClient.readContract({ address: GUARDRAIL, abi, functionName: 'isWhitelisted', args: [p.address] });
    console.log(`isWhitelisted(${p.name.padEnd(30)}): ${wl ? '✅ TRUE' : '❌ FALSE'}`);
  }

  console.log('');
  console.log('NOTE: selector whitelist (setSelectorWhitelist) is handled automatically');
  console.log('by RecipeGuardrail via selector check in contract logic.');
  console.log('If keeper still logs selector errors, contact contract deployer to add selector ACL.');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
