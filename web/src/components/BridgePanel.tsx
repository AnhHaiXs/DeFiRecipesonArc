'use client';

import { useState } from 'react';
import { ArrowRight, CheckCircle2, Loader2, TriangleAlert } from 'lucide-react';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2';
import type { EIP1193Provider } from 'viem';
import { getAppKit } from '@/lib/appkit/client';

// Supported CCTP bridge chains — testnet pairs for Arc
const BRIDGE_CHAINS = [
  { id: 5042002,  kit: 'Arc_Testnet',      label: 'Arc Testnet' },
  { id: 84532,    kit: 'Base_Sepolia',     label: 'Base Sepolia' },
  { id: 11155111, kit: 'Ethereum_Sepolia', label: 'Ethereum Sepolia' },
  { id: 421614,   kit: 'Arbitrum_Sepolia', label: 'Arbitrum Sepolia' },
] as const;

type ChainEntry = typeof BRIDGE_CHAINS[number];

type StepState = 'idle' | 'pending' | 'success' | 'error';

type BridgeStep = {
  name: string;
  label: string;
  state: StepState;
  txHash?: string;
};

const INITIAL_STEPS: BridgeStep[] = [
  { name: 'approve',          label: 'Approve USDC',       state: 'idle' },
  { name: 'burn',             label: 'Burn on source',     state: 'idle' },
  { name: 'fetchAttestation', label: 'Fetch attestation',  state: 'idle' },
  { name: 'mint',             label: 'Mint on destination',state: 'idle' },
];

function isPositiveDecimal(v: string) {
  return /^\d*\.?\d+$/.test(v.trim()) && Number(v) > 0;
}

