import {
  ARC_CIRBTC_ADDRESS,
  ARC_EURC_ADDRESS,
  ARC_SWAP_ADAPTER_ADDRESS,
  ARC_USDC_ADDRESS,
  LIFI_FLY_DEX_ROUTER_ARC_TESTNET,
} from '../../config/dcaRouting';
import { arcTestnet } from 'viem/chains';
import {
  AdapterExecutionParams,
  buildArcSwapAdapterExecuteCallData,
} from './arcSwapAdapter';

interface DcaSwapRouteRequest {
  recipientAddress: `0x${string}`;
  amountInBaseUnits: bigint;
  maxSlippageBps: number;
  targetAssetSymbol: string;
}

export interface DcaSwapExecutionPlan {
  targetProtocolAddress: `0x${string}`;
  callData: `0x${string}`;
  minSwapAssetOutBaseUnits: bigint;
  spenderAddress?: `0x${string}`;
}

export interface DcaSwapRouteClient {
  resolveRoute(request: DcaSwapRouteRequest): Promise<DcaSwapExecutionPlan>;
}

const DCA_SWAP_SELECTORS = new Set(['0x7ebc46f0', '0x38ed1739']);
const ARC_TESTNET_CHAIN_ID = arcTestnet.id;
const DEFAULT_LIFI_INTEGRATOR = 'defirecipes';
const LIFI_INTEGRATOR_PATTERN = /^[a-zA-Z0-9._-]{1,23}$/;

interface TransactionCandidate {
  to: `0x${string}`;
  data: `0x${string}`;
  source?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeHexAddress(value: unknown): `0x${string}` | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (!/^0x[a-fA-F0-9]{40}$/.test(normalized)) {
    return null;
  }

  return normalized.toLowerCase() as `0x${string}`;
}

function normalizeHexData(value: unknown): `0x${string}` | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  if (!/^0x[a-fA-F0-9]+$/.test(normalized) || normalized.length < 10) {
    return null;
  }

  return normalized as `0x${string}`;
}

function tryExtractTransaction(record: Record<string, unknown>): TransactionCandidate | null {
  const to = normalizeHexAddress(record.to ?? record.target ?? record.contractAddress);
  const data = normalizeHexData(record.data ?? record.callData ?? record.input);

  if (to && data) {
    return { to, data, source: record };
  }

  return null;
}

function getSelector(callData: `0x${string}`): `0x${string}` {
  return (callData.length >= 10 ? callData.slice(0, 10) : '0x').toLowerCase() as `0x${string}`;
}

function selectPreferredTransaction(candidates: TransactionCandidate[]): TransactionCandidate | null {
  if (candidates.length === 0) {
    return null;
  }

  const selectorMatch = candidates.find((candidate) => DCA_SWAP_SELECTORS.has(getSelector(candidate.data)));
  if (selectorMatch) {
    return selectorMatch;
  }

  return candidates[0] ?? null;
}

function extractTransactionFromResponse(payload: unknown): TransactionCandidate | null {
  const queue: unknown[] = [payload];
  const candidates: TransactionCandidate[] = [];
  let scanned = 0;

  while (queue.length > 0 && scanned < 100) {
    scanned += 1;
    const current = queue.shift();

    if (!isRecord(current)) {
      continue;
    }

    const direct = tryExtractTransaction(current);
    if (direct) {
      candidates.push(direct);
    }

    const transactions = current.transactions;
    if (Array.isArray(transactions)) {
      for (const entry of transactions) {
        if (isRecord(entry)) {
          const candidate = tryExtractTransaction(entry);
          if (candidate) {
            candidates.push(candidate);
          }
        }
      }
    }

    const transaction = current.transaction;
    if (isRecord(transaction)) {
      const executionParams = transaction.executionParams;
      if (isRecord(executionParams) && Array.isArray(executionParams.instructions)) {
        for (const instruction of executionParams.instructions) {
          if (isRecord(instruction)) {
            const candidate = tryExtractTransaction(instruction);
            if (candidate) {
              candidates.push(candidate);
            }
          }
        }
      }
    }

    for (const value of Object.values(current)) {
      if (isRecord(value) || Array.isArray(value)) {
        queue.push(value);
      }
    }
  }

  return selectPreferredTransaction(candidates);
}

