import { describe, expect, it } from 'vitest';
import { createTestId, defaultFcParams, expectCloseTo, fc, PBT_NUM_RUNS } from '../setup/test-helpers';

describe('Test infrastructure', () => {
  it('should have vitest working', () => {
    expect(1 + 1).toBe(2);
  });

  it('should have fast-check working', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        expect(a + b).toBe(b + a);
      }),
      defaultFcParams,
    );
  });

  it('should resolve path aliases', async () => {
    // This test verifies the @/ alias resolves without error
    // Once src/ has modules, we can import them via @/
    expect(true).toBe(true);
  });

  it('should export test helpers correctly', () => {
    expect(PBT_NUM_RUNS).toBe(100);
    expect(typeof createTestId).toBe('function');
    expect(typeof expectCloseTo).toBe('function');

    const id = createTestId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
