#!/usr/bin/env node
/**
 * probe-lifi-direct.js
 *
 * Kiểm tra LI.FI Direct REST route (Phương án B) mà không cần chạy keeper.
 * Gọi trực tiếp GET /v1/quote và in ra transactionRequest + estimate.
 *
 * Chạy:
 *   node scripts/probe-lifi-direct.js
 *   LIFI_API_KEY=xxx node scripts/probe-lifi-direct.js
 *   TARGET_ASSET=cirBTC DCA_AMOUNT_USDC=5 node scripts/probe-lifi-direct.js
 */

'use strict';

const LIFI_BASE = process.env.LIFI_API_BASE_URL?.trim().replace(/\/$/, '') || 'https://li.quest';
const LIFI_API_KEY = process.env.LIFI_API_KEY?.trim() || '';
const INTEGRATOR = process.env.LIFI_INTEGRATOR?.trim() || 'defirecipes';

const ARC_TESTNET_CHAIN_ID = 5042002;
const ARC_USDC = '0x3600000000000000000000000000000000000000';
const ARC_EURC = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a';
const ARC_CIRBTC = '0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF';

const TARGET_ASSET = (process.env.TARGET_ASSET || 'EURC').toUpperCase();
const DCA_AMOUNT_USDC = parseFloat(process.env.DCA_AMOUNT_USDC || '1');
// USDC = 6 decimals
const FROM_AMOUNT = Math.round(DCA_AMOUNT_USDC * 1_000_000).toString();
const FROM_ADDRESS = process.env.FROM_ADDRESS || '0x1234567890123456789012345678901234567890';
const MAX_SLIPPAGE_BPS = parseInt(process.env.MAX_SLIPPAGE_BPS || '100', 10);

function getToToken() {
  if (TARGET_ASSET === 'EURC') return ARC_EURC;
  if (TARGET_ASSET === 'CIRBTC') return ARC_CIRBTC;
  throw new Error(`Unsupported TARGET_ASSET=${TARGET_ASSET}. Use EURC or cirBTC.`);
}

async function probe() {
  const toToken = getToToken();
  const slippage = (MAX_SLIPPAGE_BPS / 10_000).toString();

  const params = new URLSearchParams({
    fromChain: ARC_TESTNET_CHAIN_ID.toString(),
    toChain: ARC_TESTNET_CHAIN_ID.toString(),
    fromToken: ARC_USDC,
    toToken,
    fromAmount: FROM_AMOUNT,
    fromAddress: FROM_ADDRESS,
    toAddress: FROM_ADDRESS,
    slippage,
    // No integrator= and no allowExchanges= — partner integrator triggers TOOL_NOT_ALLOWED for fly.
    // Public routing picks the best available exchange automatically.
    allowBridges: '',
  });

  const url = `${LIFI_BASE}/v1/quote?${params.toString()}`;

  // IMPORTANT: Do NOT send x-lifi-api-key on /v1/quote.
  // A registered partner key causes LI.FI to enforce partner exchange whitelist,
  // blocking "fly" with TOOL_NOT_ALLOWED on Arc Testnet. Anonymous mode works fine.
  const headers = { Accept: 'application/json' };

  console.log('='.repeat(60));
  console.log('LI.FI Direct Probe — Arc Testnet DCA Route');
  console.log('='.repeat(60));
  console.log(`  Base URL : ${LIFI_BASE}`);
  console.log(`  API Key  : ${LIFI_API_KEY ? '***set***' : '(none — public rate limit applies)'}`);
  console.log(`  From     : USDC (${ARC_USDC})`);
  console.log(`  To       : ${TARGET_ASSET} (${toToken})`);
  console.log(`  Amount   : ${DCA_AMOUNT_USDC} USDC (${FROM_AMOUNT} base units)`);
  console.log(`  Slippage : ${MAX_SLIPPAGE_BPS} bps (${slippage})`);
  console.log(`  URL      : ${url}`);
  console.log('');

  let response;
  try {
    response = await fetch(url, { method: 'GET', headers });
  } catch (err) {
    console.error('FETCH ERROR:', err.message);
    process.exit(1);
  }

  const body = await response.text();

  if (!response.ok) {
    console.error(`HTTP ${response.status} — ${response.statusText}`);
    console.error('Response body:', body.slice(0, 1000));
    process.exit(1);
  }

  let data;
  try {
    data = JSON.parse(body);
  } catch {
    console.error('Non-JSON response:', body.slice(0, 500));
    process.exit(1);
  }

  const tx = data.transactionRequest || {};
  const est = data.estimate || {};
  const feeCosts = est.feeCosts || [];

  console.log('RESULT: OK');
  console.log('');
  console.log('--- Quote Summary ---');
  console.log(`  Tool         : ${data.tool || 'unknown'}`);
  console.log(`  Router (to)  : ${tx.to}`);
  console.log(`  Spender      : ${est.approvalAddress}`);
  console.log(`  fromAmount   : ${est.fromAmount} base units`);
  console.log(`  toAmount     : ${est.toAmount} base units (~${(parseInt(est.toAmount || '0') / 1e6).toFixed(6)} ${TARGET_ASSET})`);
  console.log(`  toAmountMin  : ${est.toAmountMin} base units (after slippage)`);

  for (const fee of feeCosts) {
    console.log(`  Fee [${fee.name}] : ${fee.amount} ${fee.token?.symbol || ''} ($${fee.amountUSD || '?'})`);
  }

  console.log('');
  console.log('--- transactionRequest ---');
  console.log(`  to        : ${tx.to}`);
  console.log(`  data      : ${typeof tx.data === 'string' ? tx.data.slice(0, 42) + '...' : '(missing)'}`);
  console.log(`  value     : ${tx.value}`);
  console.log(`  gasPrice  : ${tx.gasPrice}`);
  console.log(`  gasLimit  : ${tx.gasLimit || tx.gas || '(not provided)'}`);

  console.log('');
  console.log('--- Guardrail Whitelist Required ---');
  console.log(`  RecipeGuardrail.setProtocolWhitelist(${tx.to}, true)`);
  const selectorHex = typeof tx.data === 'string' && tx.data.length >= 10
    ? tx.data.slice(0, 10)
    : '(unknown)';
  console.log(`  RecipeGuardrail.setSelectorWhitelist(${tx.to}, ${selectorHex}, true)`);
  console.log(`  USDC.approve(${est.approvalAddress}, <perExecutionAmount>)`);
  console.log('');
  console.log('--- .env setting ---');
  console.log('  DCA_ROUTE_PROVIDER=LIFI_DIRECT');
  if (!LIFI_API_KEY) {
    console.log('  # Optional: LIFI_API_KEY=<your-key>  (higher rate limit)');
  }
  console.log('  # Optional: LIFI_INTEGRATOR=defirecipes');
}

probe().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
