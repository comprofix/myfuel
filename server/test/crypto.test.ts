import { describe, expect, it } from 'vitest';
import { decrypt, deriveKey, encrypt, hashPassword, verifyPassword } from '../src/crypto.ts';

describe('encryption', () => {
  const key = deriveKey('test-secret-value');
  it('round-trips', () => {
    const c = encrypt(key, '{"apiKey":"abc"}');
    expect(c).not.toContain('abc');
    expect(decrypt(key, c)).toBe('{"apiKey":"abc"}');
  });
  it('fails with the wrong key', () => {
    expect(() => decrypt(deriveKey('other-secret-value'), encrypt(key, 'x'))).toThrow();
  });
});

describe('passwords', () => {
  it('verifies correct and rejects wrong passwords', async () => {
    const h = await hashPassword('correct horse');
    expect(await verifyPassword('correct horse', h)).toBe(true);
    expect(await verifyPassword('wrong', h)).toBe(false);
  });
});