function parseBigIntFromUnknown(value: unknown): bigint | null {
  if (typeof value === 'bigint') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value >= 0) {
    return BigInt(value);
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    if (/^\d+$/.test(normalized)) {
      return BigInt(normalized);
    }
  }

  return null;
}

function extractMinOutFromResponse(payload: unknown, selectedTransaction?: TransactionCandidate): bigint | null {
  if (selectedTransaction?.source) {
    const selectedInstructionCandidates: unknown[] = [
      selectedTransaction.source.minTokenOut,
      selectedTransaction.source.minAmountOut,
      selectedTransaction.source.amountOutMin,
      selectedTransaction.source.minimumAmountOut,
      selectedTransaction.source.stopLimit,
    ];

    for (const candidate of selectedInstructionCandidates) {
      const parsed = parseBigIntFromUnknown(candidate);
      if (parsed !== null) {
        return parsed;
      }
    }
  }

  if (!isRecord(payload)) {
    return null;
  }

  const paths: unknown[] = [
    payload.toAmountMin,
    payload.minAmountOut,
    payload.amountOutMin,
    payload.minimumAmountOut,
    isRecord(payload.transaction) && isRecord(payload.transaction.executionParams) && Array.isArray(payload.transaction.executionParams.instructions)
      ? (payload.transaction.executionParams.instructions[0] as Record<string, unknown> | undefined)?.minTokenOut
      : undefined,
    payload.stopLimit,
    isRecord(payload.quote) ? payload.quote.minAmountOut : undefined,
    isRecord(payload.quote) ? payload.quote.minAmount : undefined,
    isRecord(payload.quote) ? payload.quote.amountOutMin : undefined,
    isRecord(payload.estimate) ? payload.estimate.toAmountMin : undefined,
    isRecord(payload.estimate) ? payload.estimate.minAmountOut : undefined,
    isRecord(payload.route) ? payload.route.minAmountOut : undefined,
    isRecord(payload.route) ? payload.route.amountOutMin : undefined,
  ];

  for (const candidate of paths) {
    const parsed = parseBigIntFromUnknown(candidate);
    if (parsed !== null) {
      return parsed;
    }
  }

  return null;
}

function extractSpenderAddressFromResponse(payload: unknown): `0x${string}` | null {
  if (!isRecord(payload)) {
    return null;
  }

  const directCandidates: unknown[] = [
    payload.spender,
    payload.spenderAddress,
    payload.approvalAddress,
    payload.approvalTarget,
    payload.toApprovalAddress,
    payload.allowanceTarget,
    payload.tokenTransferProxy,
    isRecord(payload.quote) ? payload.quote.spender : undefined,
    isRecord(payload.quote) ? payload.quote.approvalAddress : undefined,
    isRecord(payload.quote) ? payload.quote.toApprovalAddress : undefined,
    isRecord(payload.quote) ? payload.quote.allowanceTarget : undefined,
    isRecord(payload.estimate) ? payload.estimate.approvalAddress : undefined,
    isRecord(payload.estimate) ? payload.estimate.toApprovalAddress : undefined,
    isRecord(payload.route) ? payload.route.spender : undefined,
    isRecord(payload.route) ? payload.route.allowanceTarget : undefined,
    isRecord(payload.route) ? payload.route.approvalAddress : undefined,
    isRecord(payload.transaction) ? payload.transaction.spender : undefined,
    isRecord(payload.transaction) ? payload.transaction.allowanceTarget : undefined,
  ];

  for (const candidate of directCandidates) {
    const normalized = normalizeHexAddress(candidate);
    if (normalized) {
      return normalized;
    }
  }

  const queue: unknown[] = [payload];
  let scanned = 0;

  while (queue.length > 0 && scanned < 100) {
    scanned += 1;
    const current = queue.shift();
    if (!isRecord(current)) {
      continue;
    }

    for (const [key, value] of Object.entries(current)) {
      const normalized = normalizeHexAddress(value);
      if (normalized && /(spender|allowance|approval|proxy)/i.test(key)) {
        return normalized;
      }

      if (isRecord(value) || Array.isArray(value)) {
        queue.push(value);
      }
    }
  }

  return null;
}

