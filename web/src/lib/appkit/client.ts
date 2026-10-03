'use client';

import { AppKit } from '@circle-fin/app-kit';

let _kit: AppKit | null = null;

/** Shared singleton AppKit instance — import this everywhere instead of `new AppKit()`. */
export function getAppKit(): AppKit {
  if (!_kit) _kit = new AppKit();
  return _kit;
}
