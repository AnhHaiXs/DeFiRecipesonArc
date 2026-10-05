#!/usr/bin/env node
/**
 * Whitelist tất cả protocols cần thiết trên RecipeGuardrail.
 *
 * Usage:
 *   OWNER_PRIVATE_KEY=0x<key> node keeper/scripts/whitelist-all-protocols.js
 *
 * ABI verified từ on-chain bytecode analysis 2026-10-05:
 *   isProtocolWhitelisted(address) = 0x9387bbd4
 *   setProtocolWhitelist(address,bool) = 0x2a683795
 *   isSelectorAllowed(address,bytes4)  = 0xfd5d471c
 *   setSelectorWhitelist(address,bytes4,bool) = 0xdc6b8812
 */

const path = require('path');
// Load .env từ keeper/ directory (file nằm cùng cấp với package.json)
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const { createPublicClient, createWalletClient, http, defineChain } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');

const ARC_TESTNET = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.testnet.arc.network/'] } },
});

const GUARDRAIL = '0xB9b1C570fa0F633bc5cc0B833078d749f108748d';

const ABI = [
  {
    name: 'isProtocolWhitelisted',
    type: 'function',
    inputs: [{ name: 'protocol', type: 'address' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  {
    name: 'setProtocolWhitelist',
    type: 'function',
    inputs: [{ name: 'protocol', type: 'address' }, { name: 'allowed', type: 'bool' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'isSelectorAllowed',
    type: 'function',
    inputs: [{ name: 'protocol', type: 'address' }, { name: 'selector', type: 'bytes4' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  },
  {
    name: 'setSelectorWhitelist',
    type: 'function',
    inputs: [{ name: 'protocol', type: 'address' }, { name: 'selector', type: 'bytes4' }, { name: 'allowed', type: 'bool' }],
    outputs: [],
    stateMutability: 'nonpayable',
  },
];

const PROTOCOLS = [
  {
    address: '0x311d3f5530245b839dae6cf91685ae64c605e956',
    name: 'Curve USDC/EURC pool',
    selector: '0x3df02124', // exchange(int128,int128,uint256,uint256)
  },
  {
    address: '0x6cB6eE2a33F497C1a682657f15A874dc675Fa773',
    name: 'AutoCompounder (LendingBorrowing)',
    selector: '0x37619e76',
  },
  {
    address: '0xbbd70b01a1cabc96d5b7b129ae1aaabdf50dd40b',
    name: 'ArcSwapAdapter',
    selector: '0xaa3e079c', // execute(ExecutionParams,uint256,address)
  },
];

async function sendAndWait(walletClient, publicClient, args, label) {
  console.log(`  ⏳ ${label}...`);
  const hash = await walletClient.writeContract(args);
  console.log(`  tx: ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status === 'success') {
    console.log(`  ✅ ${label} confirmed (block ${receipt.blockNumber})`);
  } else {
    console.error(`  ❌ FAILED: ${label}`);
    process.exit(1);
  }
}

async function main() {
  // Priority: CLI env var OWNER_PRIVATE_KEY → KEEPER_PRIVATE_KEY từ .env
  const pk = process.env.OWNER_PRIVATE_KEY || process.env.KEEPER_PRIVATE_KEY;
  if (!pk) {
    console.error('ERROR: No private key found.');
    console.error('  Option 1 (recommended): set KEEPER_PRIVATE_KEY in keeper/.env');
    console.error('  Option 2: OWNER_PRIVATE_KEY=0x<key> node keeper/scripts/whitelist-all-protocols.js');
    process.exit(1);
  }

  const account = privateKeyToAccount(pk.startsWith('0x') ? pk : `0x${pk}`);
  console.log('Owner wallet:', account.address);
  console.log('RecipeGuardrail:', GUARDRAIL);
  console.log('');

  const publicClient = createPublicClient({ chain: ARC_TESTNET, transport: http() });
  const walletClient = createWalletClient({ chain: ARC_TESTNET, transport: http(), account });

  for (const protocol of PROTOCOLS) {
    console.log(`--- ${protocol.name} ---`);
    console.log(`  address:  ${protocol.address}`);
    console.log(`  selector: ${protocol.selector}`);

    // 1. Check + set protocol whitelist
    const isProtocolWL = await publicClient.readContract({
      address: GUARDRAIL, abi: ABI,
      functionName: 'isProtocolWhitelisted',
      args: [protocol.address],
    });

    if (isProtocolWL) {
      console.log('  ✅ Protocol already whitelisted');
    } else {
      await sendAndWait(walletClient, publicClient, {
        address: GUARDRAIL, abi: ABI,
        functionName: 'setProtocolWhitelist',
        args: [protocol.address, true],
      }, `setProtocolWhitelist(${protocol.address}, true)`);
    }

    // 2. Check + set selector whitelist
    const isSelectorWL = await publicClient.readContract({
      address: GUARDRAIL, abi: ABI,
      functionName: 'isSelectorAllowed',
      args: [protocol.address, protocol.selector],
    });

    if (isSelectorWL) {
      console.log(`  ✅ Selector ${protocol.selector} already allowed`);
    } else {
      await sendAndWait(walletClient, publicClient, {
        address: GUARDRAIL, abi: ABI,
        functionName: 'setSelectorWhitelist',
        args: [protocol.address, protocol.selector, true],
      }, `setSelectorWhitelist(${protocol.address}, ${protocol.selector}, true)`);
    }

    console.log('');
  }

  // Final verification
  console.log('=== Final verification ===');
  for (const p of PROTOCOLS) {
    const protWL = await publicClient.readContract({ address: GUARDRAIL, abi: ABI, functionName: 'isProtocolWhitelisted', args: [p.address] });
    const selWL  = await publicClient.readContract({ address: GUARDRAIL, abi: ABI, functionName: 'isSelectorAllowed', args: [p.address, p.selector] });
    const ok = protWL && selWL;
    console.log(`${ok ? '✅' : '❌'} ${p.name}`);
    console.log(`     isProtocolWhitelisted: ${protWL}`);
    console.log(`     isSelectorAllowed(${p.selector}): ${selWL}`);
  }

  console.log('');
  console.log('Done. Rebuild server (git pull && tsc) then restart keeper.');
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
