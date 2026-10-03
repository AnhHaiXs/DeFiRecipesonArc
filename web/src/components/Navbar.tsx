'use client';

import Link from 'next/link';
import React, { useEffect, useRef, useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { ArrowRight, ChevronDown, Menu, X, Zap } from 'lucide-react';
import { useChainId } from 'wagmi';
import { usePathname } from 'next/navigation';
import { useLanguage } from '@/lib/i18n/LanguageProvider';

const ARC_CHAIN_ID = 5042002;

const APP_KIT_ITEMS = [
  { href: '/swap',            label: 'Swap',            desc: 'USDC ↔ EURC via LiFi' },
  { href: '/bridge',          label: 'Bridge',          desc: 'Cross-chain via CCTP' },
  { href: '/send',            label: 'Send',            desc: 'Same-chain USDC transfer' },
  { href: '/unified-balance', label: 'Unified Balance', desc: 'Cross-chain balance' },
] as const;

export const Navbar: React.FC = () => {
  const chainId    = useChainId();
  const pathname   = usePathname();
  const isArcChain = chainId === ARC_CHAIN_ID;
  const { lang, setLang, t } = useLanguage();

  const [mobileOpen,  setMobileOpen]  = useState(false);
  const [kitOpen,     setKitOpen]     = useState(false);
  const [mobileKitOpen, setMobileKitOpen] = useState(false);

  const kitRef = useRef<HTMLDivElement>(null);

  // Close desktop dropdown on outside click / Escape
  useEffect(() => {
    if (!kitOpen) return;
    function onDown(e: MouseEvent) {
      if (!kitRef.current?.contains(e.target as Node)) setKitOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setKitOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [kitOpen]);

  // Is any App Kit route currently active?
  const kitActive = APP_KIT_ITEMS.some(item => pathname.startsWith(item.href));

  function linkClass(href: string) {
    const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
    return active
      ? 'rounded-lg border border-blue-600 bg-blue-950/70 px-3 py-1.5 text-xs font-semibold text-blue-200'
      : 'rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-blue-500 hover:text-white';
  }

  return (
    <header className="sticky top-0 z-50 glass-card rounded-none border-b border-cardBorder">
      <div className="flex items-center justify-between px-4 py-3 sm:px-6">

        {/* Logo */}
        <Link href="/" className="flex items-center space-x-3">
          <div className="h-9 w-9 shrink-0 rounded-xl bg-gradient-to-tr from-blue-600 to-emerald-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold gradient-text leading-none">DeFi Recipes on Arc</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden lg:flex items-center gap-2">
          <nav className="flex items-center gap-1">
            {/* Recipes link */}
            <Link href="/" className={linkClass('/')}>Recipes</Link>

            {/* App Kit dropdown */}
            <div className="relative" ref={kitRef}>
              <button
                type="button"
                aria-haspopup="true"
                aria-expanded={kitOpen}
                onClick={() => setKitOpen(o => !o)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                  kitActive
                    ? 'border-blue-600 bg-blue-950/70 text-blue-200 font-semibold'
                    : 'border-slate-700 bg-slate-900/70 text-slate-300 hover:border-blue-500 hover:text-white'
                }`}
              >
                App Kit
                <ChevronDown className={`h-3 w-3 transition-transform ${kitOpen ? 'rotate-180' : ''}`} />
              </button>

              {kitOpen && (
                <div className="absolute left-0 top-[calc(100%+6px)] z-50 w-56 rounded-xl border border-slate-700 bg-slate-900/95 shadow-2xl shadow-slate-950/60 overflow-hidden">
                  <div className="px-3 pt-2.5 pb-1">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Circle App Kit</p>
                  </div>
                  {APP_KIT_ITEMS.map(item => {
                    const active = pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setKitOpen(false)}
                        className={`group flex items-start gap-3 px-3 py-2.5 transition ${
                          active
                            ? 'bg-blue-950/60 text-blue-200'
                            : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <ArrowRight className={`mt-0.5 h-3.5 w-3.5 shrink-0 transition ${active ? 'text-blue-400' : 'text-slate-500 group-hover:text-blue-400'}`} />
                        <div>
                          <div className="text-xs font-semibold leading-none">{item.label}</div>
                          <div className="mt-0.5 text-[11px] text-slate-500">{item.desc}</div>
                        </div>
                      </Link>
                    );
                  })}
                  <div className="border-t border-slate-800 px-3 py-2">
                    <p className="text-[10px] text-slate-600">Keyless · No backend · Browser wallet</p>
                  </div>
                </div>
              )}
            </div>
          </nav>

          {/* Chain badge */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700 text-xs font-mono text-emerald-400">
            <span className={`h-2 w-2 rounded-full ${isArcChain ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span>{isArcChain ? t('navArcTestnet') : t('navWrongNetwork')}</span>
          </div>

          <select
            value={lang}
            onChange={e => setLang(e.target.value as 'en' | 'vi')}
            aria-label={t('navLanguage')}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs font-semibold text-slate-200"
          >
            <option value="en">EN</option>
            <option value="vi">VI</option>
          </select>

          <ConnectButton showBalance={false} />
        </div>

        {/* Mobile: wallet + hamburger */}
        <div className="flex lg:hidden items-center gap-2">
          <ConnectButton showBalance={false} accountStatus="avatar" chainStatus="none" />
          <button
            type="button"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMobileOpen(o => !o)}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-slate-900 text-slate-300"
          >
            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Mobile panel */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-slate-800 bg-slate-950/98 px-4 py-3 space-y-1">
          {/* Recipes */}
          <Link
            href="/"
            onClick={() => setMobileOpen(false)}
            className={`block w-full rounded-lg px-3 py-2 text-sm font-medium transition ${
              pathname === '/'
                ? 'bg-blue-950/70 border border-blue-700 text-blue-200'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            Recipes
          </Link>

          {/* App Kit group */}
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 overflow-hidden">
            <button
              type="button"
              onClick={() => setMobileKitOpen(o => !o)}
              className={`flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium transition ${
                kitActive ? 'text-blue-200' : 'text-slate-300'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">App Kit</span>
              </span>
              <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${mobileKitOpen ? 'rotate-180' : ''}`} />
            </button>
            {mobileKitOpen && (
              <div className="border-t border-slate-800 divide-y divide-slate-800/60">
                {APP_KIT_ITEMS.map(item => {
                  const active = pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => { setMobileOpen(false); setMobileKitOpen(false); }}
                      className={`flex items-center gap-3 px-4 py-2.5 text-sm transition ${
                        active ? 'bg-blue-950/50 text-blue-200' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <ArrowRight className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-blue-400' : 'text-slate-600'}`} />
                      <div>
                        <div className="font-medium leading-none">{item.label}</div>
                        <div className="mt-0.5 text-[11px] text-slate-500">{item.desc}</div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bottom controls */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <div className="flex items-center gap-1.5 text-xs font-mono text-emerald-400">
              <span className={`h-2 w-2 rounded-full ${isArcChain ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
              <span>{isArcChain ? t('navArcTestnet') : t('navWrongNetwork')}</span>
            </div>
            <select
              value={lang}
              onChange={e => setLang(e.target.value as 'en' | 'vi')}
              aria-label={t('navLanguage')}
              className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs font-semibold text-slate-200"
            >
              <option value="en">EN</option>
              <option value="vi">VI</option>
            </select>
          </div>
        </div>
      )}
    </header>
  );
};
