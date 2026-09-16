/**
 * Unit tests for the cardio analytics section of the analytics engine (Task 2).
 * Covers pace trend, distance buckets, weekly load, and elevation adjustment.
 */
import { describe, expect, it } from 'vitest';

import {
    type CardioEffort,
    computeCardioLoad,
    computeCardioTrend,
    computeDistanceBuckets,
    derivePace,
    distanceBucketLabel,
    elevationAdjustedPace,
} from '../../supabase/functions/_shared/analytics-engine.ts';

function effort(overrides: Partial<CardioEffort> = {}): CardioEffort {
  return {
    activity_type: 'running',
    distance_meters: 5000,
    duration_seconds: 1500, // 5000m in 1500s → 300 s/km
    avg_pace_seconds_per_km: 300,
    avg_speed_kmh: 12,
    elevation_gain_meters: 0,
    date: '2026-01-05T10:00:00Z',
    ...overrides,
  };
}

describe('derivePace', () => {
  it('computes pace from distance and duration', () => {
    expect(derivePace(5000, 1500)).toBe(300);
  });

  it('returns null for zero distance', () => {
    expect(derivePace(0, 1500)).toBeNull();
  });
});

describe('elevationAdjustedPace', () => {
  it('returns raw pace for flat efforts', () => {
    expect(elevationAdjustedPace(effort({ elevation_gain_meters: 0 }))).toBe(300);
  });

  it('adjusts pace faster (lower) for hilly efforts', () => {
    // 5km with 100m gain → 20 m/km → adjustment = (20/10)*6 = 12 s/km
    const adj = elevationAdjustedPace(effort({ elevation_gain_meters: 100 }));
    expect(adj).toBeCloseTo(288, 0);
  });

  it('derives pace when avg pace is missing', () => {
    const adj = elevationAdjustedPace(
      effort({ avg_pace_seconds_per_km: null, elevation_gain_meters: 0 })
    );
    expect(adj).toBe(300);
  });
});

describe('computeCardioTrend', () => {
  it('labels a faster-over-time series as increasing fitness', () => {
    const efforts = [
      effort({ date: '2026-01-05T10:00:00Z', avg_pace_seconds_per_km: 340 }), // W02 slower
      effort({ date: '2026-01-12T10:00:00Z', avg_pace_seconds_per_km: 300 }), // W03 faster
    ];
    const trend = computeCardioTrend('running', efforts);
    expect(trend.weekly).toHaveLength(2);
    expect(trend.pace_trend).toBe('increasing');
    expect(trend.best_pace_seconds_per_km).toBe(300);
  });

  it('labels a slower-over-time series as decreasing fitness', () => {
    const efforts = [
      effort({ date: '2026-01-05T10:00:00Z', avg_pace_seconds_per_km: 300 }),
      effort({ date: '2026-01-12T10:00:00Z', avg_pace_seconds_per_km: 340 }),
    ];
    const trend = computeCardioTrend('running', efforts);
    expect(trend.pace_trend).toBe('decreasing');
  });

  it('handles empty input', () => {
    const trend = computeCardioTrend('running', []);
    expect(trend.weekly).toHaveLength(0);
    expect(trend.pace_trend).toBe('stable');
    expect(trend.best_pace_seconds_per_km).toBeNull();
  });

  it('handles a single effort as stable', () => {
    const trend = computeCardioTrend('running', [effort()]);
    expect(trend.weekly).toHaveLength(1);
    expect(trend.pace_trend).toBe('stable');
  });

  it('filters out other activity types', () => {
    const efforts = [
      effort({ activity_type: 'running', date: '2026-01-05T10:00:00Z' }),
      effort({ activity_type: 'cycling', date: '2026-01-12T10:00:00Z' }),
    ];
    const trend = computeCardioTrend('running', efforts);
    expect(trend.weekly).toHaveLength(1);
  });
});

describe('distanceBucketLabel', () => {
  it('assigns short runs to the first bucket', () => {
    expect(distanceBucketLabel(3000)).toBe('0-5km');
  });

  it('assigns mid runs to the 5-10 bucket', () => {
    expect(distanceBucketLabel(8000)).toBe('5-10km');
  });

  it('assigns long runs to the open-ended bucket', () => {
    expect(distanceBucketLabel(30000)).toBe('21.1km+');
  });
});

describe('computeDistanceBuckets', () => {
  it('groups efforts and computes avg/best pace per bucket', () => {
    const efforts = [
      effort({ distance_meters: 3000, avg_pace_seconds_per_km: 320 }),
      effort({ distance_meters: 4000, avg_pace_seconds_per_km: 300 }),
      effort({ distance_meters: 9000, avg_pace_seconds_per_km: 340 }),
    ];
    const buckets = computeDistanceBuckets(efforts);
    const short = buckets.find((b) => b.bucket === '0-5km')!;
    expect(short.efforts).toBe(2);
    expect(short.avg_pace_seconds_per_km).toBe(310);
    expect(short.best_pace_seconds_per_km).toBe(300);
  });
});

describe('computeCardioLoad', () => {
  it('aggregates weekly distance and duration', () => {
    const efforts = [
      effort({ date: '2026-01-05T10:00:00Z', distance_meters: 5000, duration_seconds: 1500 }), // W02: 5000
      effort({ date: '2026-01-12T10:00:00Z', distance_meters: 5000, duration_seconds: 1500 }), // W03
      effort({ date: '2026-01-13T10:00:00Z', distance_meters: 10000, duration_seconds: 3000 }), // W03 → 15000
    ];
    const load = computeCardioLoad(efforts);
    expect(load.weekly).toHaveLength(2);
    expect(load.total_distance_meters).toBe(20000);
    expect(load.total_duration_seconds).toBe(6000);
    expect(load.distance_trend).toBe('increasing');
  });

  it('handles empty input', () => {
    const load = computeCardioLoad([]);
    expect(load.total_distance_meters).toBe(0);
    expect(load.distance_trend).toBe('stable');
  });
});
