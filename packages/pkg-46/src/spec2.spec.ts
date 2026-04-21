import { describe, it, expect } from 'vitest';

function heavy(seed) {
  let x = seed | 0;
  for (let i = 0; i < 500_000; i++) {
    x = Math.imul(x ^ (x >>> 13), 0x5bd1e995) + i;
  }
  return x;
}

describe('pkg-46 spec-2', () => {
  for (let i = 0; i < 8; i++) {
    it('heavy ' + i, () => {
      expect(typeof heavy(i + 2 * 7 + 46 * 13)).toBe('number');
    });
  }
});