function fallbackMinOutFromInput(amountInBaseUnits: bigint, maxSlippageBps: number): bigint {
  return (amountInBaseUnits * BigInt(10_000 - maxSlippageBps)) / 10_000n;
}

const KIT_KEY_PATTERN = /^KIT_KEY:[^:]+:[^:]+$/;

function requireHexAddress(value: unknown, field: string): `0x${string}` {
  const normalized = normalizeHexAddress(value);
  if (!normalized) {
    throw new Error(`App Kit swap response field ${field} is not a valid address.`);
  }
  return normalized;
}

function requireHexBytes(value: unknown, field: string): `0x${string}` {
  if (typeof value !== 'string' || !/^0x([a-fA-F0-9]{2})*$/.test(value.trim())) {
    throw new Error(`App Kit swap response field ${field} is not valid hex data.`);
  }
  return value.trim() as `0x${string}`;
}

function requireBigInt(value: unknown, field: string): bigint {
  if (typeof value === 'string' && /^(0x[a-fA-F0-9]+|\d+)$/.test(value.trim())) {
    return BigInt(value.trim());
  }

  const parsed = parseBigIntFromUnknown(value);
  if (parsed === null) {
    throw new Error(`App Kit swap response field ${field} is not a valid integer.`);
  }
  return parsed;
}

function parseAdapterExecutionPayload(payload: unknown): {
  executionParams: AdapterExecutionParams;
  signature: `0x${string}`;
} {
  const transaction = isRecord(payload) ? payload.transaction : undefined;
  if (!isRecord(transaction) || !isRecord(transaction.executionParams)) {
    throw new Error(
      'App Kit swap response did not include transaction.executionParams. ' +
        'The Stablecoin Service returns signed adapter execution params, not a raw to/data pair.'
    );
  }

  const signature = requireHexBytes(transaction.signature, 'transaction.signature');
  const raw = transaction.executionParams;

  if (!Array.isArray(raw.instructions) || raw.instructions.length === 0) {
    throw new Error('App Kit swap response contained no adapter instructions.');
  }

  const instructions = raw.instructions.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`App Kit swap instruction #${index} is malformed.`);
    }

    return {
      target: requireHexAddress(entry.target, `instructions[${index}].target`),
      data: requireHexBytes(entry.data, `instructions[${index}].data`),
      value: requireBigInt(entry.value, `instructions[${index}].value`),
      tokenIn: requireHexAddress(entry.tokenIn, `instructions[${index}].tokenIn`),
      amountToApprove: requireBigInt(entry.amountToApprove, `instructions[${index}].amountToApprove`),
      tokenOut: requireHexAddress(entry.tokenOut, `instructions[${index}].tokenOut`),
      minTokenOut: requireBigInt(entry.minTokenOut, `instructions[${index}].minTokenOut`),
    };
  });

  const tokens = (Array.isArray(raw.tokens) ? raw.tokens : []).map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`App Kit swap token recipient #${index} is malformed.`);
    }

    return {
      token: requireHexAddress(entry.token, `tokens[${index}].token`),
      beneficiary: requireHexAddress(entry.beneficiary, `tokens[${index}].beneficiary`),
    };
  });

  return {
    executionParams: {
      instructions,
      tokens,
      execId: requireBigInt(raw.execId, 'executionParams.execId'),
      deadline: requireBigInt(raw.deadline, 'executionParams.deadline'),
      metadata: requireHexBytes(raw.metadata, 'executionParams.metadata'),
    },
    signature,
  };
}

function extractAdapterStopLimit(payload: unknown, executionParams: AdapterExecutionParams): bigint {
  const topLevel = isRecord(payload) ? parseBigIntFromUnknown(payload.stopLimit) : null;
  if (topLevel !== null && topLevel > 0n) {
    return topLevel;
  }

  const swapInstruction = [...executionParams.instructions]
    .reverse()
    .find((instruction) => instruction.minTokenOut > 0n);

  return swapInstruction?.minTokenOut ?? 0n;
}

