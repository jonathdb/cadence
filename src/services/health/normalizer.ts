/**
 * Health data normalizer service.
 * Transforms raw HealthKit/Health Connect records into typed domain models.
 * Never throws — always returns a NormalizationResult.
 */
import type {
    HealthDataType,
    ImportedActivitySnapshot,
    ImportedHeartRateSummary,
    ImportedSleepSummary,
    ImportedWorkout,
    RawHealthRecord
} from '@/types/health';

export interface NormalizationResult<T> {
  success: boolean;
  data: T | null;
  errors: string[];
}

// --- Utility helpers ---

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

// --- Normalizer functions ---

/**
 * Normalize a raw workout record into an ImportedWorkout (without id).
 * Handles both HealthKit and Health Connect payload shapes.
 */
export function normalizeWorkout(
  raw: RawHealthRecord
): NormalizationResult<Omit<ImportedWorkout, 'id'>> {
  const errors: string[] = [];
  const payload = raw.raw_payload;

  // Extract workout_type — HealthKit uses workoutActivityType, Health Connect uses exerciseType
  const workoutType =
    toStringOrNull(payload.workoutActivityType) ??
    toStringOrNull(payload.exerciseType) ??
    toStringOrNull(payload.workout_type);

  if (!workoutType) {
    errors.push('Missing required field: workout_type');
    return { success: false, data: null, errors };
  }

  // Extract start_time — HealthKit: startDate, Health Connect: startTime
  const startTime =
    toStringOrNull(payload.startDate) ??
    toStringOrNull(payload.startTime) ??
    toStringOrNull(payload.start_time);

  if (!startTime) {
    errors.push('Missing required field: start_time');
    return { success: false, data: null, errors };
  }

  // Extract end_time — HealthKit: endDate, Health Connect: endTime
  const endTime =
    toStringOrNull(payload.endDate) ??
    toStringOrNull(payload.endTime) ??
    toStringOrNull(payload.end_time);

  if (!endTime) {
    errors.push('Missing required field: end_time');
    return { success: false, data: null, errors };
  }

  // Extract duration — HealthKit: duration, Health Connect: calculate from times or use duration field
  let durationSeconds = toNumberOrNull(payload.duration) ?? toNumberOrNull(payload.duration_seconds);

  if (durationSeconds === null) {
    // Attempt to calculate from start/end times
    const start = new Date(startTime).getTime();
    const end = new Date(endTime).getTime();
    if (!isNaN(start) && !isNaN(end) && end > start) {
      durationSeconds = Math.round((end - start) / 1000);
    } else {
      errors.push('Missing required field: duration_seconds (could not calculate from times)');
      return { success: false, data: null, errors };
    }
  }

  // Optional fields
  const distanceMeters =
    toNumberOrNull(payload.totalDistance) ??
    toNumberOrNull(payload.distance_meters) ??
    toNumberOrNull(payload.distance);

  const averagePaceSecondsPerKm =
    toNumberOrNull(payload.averagePace) ??
    toNumberOrNull(payload.average_pace_seconds_per_km) ??
    toNumberOrNull(payload.avg_pace);

  const averageSpeedKmh =
    toNumberOrNull(payload.averageSpeed) ??
    toNumberOrNull(payload.average_speed_kmh) ??
    toNumberOrNull(payload.avg_speed);

  const elevationGainMeters =
    toNumberOrNull(payload.totalElevationGain) ??
    toNumberOrNull(payload.elevation_gain_meters) ??
    toNumberOrNull(payload.elevation_gain);

  // Route data (optional array of GeoPoints)
  let routeData: { latitude: number; longitude: number }[] | null = null;
  if (Array.isArray(payload.route) || Array.isArray(payload.route_data)) {
    const rawRoute = (payload.route ?? payload.route_data) as unknown[];
    const points: { latitude: number; longitude: number }[] = [];
    for (const point of rawRoute) {
      if (point && typeof point === 'object') {
        const p = point as Record<string, unknown>;
        const lat = toNumberOrNull(p.latitude ?? p.lat);
        const lng = toNumberOrNull(p.longitude ?? p.lng ?? p.lon);
        if (lat !== null && lng !== null) {
          points.push({ latitude: lat, longitude: lng });
        }
      }
    }
    if (points.length > 0) {
      routeData = points;
    }
  }

  const data: Omit<ImportedWorkout, 'id'> = {
    user_id: raw.user_id,
    raw_record_id: raw.id,
    provider: raw.provider,
    provider_record_id: raw.provider_record_id,
    workout_type: workoutType,
    start_time: startTime,
    end_time: endTime,
    duration_seconds: durationSeconds,
    distance_meters: distanceMeters ?? undefined,
    average_pace_seconds_per_km: averagePaceSecondsPerKm ?? undefined,
    average_speed_kmh: averageSpeedKmh ?? undefined,
    elevation_gain_meters: elevationGainMeters ?? undefined,
    route_data: routeData ?? undefined,
    synced_at: raw.synced_at,
  };

  return { success: true, data, errors };
}

