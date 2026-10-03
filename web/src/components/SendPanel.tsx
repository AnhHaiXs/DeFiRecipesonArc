'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, Send, TriangleAlert } from 'lucide-react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useBalance, useChainId, useSwitchChain, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, isAddress } from 'viem';
import { CONTRACT_ADDRESSES, ARC_TESTNET_CHAIN_ID } from '@/config/contracts';

// USDC ERC-20 ABI — only the transfer function needed
const USDC_TRANSFER_ABI = [
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to',    type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

// Arc Testnet explorer
const EXPLORER = 'https://testnet.arcscan.app';

function formatAmount(v: string | bigint, decimals = 6): string {
  const n = typeof v === 'bigint' ? Number(v) / 10 ** decimals : Number(v);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export function SendPanel() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  const { data: balanceData } = useBalance({
    address,
    token: CONTRACT_ADDRESSES.usdc,
    query: { enabled: isConnected && !!address },
  });

  const [recipient, setRecipient] = useState('');
  const [amount,    setAmount]    = useState('');
  const [notice,    setNotice]    = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [switching, setSwitching] = useState(false);

  const { writeContract, data: txHash, isPending, error: writeError } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({ hash: txHash });

  const balance = balanceData ? Number(balanceData.value) / 10 ** balanceData.decimals : 0;
  const amountNum = Number(amount);
  const isOnArc = chainId === ARC_TESTNET_CHAIN_ID;

  const recipientValid = isAddress(recipient);
  const amountValid    = /^\d*\.?\d+$/.test(amount.trim()) && amountNum > 0;
  const sufficientBal  = amountValid && amountNum <= balance;
  const canSend        = isConnected && recipientValid && amountValid && sufficientBal && !isPending && !isConfirming;

  // Show write error in notice
  if (writeError && (!notice || notice.type !== 'error')) {
    setNotice({ type: 'error', text: writeError.message.split('\n')[0] });
  }
  if (isConfirmed && txHash && (!notice || notice.type !== 'success')) {
    setNotice({ type: 'success', text: `Sent ${amount} USDC! Tx: ${txHash.slice(0, 10)}…` });
    setAmount('');
    setRecipient('');
  }

  async function handleSend() {
    if (!canSend) return;
    setNotice(null);

    if (!isOnArc) {
      setSwitching(true);
      try {
        await switchChainAsync({ chainId: ARC_TESTNET_CHAIN_ID });
      } catch {
        setNotice({ type: 'error', text: 'Please switch to Arc Testnet in your wallet.' });
        setSwitching(false);
        return;
      }
      setSwitching(false);
    }

    writeContract({
      address: CONTRACT_ADDRESSES.usdc,
      abi: USDC_TRANSFER_ABI,
      functionName: 'transfer',
      args: [recipient as `0x${string}`, parseUnits(amount, 6)],
    });
  }

  const busy = isPending || isConfirming || switching;

  return (
    <section className="glass-card p-5 sm:p-6">
      <div className="mb-5">
        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Same-chain transfer</p>
        <h3 className="mt-1 text-2xl font-bold text-white">Send USDC</h3>
        <p className="mt-1 text-sm text-slate-400">Transfer USDC to any address on Arc Testnet.</p>
      </div>

      {notice && (
        <div className={`mb-4 flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
          notice.type === 'success'
            ? 'border-emerald-800 bg-emerald-950/40 text-emerald-200'
            : 'border-rose-800 bg-rose-950/40 text-rose-200'
        }`}>
          {notice.type === 'success'
            ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            : <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />}
          <div className="flex-1">
            <span>{notice.text}</span>
            {notice.type === 'success' && txHash && (
              <a
                href={`${EXPLORER}/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="ml-2 text-emerald-300 underline"
              >
                View on explorer
              </a>
            )}
          </div>
        </div>
      )}

      {!isOnArc && isConnected && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-700 bg-amber-950/40 px-3 py-2 text-xs text-amber-200">
          <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-amber-400" />
          <span>You are not on Arc Testnet. The send button will switch networks automatically.</span>
        </div>
      )}

      <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
        {/* Recipient */}
        <div>
          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">Recipient</label>
          <input
            value={recipient}
            onChange={e => { setRecipient(e.target.value); setNotice(null); }}
            placeholder="0x..."
            spellCheck={false}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-blue-500"
          />
          {recipient && !recipientValid && (
            <p className="mt-1 text-xs text-rose-400">Invalid address</p>
          )}
        </div>

        {/* Amount */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">Amount (USDC)</label>
            <button
              type="button"
              className="text-[11px] text-slate-400 hover:text-white disabled:opacity-40"
              disabled={balance === 0}
              onClick={() => setAmount(String(balance))}
            >
              Max: {formatAmount(balance.toString())} USDC
            </button>
          </div>
          <input
            inputMode="decimal"
            value={amount}
            onChange={e => { setAmount(e.target.value); setNotice(null); }}
            placeholder="0.00"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-blue-500"
          />
          {amountValid && !sufficientBal && (
            <p className="mt-1 text-xs text-rose-400">Insufficient balance</p>
          )}
        </div>

        {/* Summary */}
        {recipientValid && amountValid && sufficientBal && (
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-3 text-xs text-slate-300 space-y-1.5">
            <div className="flex justify-between"><span className="text-slate-400">Sending</span><span className="font-semibold text-white">{amount} USDC</span></div>
            <div className="flex justify-between"><span className="text-slate-400">To</span><span className="font-mono">{recipient.slice(0,6)}…{recipient.slice(-4)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Network</span><span>Arc Testnet</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Gas</span><span>Paid in USDC</span></div>
          </div>
        )}

        {/* CTA */}
        {!isConnected ? (
          <ConnectButton showBalance={false} />
        ) : (
          <button
            type="button"
            disabled={!canSend || busy}
            onClick={handleSend}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-base font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy
              ? <><Loader2 className="h-4 w-4 animate-spin" />{switching ? 'Switching chain…' : isConfirming ? 'Confirming…' : 'Sending…'}</>
              : <><Send className="h-4 w-4" /> Send USDC</>
            }
          </button>
        )}
      </div>

      <p className="mt-3 text-center text-xs text-slate-500">
        Arc Testnet · USDC as gas · Get test USDC from <a href="https://faucet.circle.com" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">faucet.circle.com</a>
      </p>
    </section>
  );
}
