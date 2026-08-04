/**
 * Unit tests for the health data normalizer service.
 * Validates transformation of raw HealthKit/Health Connect records into typed domain models.
 */
import {
    normalizeActivity,
    normalizeHeartRate,
    normalizeRecord,
    normalizeSleep,
    normalizeWorkout,
} from '@/services/health/normalizer';
import type { RawHealthRecord } from '@/types/health';
import { describe, expect, it } from 'vitest';

// --- Test helpers ---

function makeRawRecord(overrides: Partial<RawHealthRecord> = {}): RawHealthRecord {
  return {
    id: 'raw-1',
    user_id: 'user-1',
    provider: 'apple_healthkit',
    provider_record_id: 'provider-rec-1',
    data_type: 'workout',
    raw_payload: {},
    recorded_at: '2024-06-01T08:00:00Z',
    synced_at: '2024-06-01T09:00:00Z',
    sync_status: 'synced',
    ...overrides,
  };
}

// --- normalizeWorkout ---

describe('normalizeWorkout', () => {
  it('should normalize a valid HealthKit workout payload', () => {
    const raw = makeRawRecord({
      raw_payload: {
        workoutActivityType: 'running',
        startDate: '2024-06-01T07:00:00Z',
        endDate: '2024-06-01T07:30:00Z',
        duration: 1800,
        totalDistance: 5000,
        averageSpeed: 10,
        totalElevationGain: 50,
      },
    });

    const result = normalizeWorkout(raw);

    expect(result.success).toBe(true);
    expect(result.data).not.toBeNull();
    expect(result.data!.workout_type).toBe('running');
    expect(result.data!.start_time).toBe('2024-06-01T07:00:00Z');
    expect(result.data!.end_time).toBe('2024-06-01T07:30:00Z');
    expect(result.data!.duration_seconds).toBe(1800);
    expect(result.data!.distance_meters).toBe(5000);
    expect(result.data!.average_speed_kmh).toBe(10);
    expect(result.data!.elevation_gain_meters).toBe(50);
    expect(result.errors).toEqual([]);
  });

  it('should normalize a valid Health Connect workout payload', () => {
    const raw = makeRawRecord({
      provider: 'health_connect',
      raw_payload: {
        exerciseType: 'cycling',
        startTime: '2024-06-01T17:00:00Z',
        endTime: '2024-06-01T18:00:00Z',
        duration: 3600,
        distance_meters: 25000,
        average_speed_kmh: 25,
      },
    });

    const result = normalizeWorkout(raw);

    expect(result.success).toBe(true);
    expect(result.data!.workout_type).toBe('cycling');
    expect(result.data!.start_time).toBe('2024-06-01T17:00:00Z');
    expect(result.data!.end_time).toBe('2024-06-01T18:00:00Z');
    expect(result.data!.duration_seconds).toBe(3600);
    expect(result.data!.distance_meters).toBe(25000);
  });

  it('should calculate duration from start/end times when duration is missing', () => {
    const raw = makeRawRecord({
      raw_payload: {
        workoutActivityType: 'swimming',
        startDate: '2024-06-01T10:00:00Z',
        endDate: '2024-06-01T10:45:00Z',
      },
    });

    const result = normalizeWorkout(raw);

    expect(result.success).toBe(true);
    expect(result.data!.duration_seconds).toBe(2700); // 45 minutes
  });

  it('should preserve source metadata (provider, provider_record_id, synced_at)', () => {
    const raw = makeRawRecord({
      provider: 'health_connect',
      provider_record_id: 'hc-workout-123',
      synced_at: '2024-06-01T12:00:00Z',
      raw_payload: {
        exerciseType: 'walking',
        startTime: '2024-06-01T08:00:00Z',
        endTime: '2024-06-01T09:00:00Z',
        duration: 3600,
      },
    });

    const result = normalizeWorkout(raw);

    expect(result.success).toBe(true);
    expect(result.data!.provider).toBe('health_connect');
    expect(result.data!.provider_record_id).toBe('hc-workout-123');
    expect(result.data!.synced_at).toBe('2024-06-01T12:00:00Z');
    expect(result.data!.raw_record_id).toBe('raw-1');
  });

  it('should set optional fields to undefined when missing', () => {
    const raw = makeRawRecord({
      raw_payload: {
        workoutActivityType: 'strength_training',
        startDate: '2024-06-01T10:00:00Z',
        endDate: '2024-06-01T11:00:00Z',
        duration: 3600,
      },
    });

    const result = normalizeWorkout(raw);

    expect(result.success).toBe(true);
    expect(result.data!.distance_meters).toBeUndefined();
    expect(result.data!.average_pace_seconds_per_km).toBeUndefined();
    expect(result.data!.average_speed_kmh).toBeUndefined();
    expect(result.data!.elevation_gain_meters).toBeUndefined();
    expect(result.data!.route_data).toBeUndefined();
    expect(result.errors).toEqual([]);
  });

  it('should fail when workout_type is missing', () => {
    const raw = makeRawRecord({
      raw_payload: {
        startDate: '2024-06-01T10:00:00Z',
        endDate: '2024-06-01T11:00:00Z',
        duration: 3600,
      },
    });

    const result = normalizeWorkout(raw);

    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
    expect(result.errors).toContain('Missing required field: workout_type');
  });

  it('should fail when start_time is missing', () => {
    const raw = makeRawRecord({
      raw_payload: {
        workoutActivityType: 'running',
        endDate: '2024-06-01T11:00:00Z',
        duration: 3600,
      },
    });

    const result = normalizeWorkout(raw);

    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
    expect(result.errors).toContain('Missing required field: start_time');
  });

  it('should fail when end_time is missing', () => {
    const raw = makeRawRecord({
      raw_payload: {
        workoutActivityType: 'running',
        startDate: '2024-06-01T10:00:00Z',
        duration: 3600,
      },
    });

    const result = normalizeWorkout(raw);

    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
    expect(result.errors).toContain('Missing required field: end_time');
  });

  it('should parse route_data array into GeoPoints', () => {
    const raw = makeRawRecord({
      raw_payload: {
        workoutActivityType: 'running',
        startDate: '2024-06-01T07:00:00Z',
        endDate: '2024-06-01T07:30:00Z',
        duration: 1800,
        route: [
          { latitude: 59.9, longitude: 10.7 },
          { lat: 59.91, lng: 10.71 },
        ],
      },
    });

    const result = normalizeWorkout(raw);

    expect(result.success).toBe(true);
    expect(result.data!.route_data).toHaveLength(2);
    expect(result.data!.route_data![0]).toEqual({ latitude: 59.9, longitude: 10.7 });
    expect(result.data!.route_data![1]).toEqual({ latitude: 59.91, longitude: 10.71 });
  });
});

