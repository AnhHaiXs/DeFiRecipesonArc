'use client';

import { useCallback, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, TriangleAlert, Wallet } from 'lucide-react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2';
import { isAddress } from 'viem';
import type { EIP1193Provider } from 'viem';
import { UnifiedBalanceChain } from '@circle-fin/app-kit';
import { getAppKit } from '@/lib/appkit/client';

// Source chain options for deposit / spend
const SOURCE_CHAINS = [
  { id: 5042002,  kit: 'Arc_Testnet',      label: 'Arc Testnet' },
  { id: 84532,    kit: 'Base_Sepolia',     label: 'Base Sepolia' },
  { id: 11155111, kit: 'Ethereum_Sepolia', label: 'Ethereum Sepolia' },
] as const;

type SourceChain = typeof SOURCE_CHAINS[number];

type BalanceEntry = {
  chain: string;
  amount: string;
  token: string;
};

type Tab = 'balances' | 'deposit' | 'spend';

function isPositiveDecimal(v: string) {
  return /^\d*\.?\d+$/.test(v.trim()) && Number(v) > 0;
}

export function UnifiedBalancePanel() {
  const { connector, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();

  const [tab,          setTab]          = useState<Tab>('balances');
  const [balances,     setBalances]     = useState<BalanceEntry[]>([]);
  const [loadingBal,   setLoadingBal]   = useState(false);

  const [srcChain,     setSrcChain]     = useState<SourceChain>(SOURCE_CHAINS[0]);
  const [depositAmt,   setDepositAmt]   = useState('');
  const [depositing,   setDepositing]   = useState(false);

  const [spendSrc,     setSpendSrc]     = useState<SourceChain>(SOURCE_CHAINS[0]);
  const [spendDstKit,  setSpendDstKit]  = useState<string>('Arc_Testnet');
  const [spendAmt,     setSpendAmt]     = useState('');
  const [spendTo,      setSpendTo]      = useState('');
  const [spending,     setSpending]     = useState(false);

  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  /** Get adapter for the required chain, switching if needed */
  const getAdapter = useCallback(async (requiredChainId: number) => {
    if (!connector) throw new Error('Wallet not connected');
    if (chainId !== requiredChainId) {
      await switchChainAsync({ chainId: requiredChainId });
    }
    const provider = (await connector.getProvider()) as EIP1193Provider;
    return createViemAdapterFromProvider({ provider });
  }, [connector, chainId, switchChainAsync]);

  async function fetchBalances() {
    if (!connector) return;
    setLoadingBal(true);
    setNotice(null);
    try {
      const provider = (await connector.getProvider()) as EIP1193Provider;
      const adapter = await createViemAdapterFromProvider({ provider });
      const result = await getAppKit().unifiedBalance.getBalances({
        sources: { adapter },
        networkType: 'testnet',
      });
      // Map result to display entries — cast via unknown to safely iterate
      const entries: BalanceEntry[] = [];
      const raw = result as unknown as Record<string, unknown>;
      if (raw && typeof raw === 'object') {
        for (const [chain, info] of Object.entries(raw)) {
          if (info && typeof info === 'object') {
            const i = info as Record<string, unknown>;
            entries.push({
              chain,
              amount: typeof i.amount === 'string' ? i.amount : String(i.amount ?? '0'),
              token:  typeof i.token  === 'string' ? i.token  : 'USDC',
            });
          }
        }
      }
      setBalances(entries);
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Failed to fetch balances.' });
    } finally {
      setLoadingBal(false);
    }
  }

  async function handleDeposit() {
    if (!isPositiveDecimal(depositAmt)) return;
    setDepositing(true);
    setNotice(null);
    try {
      const adapter = await getAdapter(srcChain.id);
      await getAppKit().unifiedBalance.deposit({
        from: { adapter, chain: srcChain.kit },
        amount: depositAmt,
      });
      setNotice({ type: 'success', text: `Deposited ${depositAmt} USDC from ${srcChain.label} into unified balance.` });
      setDepositAmt('');
      await fetchBalances();
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Deposit failed.' });
    } finally {
      setDepositing(false);
    }
  }

  async function handleSpend() {
    if (!isPositiveDecimal(spendAmt) || !isAddress(spendTo)) return;
    setSpending(true);
    setNotice(null);
    try {
      const adapter = await getAdapter(spendSrc.id);
      await getAppKit().unifiedBalance.spend({
        from: {
          adapter,
          allocations: { amount: spendAmt, chain: spendSrc.kit },
        },
        to: {
          chain: spendDstKit as unknown as typeof UnifiedBalanceChain[keyof typeof UnifiedBalanceChain],
          recipientAddress: spendTo,
          useForwarder: true,
        },
        amount: spendAmt,
      });
      setNotice({ type: 'success', text: `Spent ${spendAmt} USDC → ${spendDstKit} to ${spendTo.slice(0,6)}…${spendTo.slice(-4)}.` });
      setSpendAmt('');
      setSpendTo('');
      await fetchBalances();
    } catch (err) {
      setNotice({ type: 'error', text: err instanceof Error ? err.message : 'Spend failed.' });
    } finally {
      setSpending(false);
    }
  }

  // busy intentionally unused in JSX — kept for future loading state

  return (
    <section className="glass-card p-5 sm:p-6">
      <div className="mb-5">
        <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Circle Unified Balance Kit</p>
        <h3 className="mt-1 text-2xl font-bold text-white">Unified Balance</h3>
        <p className="mt-1 text-sm text-slate-400">Manage a single USDC balance across multiple chains.</p>
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

      {!isConnected ? (
        <div className="flex flex-col items-center gap-4 py-8 text-center">
          <Wallet className="h-10 w-10 text-slate-500" />
          <p className="text-sm text-slate-400">Connect your wallet to manage unified balance.</p>
          <ConnectButton showBalance={false} />
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="mb-4 flex gap-1 rounded-xl border border-slate-800 bg-slate-900/60 p-1">
            {(['balances', 'deposit', 'spend'] as Tab[]).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => { setTab(t); setNotice(null); }}
                className={`flex-1 rounded-lg py-2 text-xs font-medium capitalize transition ${
                  tab === t
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {t === 'balances' ? 'Balances' : t === 'deposit' ? 'Deposit' : 'Spend'}
              </button>
            ))}
          </div>

          {/* Balances tab */}
          {tab === 'balances' && (
            <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-200">Cross-chain USDC balances</span>
                <button
                  type="button"
                  onClick={fetchBalances}
                  disabled={loadingBal}
                  className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-300 hover:border-blue-500 disabled:opacity-50"
                >
                  <RefreshCw className={`h-3 w-3 ${loadingBal ? 'animate-spin' : ''}`} />
                  Refresh
                </button>
              </div>
              {balances.length === 0 && !loadingBal && (
                <p className="py-4 text-center text-xs text-slate-500">No balances loaded — click Refresh.</p>
              )}
              {loadingBal && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
                </div>
              )}
              {!loadingBal && balances.map(b => (
                <div key={b.chain} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2.5 text-sm">
                  <span className="text-slate-300">{b.chain}</span>
                  <span className="font-semibold tabular-nums text-white">{Number(b.amount).toLocaleString(undefined, { maximumFractionDigits: 6 })} {b.token}</span>
                </div>
              ))}
            </div>
          )}

          {/* Deposit tab */}
          {tab === 'deposit' && (
            <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">Source chain</label>
                <select
                  value={srcChain.id}
                  onChange={e => setSrcChain(SOURCE_CHAINS.find(c => c.id === Number(e.target.value))!)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
                >
                  {SOURCE_CHAINS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">Amount (USDC)</label>
                <input
                  inputMode="decimal"
                  value={depositAmt}
                  onChange={e => setDepositAmt(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-blue-500"
                />
              </div>
              <button
                type="button"
                disabled={!isPositiveDecimal(depositAmt) || depositing}
                onClick={handleDeposit}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-base font-semibold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {depositing ? <><Loader2 className="h-4 w-4 animate-spin" /> Depositing…</> : 'Deposit into Unified Balance'}
              </button>
            </div>
          )}

          {/* Spend tab */}
          {tab === 'spend' && (
            <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">Allocate from chain</label>
                <select
                  value={spendSrc.id}
                  onChange={e => setSpendSrc(SOURCE_CHAINS.find(c => c.id === Number(e.target.value))!)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500"
                >
                  {SOURCE_CHAINS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">Destination chain (kit name)</label>
                <input
                  value={spendDstKit}
                  onChange={e => setSpendDstKit(e.target.value)}
                  placeholder="e.g. Arc_Testnet"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">Recipient address</label>
                <input
                  value={spendTo}
                  onChange={e => setSpendTo(e.target.value)}
                  placeholder="0x..."
                  spellCheck={false}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-blue-500"
                />
                {spendTo && !isAddress(spendTo) && (
                  <p className="mt-1 text-xs text-rose-400">Invalid address</p>
                )}
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">Amount (USDC)</label>
                <input
                  inputMode="decimal"
                  value={spendAmt}
                  onChange={e => setSpendAmt(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-blue-500"
                />
              </div>
              <button
                type="button"
                disabled={!isPositiveDecimal(spendAmt) || !isAddress(spendTo) || spending}
                onClick={handleSpend}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-base font-semibold text-white shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {spending ? <><Loader2 className="h-4 w-4 animate-spin" /> Spending…</> : 'Spend from Unified Balance'}
              </button>
            </div>
          )}

          <p className="mt-3 text-center text-xs text-slate-500">
            Powered by Circle Gateway · No kit key required · Forwarding Service enabled
          </p>
        </>
      )}
    </section>
  );
}