export function BridgePanel() {
  const { connector, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  const [fromChain, setFromChain] = useState<ChainEntry>(BRIDGE_CHAINS[0]);
  const [toChain,   setToChain]   = useState<ChainEntry>(BRIDGE_CHAINS[1]);
  const [amount,    setAmount]    = useState('');
  const [recipient, setRecipient] = useState('');
  const [steps,     setSteps]     = useState<BridgeStep[]>(INITIAL_STEPS);
  const [bridging,  setBridging]  = useState(false);
  const [notice,    setNotice]    = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const fromChains = BRIDGE_CHAINS.filter(c => c.id !== toChain.id);
  const toChains   = BRIDGE_CHAINS.filter(c => c.id !== fromChain.id);

  function resetSteps() {
    setSteps(INITIAL_STEPS.map(s => ({ ...s, state: 'idle' as StepState })));
  }

  function updateStep(name: string, state: StepState, txHash?: string) {
    setSteps(prev => prev.map(s => s.name === name ? { ...s, state, txHash } : s));
  }

  async function handleBridge() {
    if (!connector || !isConnected) return;
    if (!isPositiveDecimal(amount)) return;
    if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) return;

    setBridging(true);
    setNotice(null);
    resetSteps();

    try {
      if (chainId !== fromChain.id) {
        await switchChainAsync({ chainId: fromChain.id });
      }

      const provider = (await connector.getProvider()) as EIP1193Provider;
      const adapter = await createViemAdapterFromProvider({ provider });

      const kit = getAppKit();

      // Subscribe to all kit events for real-time bridge step progress.
      // AppKit emits '*' as a catch-all that includes bridge step updates.
      kit.on('*', (event: unknown) => {
        if (!event || typeof event !== 'object') return;
        const e = event as Record<string, unknown>;
        if (typeof e.name !== 'string' || typeof e.state !== 'string') return;
        const st: StepState =
          e.state === 'success' ? 'success' :
          e.state === 'error'   ? 'error'   : 'pending';
        updateStep(e.name, st, typeof e.txHash === 'string' ? e.txHash : undefined);
      });

      const result = await kit.bridge({
        from: { adapter, chain: fromChain.kit },
        to:   { adapter, chain: toChain.kit, recipientAddress: recipient },
        amount,
      });

      // Ensure final states are reflected
      if (result.steps) {
        for (const step of result.steps) {
          const st: StepState = step.state === 'success' ? 'success' : step.state === 'error' ? 'error' : 'idle';
          updateStep(step.name, st, (step as { txHash?: string }).txHash);
        }
      }

      setNotice({ type: 'success', text: `Bridge complete! ${amount} USDC sent to ${toChain.label}.` });
      setAmount('');
      setRecipient('');
      setConfirmed(false);
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Bridge failed.' });
      resetSteps();
    } finally {
      setBridging(false);
    }
  }

  const canConfirm =
    isConnected &&
    isPositiveDecimal(amount) &&
    /^0x[a-fA-F0-9]{40}$/.test(recipient) &&
    fromChain.id !== toChain.id &&
    !bridging;

  const anyStepActive = steps.some(s => s.state !== 'idle');

  return (
    <section className="glass-card p-5 sm:p-6">
      <div className="mb-5">
        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Circle CCTP</p>
        <h3 className="mt-1 text-2xl font-bold text-white">Bridge USDC</h3>
        <p className="mt-1 text-sm text-slate-400">Move USDC across chains via Cross-Chain Transfer Protocol.</p>
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
          <span>{notice.text}</span>
        </div>
      )}

      <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
        {/* Chain selectors */}
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">From</label>
            <select
              value={fromChain.id}
              onChange={e => {
                const c = BRIDGE_CHAINS.find(x => x.id === Number(e.target.value))!;
                setFromChain(c);
                if (c.id === toChain.id) setToChain(BRIDGE_CHAINS.find(x => x.id !== c.id)!);
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
            >
              {fromChains.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <ArrowRight className="mt-5 h-4 w-4 shrink-0 text-slate-500" />
          <div className="flex-1">
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">To</label>
            <select
              value={toChain.id}
              onChange={e => {
                const c = BRIDGE_CHAINS.find(x => x.id === Number(e.target.value))!;
                setToChain(c);
                if (c.id === fromChain.id) setFromChain(BRIDGE_CHAINS.find(x => x.id !== c.id)!);
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
            >
              {toChains.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
        </div>

        {/* Amount */}
        <div>
          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">Amount (USDC)</label>
          <input
            inputMode="decimal"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-blue-500"
          />
        </div>

        {/* Recipient */}
        <div>
          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">Recipient address on {toChain.label}</label>
          <input
            value={recipient}
            onChange={e => setRecipient(e.target.value)}
            placeholder="0x..."
            spellCheck={false}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-blue-500"
          />
          {recipient && !/^0x[a-fA-F0-9]{40}$/.test(recipient) && (
            <p className="mt-1 text-xs text-rose-400">Invalid address format</p>
          )}
        </div>

        {/* Confirm summary */}
        {canConfirm && !confirmed && (
          <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-3 text-xs text-slate-300 space-y-1.5">
            <div className="flex justify-between"><span className="text-slate-400">Sending</span><span className="font-semibold text-white">{amount} USDC</span></div>
            <div className="flex justify-between"><span className="text-slate-400">From</span><span>{fromChain.label}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">To</span><span>{toChain.label}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Recipient</span><span className="font-mono">{recipient.slice(0,6)}…{recipient.slice(-4)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Speed</span><span>Fast (~8-20s)</span></div>
          </div>
        )}

        {/* Step progress */}
        {anyStepActive && (
          <div className="space-y-1.5">
            {steps.map(step => (
              <div key={step.name} className="flex items-center gap-2.5 text-xs">
                {step.state === 'success' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
                {step.state === 'pending' && <Loader2 className="h-3.5 w-3.5 text-blue-400 shrink-0 animate-spin" />}
                {step.state === 'error'   && <TriangleAlert className="h-3.5 w-3.5 text-rose-400 shrink-0" />}
                {step.state === 'idle'    && <div className="h-3.5 w-3.5 rounded-full border border-slate-600 shrink-0" />}
                <span className={step.state === 'success' ? 'text-emerald-300' : step.state === 'error' ? 'text-rose-300' : step.state === 'pending' ? 'text-blue-300' : 'text-slate-500'}>
                  {step.label}
                </span>
                {step.txHash && (
                  <a href={`https://testnet.arcscan.app/tx/${step.txHash}`} target="_blank" rel="noopener noreferrer" className="ml-auto text-blue-400 hover:underline">
                    View tx
                  </a>
                )}
              </div>
            ))}
          </div>
        )}

        {/* CTA */}
        {!isConnected ? (
          <ConnectButton showBalance={false} />
        ) : !confirmed ? (
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => setConfirmed(true)}
            className="h-12 w-full rounded-xl bg-blue-600 text-base font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Review Bridge
          </button>
        ) : (
          <button
            type="button"
            disabled={bridging}
            onClick={handleBridge}
            className="h-12 w-full rounded-xl bg-emerald-600 text-base font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {bridging ? (
              <span className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Bridging…</span>
            ) : (
              `Confirm — Bridge ${amount} USDC`
            )}
          </button>
        )}

        {confirmed && !bridging && (
          <button type="button" onClick={() => setConfirmed(false)} className="w-full text-center text-xs text-slate-400 hover:text-slate-200">
            Cancel
          </button>
        )}
      </div>

      <p className="mt-3 text-center text-xs text-slate-500">
        Powered by Circle CCTP · No kit key required · Routed through attestation service
      </p>
    </section>
  );
}