// --- normalizeSleep ---

describe('normalizeSleep', () => {
  it('should normalize a valid sleep record with all stages', () => {
    const raw = makeRawRecord({
      data_type: 'sleep',
      raw_payload: {
        date: '2024-06-01',
        total_duration_minutes: 480,
        deep_minutes: 90,
        light_minutes: 240,
        rem_minutes: 120,
        awake_minutes: 30,
      },
    });

    const result = normalizeSleep(raw);

    expect(result.success).toBe(true);
    expect(result.data!.date).toBe('2024-06-01');
    expect(result.data!.total_duration_minutes).toBe(480);
    expect(result.data!.deep_minutes).toBe(90);
    expect(result.data!.light_minutes).toBe(240);
    expect(result.data!.rem_minutes).toBe(120);
    expect(result.data!.awake_minutes).toBe(30);
  });

  it('should handle HealthKit sleep payload shape', () => {
    const raw = makeRawRecord({
      data_type: 'sleep',
      raw_payload: {
        startDate: '2024-06-01T22:30:00Z',
        totalDuration: 450,
        deepSleep: 80,
        lightSleep: 220,
        remSleep: 100,
        awake: 50,
      },
    });

    const result = normalizeSleep(raw);

    expect(result.success).toBe(true);
    expect(result.data!.date).toBe('2024-06-01');
    expect(result.data!.total_duration_minutes).toBe(450);
    expect(result.data!.deep_minutes).toBe(80);
    expect(result.data!.light_minutes).toBe(220);
    expect(result.data!.rem_minutes).toBe(100);
    expect(result.data!.awake_minutes).toBe(50);
  });

  it('should set optional stage fields to undefined when missing', () => {
    const raw = makeRawRecord({
      data_type: 'sleep',
      raw_payload: {
        date: '2024-06-01',
        total_duration_minutes: 420,
      },
    });

    const result = normalizeSleep(raw);

    expect(result.success).toBe(true);
    expect(result.data!.total_duration_minutes).toBe(420);
    expect(result.data!.deep_minutes).toBeUndefined();
    expect(result.data!.light_minutes).toBeUndefined();
    expect(result.data!.rem_minutes).toBeUndefined();
    expect(result.data!.awake_minutes).toBeUndefined();
    expect(result.errors).toEqual([]);
  });

  it('should fail when date is missing', () => {
    const raw = makeRawRecord({
      data_type: 'sleep',
      raw_payload: {
        total_duration_minutes: 420,
      },
    });

    const result = normalizeSleep(raw);

    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
    expect(result.errors).toContain('Missing required field: date');
  });

  it('should fail when total_duration_minutes is missing', () => {
    const raw = makeRawRecord({
      data_type: 'sleep',
      raw_payload: {
        date: '2024-06-01',
      },
    });

    const result = normalizeSleep(raw);

    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
    expect(result.errors).toContain('Missing required field: total_duration_minutes');
  });

  it('should preserve source metadata', () => {
    const raw = makeRawRecord({
      id: 'raw-sleep-1',
      provider: 'health_connect',
      provider_record_id: 'hc-sleep-456',
      synced_at: '2024-06-02T06:00:00Z',
      data_type: 'sleep',
      raw_payload: {
        date: '2024-06-01',
        total_duration_minutes: 480,
      },
    });

    const result = normalizeSleep(raw);

    expect(result.success).toBe(true);
    expect(result.data!.provider).toBe('health_connect');
    expect(result.data!.raw_record_id).toBe('raw-sleep-1');
    expect(result.data!.synced_at).toBe('2024-06-02T06:00:00Z');
  });
});

