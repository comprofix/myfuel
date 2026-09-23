import { describe, expect, it } from 'vitest';
import { inWindow, parseHhMm, parseSydneyDateTime } from '../src/time.ts';

describe('parseSydneyDateTime', () => {
  it('parses AEST (winter, UTC+10)', () => {
    expect(parseSydneyDateTime('15/06/2026 12:00:00')?.toISOString()).toBe('2026-06-15T02:00:00.000Z');
  });
  it('parses AEDT (summer, UTC+11)', () => {
    expect(parseSydneyDateTime('15/01/2026 12:00:00')?.toISOString()).toBe('2026-01-15T01:00:00.000Z');
  });
  it('rejects malformed input', () => {
    expect(parseSydneyDateTime('2026-01-15 12:00')).toBeNull();
  });
});

describe('inWindow', () => {
  const start = parseHhMm('22:00'), end = parseHhMm('05:00');
  it('wraps past midnight', () => {
    expect(inWindow(parseHhMm('23:30'), start, end)).toBe(true);
    expect(inWindow(parseHhMm('04:59'), start, end)).toBe(true);
    expect(inWindow(parseHhMm('05:00'), start, end)).toBe(false);
    expect(inWindow(parseHhMm('12:00'), start, end)).toBe(false);
  });
  it('handles same-day windows', () => {
    expect(inWindow(parseHhMm('13:00'), parseHhMm('12:00'), parseHhMm('14:00'))).toBe(true);
    expect(inWindow(parseHhMm('14:00'), parseHhMm('12:00'), parseHhMm('14:00'))).toBe(false);
  });
});
