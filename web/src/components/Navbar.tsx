'use client';

import Link from 'next/link';
import React, { useState } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Menu, X, Zap } from 'lucide-react';
import { useChainId } from 'wagmi';
import { usePathname } from 'next/navigation';
import { useLanguage } from '@/lib/i18n/LanguageProvider';

const ARC_CHAIN_ID = 5042002;

const NAV_LINKS = [
  { href: '/',                label: 'Recipes' },
  { href: '/swap',            label: 'Swap' },
  { href: '/bridge',          label: 'Bridge' },
  { href: '/send',            label: 'Send' },
  { href: '/unified-balance', label: 'Unified' },
] as const;

export const Navbar: React.FC = () => {
  const chainId  = useChainId();
  const pathname = usePathname();
  const isArcChain = chainId === ARC_CHAIN_ID;
  const { lang, setLang, t } = useLanguage();
  const [mobileOpen, setMobileOpen] = useState(false);

  function navClass(href: string) {
    const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
    return isActive
      ? 'rounded-lg border border-blue-600 bg-blue-950/70 px-3 py-1.5 text-xs font-semibold text-blue-200 transition'
      : 'rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-blue-500 hover:text-white';
  }

  return (
    <header className="sticky top-0 z-50 glass-card rounded-none border-b border-cardBorder">
      <div className="flex items-center justify-between px-4 py-3 sm:px-6">
        {/* Logo */}
        <div className="flex items-center space-x-3">
          <div className="h-9 w-9 shrink-0 rounded-xl bg-gradient-to-tr from-blue-600 to-emerald-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Zap className="h-5 w-5 text-white" />
          </div>
          <h1 className="text-lg font-bold gradient-text leading-none">DeFi Recipes on Arc</h1>
        </div>

        {/* Desktop nav */}
        <div className="hidden lg:flex items-center gap-3">
          <nav className="flex items-center gap-1">
            {NAV_LINKS.map(link => (
              <Link key={link.href} href={link.href} className={navClass(link.href)}>
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700 text-xs font-mono text-emerald-400">
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

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="lg:hidden border-t border-slate-800 bg-slate-950/95 px-4 py-3 space-y-1">
          {NAV_LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className={`block w-full rounded-lg px-3 py-2 text-sm font-medium transition ${
                (link.href === '/' ? pathname === '/' : pathname.startsWith(link.href))
                  ? 'bg-blue-950/70 text-blue-200 border border-blue-700'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {link.label}
            </Link>
          ))}
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