// --- normalizeActivity ---

describe('normalizeActivity', () => {
  it('should normalize a valid activity record with all fields', () => {
    const raw = makeRawRecord({
      data_type: 'activity',
      raw_payload: {
        date: '2024-06-01',
        steps: 12000,
        active_calories: 450,
        hrv_ms: 45,
        vo2_max: 42.5,
      },
    });

    const result = normalizeActivity(raw);

    expect(result.success).toBe(true);
    expect(result.data!.date).toBe('2024-06-01');
    expect(result.data!.steps).toBe(12000);
    expect(result.data!.active_calories).toBe(450);
    expect(result.data!.hrv_ms).toBe(45);
    expect(result.data!.vo2_max).toBe(42.5);
  });

  it('should handle HealthKit activity payload shape', () => {
    const raw = makeRawRecord({
      data_type: 'activity',
      raw_payload: {
        startDate: '2024-06-01T00:00:00Z',
        stepCount: 8000,
        activeEnergyBurned: 350,
        heartRateVariability: 52,
        vo2Max: 38,
      },
    });

    const result = normalizeActivity(raw);

    expect(result.success).toBe(true);
    expect(result.data!.date).toBe('2024-06-01');
    expect(result.data!.steps).toBe(8000);
    expect(result.data!.active_calories).toBe(350);
    expect(result.data!.hrv_ms).toBe(52);
    expect(result.data!.vo2_max).toBe(38);
  });

  it('should succeed with only partial activity data', () => {
    const raw = makeRawRecord({
      data_type: 'activity',
      raw_payload: {
        date: '2024-06-01',
        steps: 5000,
      },
    });

    const result = normalizeActivity(raw);

    expect(result.success).toBe(true);
    expect(result.data!.steps).toBe(5000);
    expect(result.data!.active_calories).toBeUndefined();
    expect(result.data!.hrv_ms).toBeUndefined();
    expect(result.data!.vo2_max).toBeUndefined();
  });

  it('should succeed with warning when no activity fields are present', () => {
    const raw = makeRawRecord({
      data_type: 'activity',
      raw_payload: {
        date: '2024-06-01',
      },
    });

    const result = normalizeActivity(raw);

    expect(result.success).toBe(true);
    expect(result.errors).toContain('No activity data fields found in raw_payload');
  });

  it('should fail when date is missing', () => {
    const raw = makeRawRecord({
      data_type: 'activity',
      raw_payload: {
        steps: 10000,
      },
    });

    const result = normalizeActivity(raw);

    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
    expect(result.errors).toContain('Missing required field: date');
  });

  it('should preserve source metadata', () => {
    const raw = makeRawRecord({
      id: 'raw-activity-1',
      provider: 'apple_healthkit',
      provider_record_id: 'hk-activity-789',
      synced_at: '2024-06-01T23:59:00Z',
      data_type: 'activity',
      raw_payload: {
        date: '2024-06-01',
        steps: 7000,
      },
    });

    const result = normalizeActivity(raw);

    expect(result.success).toBe(true);
    expect(result.data!.provider).toBe('apple_healthkit');
    expect(result.data!.raw_record_id).toBe('raw-activity-1');
    expect(result.data!.synced_at).toBe('2024-06-01T23:59:00Z');
  });
});

// --- normalizeHeartRate ---

