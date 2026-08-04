/**
 * Common test utilities and helpers for Cadence fitness app tests.
 */
import * as fc from 'fast-check';
import { expect } from 'vitest';

// Re-export fast-check for convenience
export { fc };

/**
 * Default number of iterations for property-based tests.
 * Design doc specifies minimum 100 iterations per property.
 */
export const PBT_NUM_RUNS = 100;

/**
 * Default fast-check parameters for property tests.
 */
export const defaultFcParams: fc.Parameters<unknown> = {
  numRuns: PBT_NUM_RUNS,
  verbose: fc.VerbosityLevel.None,
};

/**
 * Helper to create a UUID-like string for testing.
 */
export function createTestId(): string {
  return crypto.randomUUID();
}

/**
 * Arbitrary for generating valid UUIDs in property tests.
 */
export const arbUuid = fc.uuid();

/**
 * Arbitrary for generating positive integers (useful for reps, sets, etc.).
 */
export const arbPositiveInt = fc.integer({ min: 1, max: 1000 });

/**
 * Arbitrary for generating non-negative weights.
 */
export const arbWeight = fc.float({ min: 0, max: 500, noNaN: true });

/**
 * Arbitrary for generating RPE values (1-10 scale).
 */
export const arbRpe = fc.float({ min: 1, max: 10, noNaN: true });

/**
 * Arbitrary for generating ISO timestamp strings.
 */
export const arbTimestamp = fc.date().map((d) => d.toISOString());

/**
 * Helper to assert that a value is within a numeric tolerance.
 */
export function expectCloseTo(actual: number, expected: number, tolerance = 0.001): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}