class AppKitDcaSwapRouteClient implements DcaSwapRouteClient {
  private getTokenOutAddress(targetAssetSymbol: string): `0x${string}` {
    if (targetAssetSymbol === 'EURC') {
      return ARC_EURC_ADDRESS;
    }

    if (targetAssetSymbol === 'cirBTC') {
      return ARC_CIRBTC_ADDRESS;
    }

    throw new Error(`Unsupported targetAssetSymbol=${targetAssetSymbol} for Arc Testnet DCA.`);
  }

  private async createSwapRouteViaService(request: DcaSwapRouteRequest): Promise<unknown> {
    const baseUrl =
      process.env.ARC_APP_KIT_SWAP_BASE_URL?.trim() ||
      process.env.ARC_APP_KIT_API_BASE_URL?.trim() ||
      'https://api.circle.com';
    const endpoint = new URL('/v1/stablecoinKits/swap', baseUrl).toString();
    const apiKey = process.env.ARC_APP_KIT_API_KEY?.trim() || process.env.ARC_APP_KIT_KEY?.trim();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    // Only a Stablecoin Kit Key authenticates this endpoint; any other credential makes it 401.
    // Without one the service still answers in permissionless mode.
    if (apiKey && KIT_KEY_PATTERN.test(apiKey)) {
      headers.Authorization = `Bearer ${apiKey}`;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        tokenInAddress: ARC_USDC_ADDRESS,
        tokenInChain: 'Arc_Testnet',
        tokenOutAddress: this.getTokenOutAddress(request.targetAssetSymbol),
        tokenOutChain: 'Arc_Testnet',
        fromAddress: request.recipientAddress,
        toAddress: request.recipientAddress,
        amount: request.amountInBaseUnits.toString(),
        slippageBps: request.maxSlippageBps,
      }),
    });

    const rawBody = await response.text();
    if (!response.ok) {
      const detail = rawBody.length > 0 ? rawBody : `${response.status} ${response.statusText}`;
      throw new Error(`Arc App Kit swap service request failed: ${detail}`);
    }

    if (rawBody.length === 0) {
      throw new Error('Arc App Kit swap service returned an empty response body.');
    }

    try {
      return JSON.parse(rawBody) as unknown;
    } catch {
      throw new Error('Arc App Kit swap service returned non-JSON payload.');
    }
  }

  async resolveRoute(request: DcaSwapRouteRequest): Promise<DcaSwapExecutionPlan> {
    const response = await this.createSwapRouteViaService(request);

    const { executionParams, signature } = parseAdapterExecutionPayload(response);
    const callData = buildArcSwapAdapterExecuteCallData({
      executionParams,
      signature,
      tokenInAddress: ARC_USDC_ADDRESS,
      amountInBaseUnits: request.amountInBaseUnits,
    });

    return {
      targetProtocolAddress: ARC_SWAP_ADAPTER_ADDRESS,
      callData,
      minSwapAssetOutBaseUnits: extractAdapterStopLimit(response, executionParams),
      spenderAddress: ARC_SWAP_ADAPTER_ADDRESS,
    };
  }
}

interface LiFiSdkModule {
  createClient?: (config: Record<string, unknown>) => unknown;
  createConfig?: (config: Record<string, unknown>) => unknown;
  getQuote: (...args: unknown[]) => Promise<unknown>;
}

function readOptionalModuleFunction<T>(module: unknown, exportName: string): T | undefined {
  if (!isRecord(module)) {
    return undefined;
  }

  try {
    const candidate = (module as Record<string, unknown>)[exportName];
    return typeof candidate === 'function' ? (candidate as T) : undefined;
  } catch {
    return undefined;
  }
}

function normalizeRuntimeProvider(value: string | undefined): 'ARC_LIFI_SWAP' | 'ARC_APP_KIT_SWAP' | 'LIFI_DIRECT' {
  const normalized = value?.trim().toUpperCase();
  if (!normalized || ['ARC_LIFI_SWAP', 'LIFI_SWAP', 'LIFI'].includes(normalized)) {
    return 'ARC_LIFI_SWAP';
  }

  if (['ARC_APP_KIT_SWAP', 'APP_KIT_SWAP', 'APP_KIT'].includes(normalized)) {
    return 'ARC_APP_KIT_SWAP';
  }

  if (['LIFI_DIRECT', 'LIFI_REST', 'LIFI_API'].includes(normalized)) {
    return 'LIFI_DIRECT';
  }

  throw new Error(
    `Unsupported DCA_ROUTE_PROVIDER=${value}. Supported values: ARC_LIFI_SWAP (aliases: LIFI_SWAP, LIFI), ARC_APP_KIT_SWAP (aliases: APP_KIT_SWAP, APP_KIT), LIFI_DIRECT (aliases: LIFI_REST, LIFI_API).`
  );
}