/**
 * Normalize a raw sleep record into an ImportedSleepSummary (without id).
 */
export function normalizeSleep(
  raw: RawHealthRecord
): NormalizationResult<Omit<ImportedSleepSummary, 'id'>> {
  const errors: string[] = [];
  const payload = raw.raw_payload;

  // Extract date
  const date =
    toStringOrNull(payload.date) ??
    toStringOrNull(payload.startDate) ??
    toStringOrNull(payload.startTime);

  if (!date) {
    errors.push('Missing required field: date');
    return { success: false, data: null, errors };
  }

  // Extract total duration — HealthKit may use value (in minutes), Health Connect may use totalDuration
  const totalDurationMinutes =
    toNumberOrNull(payload.total_duration_minutes) ??
    toNumberOrNull(payload.totalDuration) ??
    toNumberOrNull(payload.value) ??
    toNumberOrNull(payload.duration_minutes);

  if (totalDurationMinutes === null) {
    errors.push('Missing required field: total_duration_minutes');
    return { success: false, data: null, errors };
  }

  // Optional sleep stage fields
  const deepMinutes =
    toNumberOrNull(payload.deep_minutes) ??
    toNumberOrNull(payload.deepSleep) ??
    toNumberOrNull(payload.deep);

  const lightMinutes =
    toNumberOrNull(payload.light_minutes) ??
    toNumberOrNull(payload.lightSleep) ??
    toNumberOrNull(payload.light);

  const remMinutes =
    toNumberOrNull(payload.rem_minutes) ??
    toNumberOrNull(payload.remSleep) ??
    toNumberOrNull(payload.rem);

  const awakeMinutes =
    toNumberOrNull(payload.awake_minutes) ??
    toNumberOrNull(payload.awake) ??
    toNumberOrNull(payload.awakeDuration);

  const data: Omit<ImportedSleepSummary, 'id'> = {
    user_id: raw.user_id,
    raw_record_id: raw.id,
    provider: raw.provider,
    date: date.split('T')[0], // Normalize to date string (YYYY-MM-DD)
    total_duration_minutes: totalDurationMinutes,
    deep_minutes: deepMinutes ?? undefined,
    light_minutes: lightMinutes ?? undefined,
    rem_minutes: remMinutes ?? undefined,
    awake_minutes: awakeMinutes ?? undefined,
    synced_at: raw.synced_at,
  };

  return { success: true, data, errors };
}

/**
 * Normalize a raw activity record into an ImportedActivitySnapshot (without id).
 */
