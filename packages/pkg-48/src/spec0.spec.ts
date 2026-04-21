import { describe, it, expect } from 'vitest';

function heavy(seed) {
  let x = seed | 0;
  for (let i = 0; i < 500_000; i++) {
    x = Math.imul(x ^ (x >>> 13), 0x5bd1e995) + i;
  }
  return x;
}

describe('pkg-48 spec-0', () => {
  for (let i = 0; i < 8; i++) {
    it('heavy ' + i, () => {
      expect(typeof heavy(i + 0 * 7 + 48 * 13)).toBe('number');
    });
  }
});