describe('normalizeHeartRate', () => {
  it('should normalize a valid heart rate record with all fields', () => {
    const raw = makeRawRecord({
      data_type: 'heart_rate',
      raw_payload: {
        date: '2024-06-01',
        resting_bpm: 58,
        average_bpm: 72,
        max_bpm: 165,
      },
    });

    const result = normalizeHeartRate(raw);

    expect(result.success).toBe(true);
    expect(result.data!.date).toBe('2024-06-01');
    expect(result.data!.resting_bpm).toBe(58);
    expect(result.data!.average_bpm).toBe(72);
    expect(result.data!.max_bpm).toBe(165);
  });

  it('should handle HealthKit heart rate payload shape', () => {
    const raw = makeRawRecord({
      data_type: 'heart_rate',
      raw_payload: {
        startDate: '2024-06-01T00:00:00Z',
        restingHeartRate: 60,
        averageHeartRate: 75,
        maxHeartRate: 170,
      },
    });

    const result = normalizeHeartRate(raw);

    expect(result.success).toBe(true);
    expect(result.data!.date).toBe('2024-06-01');
    expect(result.data!.resting_bpm).toBe(60);
    expect(result.data!.average_bpm).toBe(75);
    expect(result.data!.max_bpm).toBe(170);
  });

  it('should succeed with only partial heart rate data', () => {
    const raw = makeRawRecord({
      data_type: 'heart_rate',
      raw_payload: {
        date: '2024-06-01',
        resting_bpm: 55,
      },
    });

    const result = normalizeHeartRate(raw);

    expect(result.success).toBe(true);
    expect(result.data!.resting_bpm).toBe(55);
    expect(result.data!.average_bpm).toBeUndefined();
    expect(result.data!.max_bpm).toBeUndefined();
  });

  it('should succeed with warning when no heart rate fields are present', () => {
    const raw = makeRawRecord({
      data_type: 'heart_rate',
      raw_payload: {
        date: '2024-06-01',
      },
    });

    const result = normalizeHeartRate(raw);

    expect(result.success).toBe(true);
    expect(result.errors).toContain('No heart rate data fields found in raw_payload');
  });

  it('should fail when date is missing', () => {
    const raw = makeRawRecord({
      data_type: 'heart_rate',
      raw_payload: {
        resting_bpm: 60,
      },
    });

    const result = normalizeHeartRate(raw);

    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
    expect(result.errors).toContain('Missing required field: date');
  });
});

// --- normalizeRecord (dispatcher) ---

describe('normalizeRecord', () => {
  it('should dispatch workout records to normalizeWorkout', () => {
    const raw = makeRawRecord({
      data_type: 'workout',
      raw_payload: {
        workoutActivityType: 'running',
        startDate: '2024-06-01T07:00:00Z',
        endDate: '2024-06-01T07:30:00Z',
        duration: 1800,
      },
    });

    const result = normalizeRecord(raw);

    expect(result.success).toBe(true);
    expect((result.data as any).workout_type).toBe('running');
  });

  it('should dispatch sleep records to normalizeSleep', () => {
    const raw = makeRawRecord({
      data_type: 'sleep',
      raw_payload: {
        date: '2024-06-01',
        total_duration_minutes: 480,
      },
    });

    const result = normalizeRecord(raw);

    expect(result.success).toBe(true);
    expect((result.data as any).total_duration_minutes).toBe(480);
  });

  it('should dispatch activity records to normalizeActivity', () => {
    const raw = makeRawRecord({
      data_type: 'activity',
      raw_payload: {
        date: '2024-06-01',
        steps: 10000,
      },
    });

    const result = normalizeRecord(raw);

    expect(result.success).toBe(true);
    expect((result.data as any).steps).toBe(10000);
  });

  it('should dispatch heart_rate records to normalizeHeartRate', () => {
    const raw = makeRawRecord({
      data_type: 'heart_rate',
      raw_payload: {
        date: '2024-06-01',
        resting_bpm: 60,
      },
    });

    const result = normalizeRecord(raw);

    expect(result.success).toBe(true);
    expect((result.data as any).resting_bpm).toBe(60);
  });

  it('should handle body_metrics as passthrough', () => {
    const raw = makeRawRecord({
      data_type: 'body_metrics',
      raw_payload: {
        weight_kg: 80,
        body_fat_percent: 15,
      },
    });

    const result = normalizeRecord(raw);

    expect(result.success).toBe(true);
    expect((result.data as any).raw_payload).toEqual({
      weight_kg: 80,
      body_fat_percent: 15,
    });
    expect(result.errors).toContain(
      'body_metrics normalization is a passthrough — no typed model defined yet'
    );
  });

  it('should return failure for unsupported data_type', () => {
    const raw = makeRawRecord({
      data_type: 'unknown_type' as any,
      raw_payload: {},
    });

    const result = normalizeRecord(raw);

    expect(result.success).toBe(false);
    expect(result.data).toBeNull();
    expect(result.errors).toContain('Unsupported data_type: unknown_type');
  });
});
