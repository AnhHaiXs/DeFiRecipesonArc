/**
 * register-session-key.js
 *
 * Registers a session key on SessionKeyRegistry so a keeper EOA can call
 * RecipeExecutor.executeRecipeStep() on behalf of a user.
 *
 * This must be called FROM THE USER'S WALLET (private key), not the keeper/owner.
 *
 * Usage:
 *   USER_PRIVATE_KEY=0x<user_key> node keeper/scripts/register-session-key.js
 *
 * Optional overrides (env):
 *   KEEPER_ADDRESS        default: 0xecd06D7a0191f74B9C1Fe007e02eD0B8ef32E866
 *   VALID_DAYS            default: 365
 *   MAX_USDC_SPEND        default: 10000   (total USDC spend cap, 6 decimals)
 *   SESSION_KEY_REGISTRY  default: 0x8dA092254Fe83DeC49Cde856b2b68eB2BFb12ed9
 *   RPC_URL               default: https://rpc.testnet.arc.io/
 */

const { createWalletClient, createPublicClient, http, encodeFunctionData } = require('viem');
const { privateKeyToAccount } = require('viem/accounts');

const RPC_URL = process.env.RPC_URL || 'https://rpc.testnet.arc.io/';
const SESSION_KEY_REGISTRY = process.env.SESSION_KEY_REGISTRY || '0x8dA092254Fe83DeC49Cde856b2b68eB2BFb12ed9';
const KEEPER_ADDRESS = process.env.KEEPER_ADDRESS || '0xecd06D7a0191f74B9C1Fe007e02eD0B8ef32E866';
const VALID_DAYS = parseInt(process.env.VALID_DAYS || '365', 10);
const MAX_USDC_SPEND = process.env.MAX_USDC_SPEND || '10000'; // USDC, not base units

const ARC_TESTNET = {
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
};

// registerSessionKey(address keeper, uint64 validUntil, uint256 maxSpendLimit)
const REGISTER_ABI = [{
  name: 'registerSessionKey',
  type: 'function',
  inputs: [
    { name: 'keeper', type: 'address' },
    { name: 'validUntil', type: 'uint64' },
    { name: 'maxSpendLimit', type: 'uint256' },
  ],
  outputs: [],
  stateMutability: 'nonpayable',
}];

// isValidSessionKey(address user, address keeper) returns (bool)
const IS_VALID_ABI = [{
  name: 'isValidSessionKey',
  type: 'function',
  inputs: [
    { name: 'user', type: 'address' },
    { name: 'keeper', type: 'address' },
  ],
  outputs: [{ name: '', type: 'bool' }],
  stateMutability: 'view',
}];

async function main() {
  const userKey = process.env.USER_PRIVATE_KEY;
  if (!userKey) {
    console.error('ERROR: USER_PRIVATE_KEY env var is required.');
    console.error('Usage: USER_PRIVATE_KEY=0x<key> node keeper/scripts/register-session-key.js');
    process.exit(1);
  }

  const account = privateKeyToAccount(userKey);
  const userAddress = account.address;

  const publicClient = createPublicClient({ chain: ARC_TESTNET, transport: http(RPC_URL) });
  const walletClient = createWalletClient({ account, chain: ARC_TESTNET, transport: http(RPC_URL) });

  console.log(`User:    ${userAddress}`);
  console.log(`Keeper:  ${KEEPER_ADDRESS}`);
  console.log(`Registry: ${SESSION_KEY_REGISTRY}`);

  // Check current state
  const isValid = await publicClient.readContract({
    address: SESSION_KEY_REGISTRY,
    abi: IS_VALID_ABI,
    functionName: 'isValidSessionKey',
    args: [userAddress, KEEPER_ADDRESS],
  });

  if (isValid) {
    console.log('✅ Session key already valid — nothing to do.');
    return;
  }

  console.log('❌ No valid session key found. Registering...');

  const validUntil = BigInt(Math.floor(Date.now() / 1000) + VALID_DAYS * 86400);
  const maxSpendLimitBaseUnits = BigInt(Math.round(parseFloat(MAX_USDC_SPEND) * 1_000_000));

  console.log(`  validUntil:  ${validUntil} (${new Date(Number(validUntil) * 1000).toISOString()})`);
  console.log(`  maxSpend:    ${maxSpendLimitBaseUnits} base units (${MAX_USDC_SPEND} USDC)`);

  const hash = await walletClient.writeContract({
    address: SESSION_KEY_REGISTRY,
    abi: REGISTER_ABI,
    functionName: 'registerSessionKey',
    args: [KEEPER_ADDRESS, validUntil, maxSpendLimitBaseUnits],
  });

  console.log(`  tx: ${hash}`);
  console.log('  Waiting for confirmation...');

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`  status: ${receipt.status}`);

  if (receipt.status !== 'success') {
    console.error('❌ Transaction reverted!');
    process.exit(1);
  }

  // Verify
  const isValidAfter = await publicClient.readContract({
    address: SESSION_KEY_REGISTRY,
    abi: IS_VALID_ABI,
    functionName: 'isValidSessionKey',
    args: [userAddress, KEEPER_ADDRESS],
  });

  if (isValidAfter) {
    console.log('✅ Session key registered successfully!');
    console.log('');
    console.log('DCA is now authorized. Keeper can execute recipes on behalf of this user.');
  } else {
    console.error('❌ Session key still not valid after tx — check contract logic.');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
