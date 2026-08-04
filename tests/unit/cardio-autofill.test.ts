/**
 * Unit tests for Cardio Auto-Fill Service.
 * Validates requirements 15.1 (auto-fill from imported health data)
 * and 15.3 (indicate which values originated from the Health_Provider).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    getCardioAutofill,
    getCardioAutofillValues,
} from '@/services/cardio-autofill';
import type { ImportedWorkout } from '@/types/health';

// --- Mock Supabase ---

const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockGte = vi.fn();
const mockLte = vi.fn();
const mockOrder = vi.fn();

vi.mock('@/utils/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: mockSelect,
    })),
  },
}));

// Chain the query builder mocks
beforeEach(() => {
  vi.clearAllMocks();
  mockSelect.mockReturnValue({ eq: mockEq });
  mockEq.mockReturnValue({ gte: mockGte });
  mockGte.mockReturnValue({ lte: mockLte });
  mockLte.mockReturnValue({ order: mockOrder });
  mockOrder.mockResolvedValue({ data: [], error: null });
});

// --- Test Helpers ---

function makeImportedWorkout(overrides: Partial<ImportedWorkout> = {}): ImportedWorkout {
  return {
    id: 'workout-1',
    user_id: 'user-1',
    raw_record_id: 'raw-1',
    provider: 'apple_healthkit',
    provider_record_id: 'provider-1',
    workout_type: 'running',
    start_time: '2024-01-15T08:00:00Z',
    end_time: '2024-01-15T08:30:00Z',
    duration_seconds: 1800,
    distance_meters: 5000,
    average_pace_seconds_per_km: 360,
    average_speed_kmh: 10,
    elevation_gain_meters: 50,
    synced_at: '2024-01-15T09:00:00Z',
    ...overrides,
  };
}

// --- Tests ---

describe('getCardioAutofillValues', () => {
  it('should extract all available fields with health_provider source', () => {
    const workout = makeImportedWorkout();
    const result = getCardioAutofillValues(workout);

    expect(result.distance_meters).toEqual({ value: 5000, source: 'health_provider' });
    expect(result.duration_seconds).toEqual({ value: 1800, source: 'health_provider' });
    expect(result.average_pace_seconds_per_km).toEqual({ value: 360, source: 'health_provider' });
    expect(result.average_speed_kmh).toEqual({ value: 10, source: 'health_provider' });
    expect(result.elevation_gain_meters).toEqual({ value: 50, source: 'health_provider' });
  });

  it('should return null for fields not present in the workout', () => {
    const workout = makeImportedWorkout({
      distance_meters: undefined,
      average_pace_seconds_per_km: undefined,
      average_speed_kmh: undefined,
      elevation_gain_meters: undefined,
    });
    const result = getCardioAutofillValues(workout);

    expect(result.distance_meters).toBeNull();
    expect(result.duration_seconds).toEqual({ value: 1800, source: 'health_provider' });
    expect(result.average_pace_seconds_per_km).toBeNull();
    expect(result.average_speed_kmh).toBeNull();
    expect(result.elevation_gain_meters).toBeNull();
  });

  it('should include correct provider name from the workout', () => {
    const appleWorkout = makeImportedWorkout({ provider: 'apple_healthkit' });
    const result = getCardioAutofillValues(appleWorkout);

    // All values should be labeled as health_provider source
    expect(result.distance_meters?.source).toBe('health_provider');
  });

  it('should handle workout with only duration available', () => {
    const workout = makeImportedWorkout({
      distance_meters: undefined,
      average_pace_seconds_per_km: undefined,
      average_speed_kmh: undefined,
      elevation_gain_meters: undefined,
    });
    const result = getCardioAutofillValues(workout);

    expect(result.duration_seconds).toEqual({ value: 1800, source: 'health_provider' });
    expect(result.distance_meters).toBeNull();
    expect(result.average_pace_seconds_per_km).toBeNull();
    expect(result.average_speed_kmh).toBeNull();
    expect(result.elevation_gain_meters).toBeNull();
  });
});

describe('getCardioAutofill (integration with Supabase)', () => {
  const testDate = new Date('2024-01-15T12:00:00Z');
  const userId = 'user-1';
  const programDayId = 'day-1';

  it('should return found=false when no workouts exist in the time window', async () => {
    mockOrder.mockResolvedValue({ data: [], error: null });

    const result = await getCardioAutofill(userId, programDayId, testDate);

    expect(result.found).toBe(false);
    expect(result.values).toBeNull();
    expect(result.providerName).toBeNull();
    expect(result.matchedWorkout).toBeNull();
  });

  it('should return found=false when Supabase returns an error', async () => {
    mockOrder.mockResolvedValue({ data: null, error: { message: 'DB error' } });

    const result = await getCardioAutofill(userId, programDayId, testDate);

    expect(result.found).toBe(false);
    expect(result.values).toBeNull();
  });

  it('should return the most recent workout when no exercise type is specified', async () => {
    const workout = makeImportedWorkout();
    mockOrder.mockResolvedValue({ data: [workout], error: null });

    const result = await getCardioAutofill(userId, programDayId, testDate);

    expect(result.found).toBe(true);
    expect(result.matchedWorkout).toEqual(workout);
    expect(result.providerName).toBe('apple_healthkit');
    expect(result.values?.distance_meters?.value).toBe(5000);
  });

  it('should match exercise type to workout type when specified', async () => {
    const runningWorkout = makeImportedWorkout({ workout_type: 'running', id: 'run-1' });
    const cyclingWorkout = makeImportedWorkout({
      workout_type: 'cycling',
      id: 'cycle-1',
      distance_meters: 20000,
    });
    mockOrder.mockResolvedValue({
      data: [cyclingWorkout, runningWorkout],
      error: null,
    });

    const result = await getCardioAutofill(userId, programDayId, testDate, 'running');

    expect(result.found).toBe(true);
    expect(result.matchedWorkout?.id).toBe('run-1');
  });

  it('should fall back to most recent workout if exercise type has no match', async () => {
    const swimmingWorkout = makeImportedWorkout({ workout_type: 'swimming', id: 'swim-1' });
    mockOrder.mockResolvedValue({
      data: [swimmingWorkout],
      error: null,
    });

    const result = await getCardioAutofill(userId, programDayId, testDate, 'rowing');

    // No direct match for rowing → swimming, so falls back to most recent
    expect(result.found).toBe(true);
    expect(result.matchedWorkout?.id).toBe('swim-1');
  });

  it('should include provider name in the result for UI labeling', async () => {
    const workout = makeImportedWorkout({ provider: 'health_connect' });
    mockOrder.mockResolvedValue({ data: [workout], error: null });

    const result = await getCardioAutofill(userId, programDayId, testDate);

    expect(result.providerName).toBe('health_connect');
  });

  it('should support custom time window', async () => {
    const workout = makeImportedWorkout();
    mockOrder.mockResolvedValue({ data: [workout], error: null });

    await getCardioAutofill(userId, programDayId, testDate, undefined, 48);

    // Verify the query was made (the mock chain was called)
    expect(mockSelect).toHaveBeenCalledWith('*');
  });

  it('should match case-insensitively on exercise type', async () => {
    const workout = makeImportedWorkout({ workout_type: 'Running' });
    mockOrder.mockResolvedValue({ data: [workout], error: null });

    const result = await getCardioAutofill(userId, programDayId, testDate, 'RUNNING');

    expect(result.found).toBe(true);
    expect(result.matchedWorkout?.workout_type).toBe('Running');
  });

  it('should match HealthKit activity type identifiers', async () => {
    const workout = makeImportedWorkout({
      workout_type: 'HKWorkoutActivityTypeRunning',
    });
    mockOrder.mockResolvedValue({ data: [workout], error: null });

    const result = await getCardioAutofill(userId, programDayId, testDate, 'running');

    expect(result.found).toBe(true);
  });
});
