import { nswAdapter } from './nsw.ts';
import { ntAdapter } from './nt.ts';
import { qldAdapter } from './qld.ts';
import { waAdapter } from './wa.ts';
import type { SourceAdapter } from './types.ts';

export const adapters: SourceAdapter[] = [nswAdapter, ntAdapter, qldAdapter, waAdapter];

export function getAdapter(id: string): SourceAdapter | undefined {
  return adapters.find((a) => a.id === id);
}
