export function timeAgo(iso: string | null): string {
  if (!iso) return 'unknown';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.round(hours / 24)} days ago`;
}

/** Short form for tight spaces: "7m ago", "3h ago", "2d ago" */
export function timeAgoShort(iso: string | null): string {
  if (!iso) return '?';
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatPrice(cents: number): string {
  return cents.toFixed(1);
}

/** Prices older than this are flagged in the UI */
export const STALE_DAYS = 7;
export function isStale(iso: string | null): boolean {
  return !iso || Date.now() - new Date(iso).getTime() > STALE_DAYS * 86400000;
}