export function normalizeActivity(
  raw: RawHealthRecord
): NormalizationResult<Omit<ImportedActivitySnapshot, 'id'>> {
  const errors: string[] = [];
  const payload = raw.raw_payload;

  // Extract date
  const date =
    toStringOrNull(payload.date) ??
    toStringOrNull(payload.startDate) ??
    toStringOrNull(payload.startTime);

  if (!date) {
    errors.push('Missing required field: date');
    return { success: false, data: null, errors };
  }

  // All fields are optional for activity snapshots — at least one should be present
  const steps = toNumberOrNull(payload.steps) ?? toNumberOrNull(payload.stepCount);
  const activeCalories =
    toNumberOrNull(payload.active_calories) ??
    toNumberOrNull(payload.activeEnergyBurned) ??
    toNumberOrNull(payload.calories);
  const hrvMs =
    toNumberOrNull(payload.hrv_ms) ??
    toNumberOrNull(payload.heartRateVariability) ??
    toNumberOrNull(payload.hrv);
  const vo2Max =
    toNumberOrNull(payload.vo2_max) ??
    toNumberOrNull(payload.vo2Max) ??
    toNumberOrNull(payload.cardioFitness);

  // Warn if no activity data is present (but still succeed)
  if (steps === null && activeCalories === null && hrvMs === null && vo2Max === null) {
    errors.push('No activity data fields found in raw_payload');
  }

  const data: Omit<ImportedActivitySnapshot, 'id'> = {
    user_id: raw.user_id,
    raw_record_id: raw.id,
    provider: raw.provider,
    date: date.split('T')[0],
    steps: steps ?? undefined,
    active_calories: activeCalories ?? undefined,
    hrv_ms: hrvMs ?? undefined,
    vo2_max: vo2Max ?? undefined,
    synced_at: raw.synced_at,
  };

  return { success: true, data, errors };
}

/**
 * Normalize a raw heart rate record into an ImportedHeartRateSummary (without id).
 */
export function normalizeHeartRate(
  raw: RawHealthRecord
): NormalizationResult<Omit<ImportedHeartRateSummary, 'id'>> {
  const errors: string[] = [];
  const payload = raw.raw_payload;

  // Extract date
  const date =
    toStringOrNull(payload.date) ??
    toStringOrNull(payload.startDate) ??
    toStringOrNull(payload.startTime);

  if (!date) {
    errors.push('Missing required field: date');
    return { success: false, data: null, errors };
  }

  // All BPM fields are optional — at least one should be present
  const restingBpm =
    toNumberOrNull(payload.resting_bpm) ??
    toNumberOrNull(payload.restingHeartRate) ??
    toNumberOrNull(payload.resting);
  const averageBpm =
    toNumberOrNull(payload.average_bpm) ??
    toNumberOrNull(payload.averageHeartRate) ??
    toNumberOrNull(payload.average) ??
    toNumberOrNull(payload.avg_bpm);
  const maxBpm =
    toNumberOrNull(payload.max_bpm) ??
    toNumberOrNull(payload.maxHeartRate) ??
    toNumberOrNull(payload.max);

  if (restingBpm === null && averageBpm === null && maxBpm === null) {
    errors.push('No heart rate data fields found in raw_payload');
  }

  const data: Omit<ImportedHeartRateSummary, 'id'> = {
    user_id: raw.user_id,
    raw_record_id: raw.id,
    provider: raw.provider,
    date: date.split('T')[0],
    resting_bpm: restingBpm ?? undefined,
    average_bpm: averageBpm ?? undefined,
    max_bpm: maxBpm ?? undefined,
    synced_at: raw.synced_at,
  };

  return { success: true, data, errors };
}

/**
 * Dispatcher that routes to the correct normalizer based on data_type.
 */
export function normalizeRecord(raw: RawHealthRecord): NormalizationResult<unknown> {
  const normalizers: Record<HealthDataType, (r: RawHealthRecord) => NormalizationResult<unknown>> = {
    workout: normalizeWorkout,
    sleep: normalizeSleep,
    activity: normalizeActivity,
    heart_rate: normalizeHeartRate,
    body_metrics: (r) => ({
      success: true,
      data: {
        user_id: r.user_id,
        raw_record_id: r.id,
        provider: r.provider,
        provider_record_id: r.provider_record_id,
        raw_payload: r.raw_payload,
        synced_at: r.synced_at,
      },
      errors: ['body_metrics normalization is a passthrough — no typed model defined yet'],
    }),
  };

  const normalizer = normalizers[raw.data_type];

  if (!normalizer) {
    return {
      success: false,
      data: null,
      errors: [`Unsupported data_type: ${raw.data_type}`],
    };
  }

  return normalizer(raw);
}