function parseBooleanEnv(value: string | undefined, fallback: boolean): boolean {
  if (!value || value.trim().length === 0) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean value: ${value}`);
}

function normalizeLiFiIntegrator(value: string | undefined): string {
  const integrator = value?.trim() || DEFAULT_LIFI_INTEGRATOR;
  if (!LIFI_INTEGRATOR_PATTERN.test(integrator)) {
    throw new Error(
      `Invalid LIFI_INTEGRATOR=${integrator}. It must match ${LIFI_INTEGRATOR_PATTERN} and be at most 23 chars.`
    );
  }
  return integrator;
}

function isLiFiUnsupportedArcError(errorMessage: string): boolean {
  const normalized = errorMessage.toLowerCase();
  return (
    (normalized.includes('unsupported') && normalized.includes('chain')) ||
    (normalized.includes('chain') && normalized.includes('not supported')) ||
    (normalized.includes('unknown') && normalized.includes('chain')) ||
    normalized.includes(`chain ${ARC_TESTNET_CHAIN_ID}`)
  );
}

function isLiFiNoRouteError(errorMessage: string): boolean {
  const normalized = errorMessage.toLowerCase();
  return (
    normalized.includes('no route') ||
    normalized.includes('no quote') ||
    normalized.includes('route not found')
  );
}

function isLiFiRateLimitError(errorMessage: string): boolean {
  const normalized = errorMessage.toLowerCase();
  const has429 = /\b429\b/.test(normalized);
  return has429 || normalized.includes('too many requests') || normalized.includes('rate limit exceeded');
}

function isLiFiInvalidApiKeyError(errorMessage: string): boolean {
  const normalized = errorMessage.toLowerCase();
  return normalized.includes('401') && normalized.includes('invalid api key');
}

class LiFiArcDcaSwapRouteClient implements DcaSwapRouteClient {
  private lifiQuoteExecutor: ((request: Record<string, unknown>) => Promise<unknown>) | null = null;
  private lifiSdkModulePromise: Promise<LiFiSdkModule> | null = null;
  private lifiQuoteExecutorUsesApiKey = false;

  constructor(private readonly appKitFallbackClient: DcaSwapRouteClient | null) {}

  private getTokenOutAddress(targetAssetSymbol: string): `0x${string}` {
    if (targetAssetSymbol === 'EURC') {
      return ARC_EURC_ADDRESS;
    }

    if (targetAssetSymbol === 'cirBTC') {
      return ARC_CIRBTC_ADDRESS;
    }

    throw new Error(`Unsupported targetAssetSymbol=${targetAssetSymbol} for Arc Testnet DCA.`);
  }

  private async getLiFiSdkModule(): Promise<LiFiSdkModule> {
    if (!this.lifiSdkModulePromise) {
      this.lifiSdkModulePromise = import('@lifi/sdk').then((module) => {
        const getQuote = readOptionalModuleFunction<(...args: unknown[]) => Promise<unknown>>(module, 'getQuote');
        const createClient = readOptionalModuleFunction<(config: Record<string, unknown>) => unknown>(
          module,
          'createClient'
        );
        const createConfig = readOptionalModuleFunction<(config: Record<string, unknown>) => unknown>(
          module,
          'createConfig'
        );

        if (!getQuote) {
          throw new Error('Failed to load @lifi/sdk getQuote API.');
        }

        return {
          createClient,
          createConfig,
          getQuote,
        };
      });
    }

    return this.lifiSdkModulePromise;
  }

  private async createLiFiQuoteExecutor(useApiKey: boolean): Promise<(request: Record<string, unknown>) => Promise<unknown>> {
    const { createClient, createConfig, getQuote } = await this.getLiFiSdkModule();
    const integrator = normalizeLiFiIntegrator(process.env.LIFI_INTEGRATOR);
    const apiUrl = process.env.LIFI_API_BASE_URL?.trim();
    const apiKey = process.env.LIFI_API_KEY?.trim();
    const config: Record<string, unknown> = { integrator };
    if (apiUrl) {
      config.apiUrl = apiUrl;
    }
    if (useApiKey && apiKey) {
      config.apiKey = apiKey;
    }

    if (typeof createClient === 'function') {
      const client = createClient(config);
      return async (request) => getQuote(client, request);
    }

    if (typeof createConfig === 'function') {
      createConfig(config);
    }

    return async (request) => getQuote(request);
  }

  private async getLiFiQuoteExecutor(): Promise<(request: Record<string, unknown>) => Promise<unknown>> {
    if (this.lifiQuoteExecutor) {
      return this.lifiQuoteExecutor;
    }

    this.lifiQuoteExecutorUsesApiKey = Boolean(process.env.LIFI_API_KEY?.trim());
    this.lifiQuoteExecutor = await this.createLiFiQuoteExecutor(this.lifiQuoteExecutorUsesApiKey);
    return this.lifiQuoteExecutor;
  }

  private async createArcQuote(request: DcaSwapRouteRequest): Promise<unknown> {
    const quoteRequest = {
      fromChain: ARC_TESTNET_CHAIN_ID,
      toChain: ARC_TESTNET_CHAIN_ID,
      fromToken: ARC_USDC_ADDRESS,
      toToken: this.getTokenOutAddress(request.targetAssetSymbol),
      fromAmount: request.amountInBaseUnits.toString(),
      fromAddress: request.recipientAddress,
      toAddress: request.recipientAddress,
      slippage: request.maxSlippageBps / 10_000,
    };

    const quote = await this.getLiFiQuoteExecutor();

    try {
      return await quote(quoteRequest);
    } catch (error: unknown) {
      let message = error instanceof Error ? error.message : String(error);

      // LI.FI API key is optional; if key is invalid, retry once without key.
      if (isLiFiInvalidApiKeyError(message) && this.lifiQuoteExecutorUsesApiKey) {
        const fallbackQuoteExecutor = await this.createLiFiQuoteExecutor(false);
        this.lifiQuoteExecutorUsesApiKey = false;
        this.lifiQuoteExecutor = fallbackQuoteExecutor;

        try {
          return await fallbackQuoteExecutor(quoteRequest);
        } catch (retryError: unknown) {
          message = retryError instanceof Error ? retryError.message : String(retryError);
        }
      }

      if (isLiFiUnsupportedArcError(message)) {
        throw new Error(
          `LI.FI does not support Arc Testnet (chainId=${ARC_TESTNET_CHAIN_ID}) in the current environment.`
        );
      }

      if (isLiFiNoRouteError(message)) {
        throw new Error('LI.FI has no route available on Arc Testnet for this DCA swap request.');
      }

      if (isLiFiRateLimitError(message)) {
        throw new Error(
          'LI.FI Arc quote request failed: rate limit exceeded (HTTP 429). Configure LIFI_API_KEY and LIFI_INTEGRATOR to use your dedicated integration quota.'
        );
      }

      throw new Error(`LI.FI Arc quote request failed: ${message}`);
    }
  }

  async resolveRoute(request: DcaSwapRouteRequest): Promise<DcaSwapExecutionPlan> {
    const allowAppKitFallback = parseBooleanEnv(process.env.DCA_ROUTE_ALLOW_APP_KIT_FALLBACK, false);

    try {
      const quote = await this.createArcQuote(request);
      const transaction = extractTransactionFromResponse(quote);
      if (!transaction) {
        throw new Error('LI.FI quote did not include executable on-chain transaction data (to/data).');
      }

      const minSwapAssetOutBaseUnits =
        extractMinOutFromResponse(quote, transaction) ??
        fallbackMinOutFromInput(request.amountInBaseUnits, request.maxSlippageBps);
      const spenderAddress = extractSpenderAddressFromResponse(quote) ?? undefined;

      return {
        targetProtocolAddress: transaction.to,
        callData: transaction.data,
        minSwapAssetOutBaseUnits,
        spenderAddress,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes('does not support Arc Testnet')) {
        throw error;
      }

      if (allowAppKitFallback && this.appKitFallbackClient) {
        return this.appKitFallbackClient.resolveRoute(request);
      }

      throw error;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phương án B: LI.FI REST API trực tiếp (không dùng @lifi/sdk)
//
// LI.FI GET /v1/quote trả về transactionRequest.{to, data} sẵn sàng submit.
// Verified live 2026-10-05: USDC→EURC trên Arc Testnet (chainId=5042002)
// qua Fly DEX router 0xFf70F4A1d11995621854F3692acF286d8aCd04b2.
//
// Env vars:
//   LIFI_API_BASE_URL  — default https://li.quest (optional override)
//   LIFI_API_KEY       — optional; nếu có sẽ được gửi qua x-lifi-api-key header
//   LIFI_INTEGRATOR    — default "defirecipes" (max 23 chars alphanumeric._-)
// ─────────────────────────────────────────────────────────────────────────────

interface LiFiQuoteResponse {
  tool: string;
  transactionRequest: {
    to: string;
    data: string;
    value: string;
    gasPrice?: string;
    gasLimit?: string;
    chainId?: number;
  };
  estimate: {
    approvalAddress: string;
    toAmount: string;
    toAmountMin: string;
    fromAmount: string;
  };
}

function isLiFiQuoteResponse(value: unknown): value is LiFiQuoteResponse {
  if (!isRecord(value)) return false;
  const tx = value.transactionRequest;
  if (!isRecord(tx)) return false;
  const est = value.estimate;
  if (!isRecord(est)) return false;
  return (
    typeof tx.to === 'string' &&
    typeof tx.data === 'string' &&
    typeof est.approvalAddress === 'string' &&
    typeof est.toAmountMin === 'string'
  );
}

class LiFiDirectDcaSwapRouteClient implements DcaSwapRouteClient {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly integrator: string;

  constructor() {
    const rawBase = process.env.LIFI_API_BASE_URL?.trim();
    this.baseUrl = rawBase && rawBase.length > 0 ? rawBase.replace(/\/$/, '') : 'https://li.quest';
    // IMPORTANT: Do NOT send x-lifi-api-key on /v1/quote requests.
    // When a registered partner API key is attached, LI.FI enforces the partner's exchange
    // whitelist and returns TOOL_NOT_ALLOWED for "fly" on Arc Testnet, even though the
    // same route succeeds in anonymous (no-key) mode. The API key is reserved for future
    // authenticated endpoints that explicitly require it (e.g. status, gas estimation).
    this.apiKey = undefined;
    this.integrator = normalizeLiFiIntegrator(process.env.LIFI_INTEGRATOR);
  }

  private getTokenOutAddress(targetAssetSymbol: string): `0x${string}` {
    if (targetAssetSymbol === 'EURC') return ARC_EURC_ADDRESS;
    if (targetAssetSymbol === 'cirBTC') return ARC_CIRBTC_ADDRESS;
    throw new Error(`Unsupported targetAssetSymbol=${targetAssetSymbol} for LI.FI Direct DCA.`);
  }

  private buildQuoteUrl(request: DcaSwapRouteRequest): string {
    const params = new URLSearchParams({
      fromChain: ARC_TESTNET_CHAIN_ID.toString(),
      toChain: ARC_TESTNET_CHAIN_ID.toString(),
      fromToken: ARC_USDC_ADDRESS,
      toToken: this.getTokenOutAddress(request.targetAssetSymbol),
      fromAmount: request.amountInBaseUnits.toString(),
      fromAddress: request.recipientAddress,
      toAddress: request.recipientAddress,
      // LI.FI uses decimal slippage (0.005 = 0.5%), not bps
      slippage: (request.maxSlippageBps / 10_000).toString(),
      // NOTE: do NOT pass integrator= or allowExchanges= here.
      // When integrator is set to a registered partner, LI.FI enforces its whitelist and
      // blocks the "fly" tool with TOOL_NOT_ALLOWED. Without integrator the public routing
      // logic applies and LI.FI picks the best available exchange automatically.
      // allowBridges='' keeps it same-chain only (no cross-chain bridge routes).
      allowBridges: '',
    });
    return `${this.baseUrl}/v1/quote?${params.toString()}`;
  }

  async resolveRoute(request: DcaSwapRouteRequest): Promise<DcaSwapExecutionPlan> {
    const url = this.buildQuoteUrl(request);

    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (this.apiKey) {
      headers['x-lifi-api-key'] = this.apiKey;
    }

    let rawBody: string;
    let httpStatus: number;

    try {
      const response = await fetch(url, { method: 'GET', headers });
      httpStatus = response.status;
      rawBody = await response.text();

      if (!response.ok) {
        // Normalise LI.FI error body — may be JSON {message, code} or plain text
        let detail = rawBody;
        try {
          const errJson = JSON.parse(rawBody) as Record<string, unknown>;
          if (typeof errJson.message === 'string') {
            detail = errJson.message;
          }
        } catch {
          /* keep rawBody */
        }

        if (httpStatus === 404 || isLiFiNoRouteError(detail)) {
          throw new Error('LI.FI Direct: no route available for this DCA swap request.');
        }
        if (httpStatus === 429 || isLiFiRateLimitError(detail)) {
          throw new Error(
            'LI.FI Direct: rate limit exceeded (HTTP 429). Set LIFI_API_KEY for higher quota.'
          );
        }
        throw new Error(`LI.FI Direct: HTTP ${httpStatus} — ${detail}`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      // Re-throw already-normalised errors from the block above
      if (message.startsWith('LI.FI Direct:')) throw error;
      throw new Error(`LI.FI Direct: fetch failed — ${message}`);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      throw new Error('LI.FI Direct: response is not valid JSON.');
    }

    if (!isLiFiQuoteResponse(parsed)) {
      throw new Error(
        'LI.FI Direct: quote response is missing transactionRequest or estimate fields.'
      );
    }

    const txTo = normalizeHexAddress(parsed.transactionRequest.to);
    const txData = normalizeHexData(parsed.transactionRequest.data);

    if (!txTo) {
      throw new Error(
        `LI.FI Direct: transactionRequest.to is not a valid address: ${parsed.transactionRequest.to}`
      );
    }
    if (!txData) {
      throw new Error(
        `LI.FI Direct: transactionRequest.data is not valid hex calldata.`
      );
    }

    // approvalAddress is the spender the user must approve before submitting the tx
    const spenderAddress = normalizeHexAddress(parsed.estimate.approvalAddress) ?? txTo;

    // toAmountMin is already slippage-adjusted by LI.FI
    const minOut = parseBigIntFromUnknown(parsed.estimate.toAmountMin);
    const minSwapAssetOutBaseUnits =
      minOut !== null && minOut > 0n
        ? minOut
        : fallbackMinOutFromInput(request.amountInBaseUnits, request.maxSlippageBps);

    console.log(
      `[LI.FI Direct] Quote resolved tool=${parsed.tool} ` +
      `from=USDC to=${request.targetAssetSymbol} ` +
      `amountIn=${request.amountInBaseUnits.toString()} ` +
      `toAmountMin=${minSwapAssetOutBaseUnits.toString()} ` +
      `router=${txTo} spender=${spenderAddress}`
    );

    return {
      targetProtocolAddress: txTo,
      callData: txData,
      minSwapAssetOutBaseUnits,
      spenderAddress,
    };
  }
}

function createAppKitDcaSwapRouteClient(): DcaSwapRouteClient {
  return new AppKitDcaSwapRouteClient();
}

export function createDcaSwapRouteClientFromRuntime(): DcaSwapRouteClient {
  const provider = normalizeRuntimeProvider(process.env.DCA_ROUTE_PROVIDER);

  if (provider === 'ARC_APP_KIT_SWAP') {
    return createAppKitDcaSwapRouteClient();
  }

  if (provider === 'LIFI_DIRECT') {
    return new LiFiDirectDcaSwapRouteClient();
  }

  // Default: ARC_LIFI_SWAP (SDK-based) with App Kit fallback
  const appKitFallbackClient = createAppKitDcaSwapRouteClient();
  return new LiFiArcDcaSwapRouteClient(appKitFallbackClient);
}
