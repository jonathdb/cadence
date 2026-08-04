/**
 * Health provider adapter service.
 * Platform-specific integration for HealthKit (iOS) and Health Connect (Android).
 * Implements the import pipeline: fetch from SDK → store in health_data_raw → normalize into domain tables.
 * Gracefully degrades if permissions are denied — all features work without health data.
 */
import { normalizeRecord } from '@/services/health/normalizer';
import type {
    HealthDataType,
    HealthProvider,
    RawHealthRecord,
} from '@/types/health';
import { supabase } from '@/utils/supabase';
import { Platform } from 'react-native';

// --- Types ---

export type PermissionStatus = 'granted' | 'denied' | 'not_determined' | 'unavailable';

export interface HealthPermissions {
  workouts: PermissionStatus;
  heartRate: PermissionStatus;
  sleep: PermissionStatus;
  activity: PermissionStatus;
}

export interface SyncResult {
  success: boolean;
  recordsSynced: number;
  recordsNormalized: number;
  errors: string[];
}

interface FetchedRecord {
  provider_record_id: string;
  data_type: HealthDataType;
  raw_payload: Record<string, unknown>;
  recorded_at: string;
}

// --- Platform Detection ---

/**
 * Returns the health provider for the current platform, or null if unsupported.
 */
export function getHealthProvider(): HealthProvider | null {
  if (Platform.OS === 'ios') return 'apple_healthkit';
  if (Platform.OS === 'android') return 'health_connect';
  return null;
}

/**
 * Checks whether a health provider is available on this device.
 */
export async function isHealthAvailable(): Promise<boolean> {
  const provider = getHealthProvider();
  if (!provider) return false;

  try {
    if (provider === 'apple_healthkit') {
      const HealthKit = await getHealthKitModule();
      if (!HealthKit) return false;
      return HealthKit.isHealthDataAvailable();
    }

    if (provider === 'health_connect') {
      const HC = await getHealthConnectModule();
      if (!HC) return false;
      const status = await HC.getSdkStatus();
      return status === HC.SdkAvailabilityStatus.SDK_AVAILABLE;
    }
  } catch {
    return false;
  }

  return false;
}

// --- Dynamic Module Loading ---
// These native modules are only available in Dev Client builds.
// We dynamically import to allow the service to compile in any environment.

type HealthKitModule = typeof import('@kingstinct/react-native-healthkit');
type HealthConnectModule = typeof import('react-native-health-connect');

async function getHealthKitModule(): Promise<HealthKitModule | null> {
  try {
    return await import('@kingstinct/react-native-healthkit');
  } catch {
    return null;
  }
}

async function getHealthConnectModule(): Promise<HealthConnectModule | null> {
  try {
    return await import('react-native-health-connect');
  } catch {
    return null;
  }
}

// --- Permission Requests ---

/**
 * Request minimum necessary health permissions.
 * Returns the resulting permission state for each category.
 * Gracefully returns 'unavailable' if the platform is not supported or module not loaded.
 */
export async function requestHealthPermissions(): Promise<HealthPermissions> {
  const unavailable: HealthPermissions = {
    workouts: 'unavailable',
    heartRate: 'unavailable',
    sleep: 'unavailable',
    activity: 'unavailable',
  };

  const provider = getHealthProvider();
  if (!provider) return unavailable;

  try {
    if (provider === 'apple_healthkit') {
      return await requestHealthKitPermissions();
    }
    if (provider === 'health_connect') {
      return await requestHealthConnectPermissions();
    }
  } catch {
    return unavailable;
  }

  return unavailable;
}

async function requestHealthKitPermissions(): Promise<HealthPermissions> {
  const HealthKit = await getHealthKitModule();
  if (!HealthKit) {
    return { workouts: 'unavailable', heartRate: 'unavailable', sleep: 'unavailable', activity: 'unavailable' };
  }

  // Request read-only access to minimum necessary data types.
  // In this package (v14), identifiers are string literals passed to requestAuthorization({ toRead }).
  try {
    await HealthKit.requestAuthorization({
      toRead: [
        'HKQuantityTypeIdentifierHeartRate',
        'HKQuantityTypeIdentifierRestingHeartRate',
        'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
        'HKQuantityTypeIdentifierStepCount',
        'HKQuantityTypeIdentifierActiveEnergyBurned',
        'HKQuantityTypeIdentifierVO2Max',
        'HKCategoryTypeIdentifierSleepAnalysis',
        'HKWorkoutTypeIdentifier',
      ] as any, // eslint-disable-line @typescript-eslint/no-explicit-any
    });
  } catch {
    return { workouts: 'denied', heartRate: 'denied', sleep: 'denied', activity: 'denied' };
  }

  // HealthKit doesn't expose per-type auth status for reads on iOS (privacy by design).
  // After requesting, we assume 'granted' — actual data availability is determined at query time.
  return {
    workouts: 'granted',
    heartRate: 'granted',
    sleep: 'granted',
    activity: 'granted',
  };
}

async function requestHealthConnectPermissions(): Promise<HealthPermissions> {
  const HC = await getHealthConnectModule();
  if (!HC) {
    return { workouts: 'unavailable', heartRate: 'unavailable', sleep: 'unavailable', activity: 'unavailable' };
  }

  // Initialize the SDK
  await HC.initialize();

  // Request minimum necessary permissions
  const permissions: { accessType: 'read'; recordType: string }[] = [
    { accessType: 'read', recordType: 'ExerciseSession' },
    { accessType: 'read', recordType: 'HeartRate' },
    { accessType: 'read', recordType: 'RestingHeartRate' },
    { accessType: 'read', recordType: 'HeartRateVariabilityRmssd' },
    { accessType: 'read', recordType: 'SleepSession' },
    { accessType: 'read', recordType: 'Steps' },
    { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
    { accessType: 'read', recordType: 'Vo2Max' },
    { accessType: 'read', recordType: 'Distance' },
  ];

  try {
    const granted = await HC.requestPermission(permissions as any);

    const hasWorkouts = granted.some((p: any) => p.recordType === 'ExerciseSession');
    const hasHeartRate = granted.some((p: any) => p.recordType === 'HeartRate');
    const hasSleep = granted.some((p: any) => p.recordType === 'SleepSession');
    const hasActivity = granted.some((p: any) => p.recordType === 'Steps');

    return {
      workouts: hasWorkouts ? 'granted' : 'denied',
      heartRate: hasHeartRate ? 'granted' : 'denied',
      sleep: hasSleep ? 'granted' : 'denied',
      activity: hasActivity ? 'granted' : 'denied',
    };
  } catch {
    return { workouts: 'denied', heartRate: 'denied', sleep: 'denied', activity: 'denied' };
  }
}

// --- Helper ---

function dateToISOString(d: Date | string): string {
  if (typeof d === 'string') return d;
  return d.toISOString();
}

// --- Data Fetch Functions ---

/**
 * Fetch workouts from the native health SDK.
 * Returns raw records ready for storage in health_data_raw.
 */
async function fetchWorkouts(provider: HealthProvider, since: Date): Promise<FetchedRecord[]> {
  const records: FetchedRecord[] = [];

  try {
    if (provider === 'apple_healthkit') {
      const HealthKit = await getHealthKitModule();
      if (!HealthKit) return records;

      const workouts = await HealthKit.queryWorkoutSamples({
        limit: 0, // 0 = no limit (all)
        filter: { date: { startDate: since, endDate: new Date() } },
      });

      for (const w of workouts) {
        records.push({
          provider_record_id: w.uuid,
          data_type: 'workout',
          raw_payload: w as unknown as Record<string, unknown>,
          recorded_at: dateToISOString(w.startDate),
        });
      }
    }

    if (provider === 'health_connect') {
      const HC = await getHealthConnectModule();
      if (!HC) return records;

      const result = await HC.readRecords('ExerciseSession', {
        timeRangeFilter: {
          operator: 'between',
          startTime: since.toISOString(),
          endTime: new Date().toISOString(),
        },
      });

      for (const session of result.records) {
        records.push({
          provider_record_id: (session as any).metadata?.id ?? `hc_${Date.now()}_${Math.random()}`,
          data_type: 'workout',
          raw_payload: session as unknown as Record<string, unknown>,
          recorded_at: (session as any).startTime,
        });
      }
    }
  } catch {
    // Graceful degradation: return whatever we have so far
  }

  return records;
}

/**
 * Fetch heart rate data from the native health SDK.
 */
async function fetchHeartRate(provider: HealthProvider, since: Date): Promise<FetchedRecord[]> {
  const records: FetchedRecord[] = [];

  try {
    if (provider === 'apple_healthkit') {
      const HealthKit = await getHealthKitModule();
      if (!HealthKit) return records;

      const queryOpts = {
        limit: 0,
        filter: { date: { startDate: since, endDate: new Date() } },
      };

      const hrSamples = await HealthKit.queryQuantitySamples('HKQuantityTypeIdentifierHeartRate', queryOpts);
      const restingHr = await HealthKit.queryQuantitySamples('HKQuantityTypeIdentifierRestingHeartRate', queryOpts);

      // Aggregate into daily summaries
      const dailyMap = new Map<string, { resting?: number; samples: number[]; date: string }>();

      for (const sample of hrSamples) {
        const date = dateToISOString(sample.startDate).split('T')[0];
        if (!dailyMap.has(date)) dailyMap.set(date, { samples: [], date });
        dailyMap.get(date)!.samples.push(sample.quantity);
      }

      for (const sample of restingHr) {
        const date = dateToISOString(sample.startDate).split('T')[0];
        if (!dailyMap.has(date)) dailyMap.set(date, { samples: [], date });
        dailyMap.get(date)!.resting = sample.quantity;
      }

      for (const [date, data] of dailyMap) {
        const avg = data.samples.length > 0
          ? Math.round(data.samples.reduce((a, b) => a + b, 0) / data.samples.length)
          : undefined;
        const max = data.samples.length > 0 ? Math.max(...data.samples) : undefined;

        records.push({
          provider_record_id: `hr_${date}`,
          data_type: 'heart_rate',
          raw_payload: { date, restingHeartRate: data.resting, averageHeartRate: avg, maxHeartRate: max },
          recorded_at: `${date}T00:00:00.000Z`,
        });
      }
    }

    if (provider === 'health_connect') {
      const HC = await getHealthConnectModule();
      if (!HC) return records;

      const timeFilter = {
        timeRangeFilter: {
          operator: 'between' as const,
          startTime: since.toISOString(),
          endTime: new Date().toISOString(),
        },
      };

      const hrResult = await HC.readRecords('HeartRate', timeFilter);
      const restingResult = await HC.readRecords('RestingHeartRate', timeFilter);

      // Aggregate into daily summaries
      const dailyMap = new Map<string, { resting?: number; samples: number[]; date: string }>();

      for (const record of hrResult.records) {
        const date = (record as any).startTime.split('T')[0];
        if (!dailyMap.has(date)) dailyMap.set(date, { samples: [], date });
        const samples = (record as any).samples;
        if (Array.isArray(samples)) {
          for (const s of samples) {
            if (s.beatsPerMinute) dailyMap.get(date)!.samples.push(s.beatsPerMinute);
          }
        }
      }

      for (const record of restingResult.records) {
        const date = (record as any).time?.split('T')[0] ?? (record as any).startTime?.split('T')[0];
        if (date && !dailyMap.has(date)) dailyMap.set(date, { samples: [], date });
        const bpm = (record as any).beatsPerMinute;
        if (bpm && date) dailyMap.get(date)!.resting = bpm;
      }

      for (const [date, data] of dailyMap) {
        const avg = data.samples.length > 0
          ? Math.round(data.samples.reduce((a, b) => a + b, 0) / data.samples.length)
          : undefined;
        const max = data.samples.length > 0 ? Math.max(...data.samples) : undefined;

        records.push({
          provider_record_id: `hr_${date}`,
          data_type: 'heart_rate',
          raw_payload: { date, restingHeartRate: data.resting, averageHeartRate: avg, maxHeartRate: max },
          recorded_at: `${date}T00:00:00.000Z`,
        });
      }
    }
  } catch {
    // Graceful degradation
  }

  return records;
}

/**
 * Fetch sleep data from the native health SDK.
 */
async function fetchSleep(provider: HealthProvider, since: Date): Promise<FetchedRecord[]> {
  const records: FetchedRecord[] = [];

  try {
    if (provider === 'apple_healthkit') {
      const HealthKit = await getHealthKitModule();
      if (!HealthKit) return records;

      const sleepSamples = await HealthKit.queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', {
        limit: 0,
        filter: { date: { startDate: since, endDate: new Date() } },
      });

      // Group sleep samples by date and aggregate
      const dailyMap = new Map<string, { totalMinutes: number; deep: number; light: number; rem: number; awake: number }>();

      for (const sample of sleepSamples) {
        const date = dateToISOString(sample.startDate).split('T')[0];
        if (!dailyMap.has(date)) dailyMap.set(date, { totalMinutes: 0, deep: 0, light: 0, rem: 0, awake: 0 });
        const entry = dailyMap.get(date)!;

        const start = new Date(sample.startDate).getTime();
        const end = new Date(sample.endDate).getTime();
        const durationMin = Math.round((end - start) / 60000);

        // HealthKit sleep value categories
        const value = sample.value;
        switch (value) {
          case 3: // asleepDeep
            entry.deep += durationMin;
            entry.totalMinutes += durationMin;
            break;
          case 4: // asleepCore (light)
            entry.light += durationMin;
            entry.totalMinutes += durationMin;
            break;
          case 5: // asleepREM
            entry.rem += durationMin;
            entry.totalMinutes += durationMin;
            break;
          case 2: // awake
            entry.awake += durationMin;
            break;
          default: // inBed or unspecified asleep
            entry.totalMinutes += durationMin;
        }
      }

      for (const [date, data] of dailyMap) {
        records.push({
          provider_record_id: `sleep_${date}`,
          data_type: 'sleep',
          raw_payload: {
            date,
            total_duration_minutes: data.totalMinutes,
            deep_minutes: data.deep || undefined,
            light_minutes: data.light || undefined,
            rem_minutes: data.rem || undefined,
            awake_minutes: data.awake || undefined,
          },
          recorded_at: `${date}T00:00:00.000Z`,
        });
      }
    }

    if (provider === 'health_connect') {
      const HC = await getHealthConnectModule();
      if (!HC) return records;

      const result = await HC.readRecords('SleepSession', {
        timeRangeFilter: {
          operator: 'between',
          startTime: since.toISOString(),
          endTime: new Date().toISOString(),
        },
      });

      for (const session of result.records) {
        const startTime = (session as any).startTime as string;
        const endTime = (session as any).endTime as string;
        const date = startTime.split('T')[0];
        const start = new Date(startTime).getTime();
        const end = new Date(endTime).getTime();
        const totalMinutes = Math.round((end - start) / 60000);

        // Health Connect sleep stages
        const stages: { stage: number; startTime: string; endTime: string }[] = (session as any).stages ?? [];
        let deep = 0, light = 0, rem = 0, awake = 0;

        for (const stage of stages) {
          const sStart = new Date(stage.startTime).getTime();
          const sEnd = new Date(stage.endTime).getTime();
          const min = Math.round((sEnd - sStart) / 60000);
          switch (stage.stage) {
            case 4: deep += min; break;
            case 5: light += min; break;
            case 6: rem += min; break;
            case 1: awake += min; break;
          }
        }

        records.push({
          provider_record_id: (session as any).metadata?.id ?? `sleep_${date}`,
          data_type: 'sleep',
          raw_payload: {
            date,
            total_duration_minutes: totalMinutes,
            deep_minutes: deep || undefined,
            light_minutes: light || undefined,
            rem_minutes: rem || undefined,
            awake_minutes: awake || undefined,
          },
          recorded_at: `${date}T00:00:00.000Z`,
        });
      }
    }
  } catch {
    // Graceful degradation
  }

  return records;
}

/**
 * Fetch activity data (steps, calories, HRV, VO2 max) from the native health SDK.
 */
async function fetchActivity(provider: HealthProvider, since: Date): Promise<FetchedRecord[]> {
  const records: FetchedRecord[] = [];

  try {
    if (provider === 'apple_healthkit') {
      const HealthKit = await getHealthKitModule();
      if (!HealthKit) return records;

      const queryOpts = {
        limit: 0,
        filter: { date: { startDate: since, endDate: new Date() } },
      };

      const [steps, calories, hrv, vo2] = await Promise.all([
        HealthKit.queryQuantitySamples('HKQuantityTypeIdentifierStepCount', queryOpts).catch(() => [] as any[]),
        HealthKit.queryQuantitySamples('HKQuantityTypeIdentifierActiveEnergyBurned', queryOpts).catch(() => [] as any[]),
        HealthKit.queryQuantitySamples('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', queryOpts).catch(() => [] as any[]),
        HealthKit.queryQuantitySamples('HKQuantityTypeIdentifierVO2Max', queryOpts).catch(() => [] as any[]),
      ]);

      // Aggregate by date
      const dailyMap = new Map<string, { steps: number; calories: number; hrv?: number; vo2?: number }>();

      for (const s of steps) {
        const date = dateToISOString(s.startDate).split('T')[0];
        if (!dailyMap.has(date)) dailyMap.set(date, { steps: 0, calories: 0 });
        dailyMap.get(date)!.steps += s.quantity;
      }

      for (const c of calories) {
        const date = dateToISOString(c.startDate).split('T')[0];
        if (!dailyMap.has(date)) dailyMap.set(date, { steps: 0, calories: 0 });
        dailyMap.get(date)!.calories += c.quantity;
      }

      for (const h of hrv) {
        const date = dateToISOString(h.startDate).split('T')[0];
        if (!dailyMap.has(date)) dailyMap.set(date, { steps: 0, calories: 0 });
        dailyMap.get(date)!.hrv = h.quantity;
      }

      for (const v of vo2) {
        const date = dateToISOString(v.startDate).split('T')[0];
        if (!dailyMap.has(date)) dailyMap.set(date, { steps: 0, calories: 0 });
        dailyMap.get(date)!.vo2 = v.quantity;
      }

      for (const [date, data] of dailyMap) {
        records.push({
          provider_record_id: `activity_${date}`,
          data_type: 'activity',
          raw_payload: {
            date,
            steps: data.steps || undefined,
            activeEnergyBurned: data.calories || undefined,
            heartRateVariability: data.hrv,
            vo2Max: data.vo2,
          },
          recorded_at: `${date}T00:00:00.000Z`,
        });
      }
    }

    if (provider === 'health_connect') {
      const HC = await getHealthConnectModule();
      if (!HC) return records;

      const timeFilter = {
        timeRangeFilter: {
          operator: 'between' as const,
          startTime: since.toISOString(),
          endTime: new Date().toISOString(),
        },
      };

      const [stepsResult, caloriesResult, vo2Result, hrvResult] = await Promise.all([
        HC.readRecords('Steps', timeFilter).catch(() => ({ records: [] as any[] })),
        HC.readRecords('ActiveCaloriesBurned', timeFilter).catch(() => ({ records: [] as any[] })),
        HC.readRecords('Vo2Max', timeFilter).catch(() => ({ records: [] as any[] })),
        HC.readRecords('HeartRateVariabilityRmssd', timeFilter).catch(() => ({ records: [] as any[] })),
      ]);

      const dailyMap = new Map<string, { steps: number; calories: number; hrv?: number; vo2?: number }>();

      for (const r of stepsResult.records) {
        const date = ((r as any).startTime as string).split('T')[0];
        if (!dailyMap.has(date)) dailyMap.set(date, { steps: 0, calories: 0 });
        const count = (r as any).count;
        if (count) dailyMap.get(date)!.steps += count;
      }

      for (const r of caloriesResult.records) {
        const date = ((r as any).startTime as string).split('T')[0];
        if (!dailyMap.has(date)) dailyMap.set(date, { steps: 0, calories: 0 });
        const energy = (r as any).energy;
        if (energy?.inKilocalories) dailyMap.get(date)!.calories += energy.inKilocalories;
      }

      for (const r of vo2Result.records) {
        const date = ((r as any).time as string)?.split('T')[0] ?? ((r as any).startTime as string)?.split('T')[0];
        if (date) {
          if (!dailyMap.has(date)) dailyMap.set(date, { steps: 0, calories: 0 });
          const vo2 = (r as any).vo2MillilitersPerMinuteKilogram;
          if (vo2) dailyMap.get(date)!.vo2 = vo2;
        }
      }

      for (const r of hrvResult.records) {
        const date = ((r as any).time as string)?.split('T')[0] ?? ((r as any).startTime as string)?.split('T')[0];
        if (date) {
          if (!dailyMap.has(date)) dailyMap.set(date, { steps: 0, calories: 0 });
          const hrv = (r as any).heartRateVariabilityMillis;
          if (hrv) dailyMap.get(date)!.hrv = hrv;
        }
      }

      for (const [date, data] of dailyMap) {
        records.push({
          provider_record_id: `activity_${date}`,
          data_type: 'activity',
          raw_payload: {
            date,
            steps: data.steps || undefined,
            activeEnergyBurned: data.calories || undefined,
            heartRateVariability: data.hrv,
            vo2Max: data.vo2,
          },
          recorded_at: `${date}T00:00:00.000Z`,
        });
      }
    }
  } catch {
    // Graceful degradation
  }

  return records;
}

// --- Import Pipeline ---

/**
 * Store raw records in health_data_raw table (ingestion layer).
 * Uses upsert on provider + provider_record_id to avoid duplicates.
 */
async function storeRawRecords(
  userId: string,
  provider: HealthProvider,
  fetchedRecords: FetchedRecord[]
): Promise<RawHealthRecord[]> {
  if (fetchedRecords.length === 0) return [];

  const rows = fetchedRecords.map((r) => ({
    user_id: userId,
    provider,
    provider_record_id: r.provider_record_id,
    data_type: r.data_type,
    raw_payload: r.raw_payload,
    recorded_at: r.recorded_at,
    synced_at: new Date().toISOString(),
    sync_status: 'synced' as const,
  }));

  const { data, error } = await supabase
    .from('health_data_raw')
    .upsert(rows as any, { onConflict: 'user_id,provider,provider_record_id' })
    .select();

  if (error) {
    throw new Error(`Failed to store raw records: ${error.message}`);
  }

  return (data ?? []) as unknown as RawHealthRecord[];
}

/**
 * Normalize raw records and store in typed domain tables.
 * Uses the normalizer service to transform raw records.
 */
async function normalizeAndStore(rawRecords: RawHealthRecord[]): Promise<{ normalized: number; errors: string[] }> {
  let normalized = 0;
  const errors: string[] = [];

  // Group by data type for batch inserts
  const workouts: Record<string, unknown>[] = [];
  const sleep: Record<string, unknown>[] = [];
  const activity: Record<string, unknown>[] = [];
  const heartRate: Record<string, unknown>[] = [];

  for (const raw of rawRecords) {
    const result = normalizeRecord(raw);

    if (!result.success || !result.data) {
      errors.push(...result.errors.map((e: string) => `[${raw.data_type}:${raw.provider_record_id}] ${e}`));
      continue;
    }

    switch (raw.data_type) {
      case 'workout':
        workouts.push(result.data as Record<string, unknown>);
        break;
      case 'sleep':
        sleep.push(result.data as Record<string, unknown>);
        break;
      case 'activity':
        activity.push(result.data as Record<string, unknown>);
        break;
      case 'heart_rate':
        heartRate.push(result.data as Record<string, unknown>);
        break;
    }
  }

  // Batch upsert into domain tables
  if (workouts.length > 0) {
    const { error } = await supabase
      .from('imported_workouts')
      .upsert(workouts as any, { onConflict: 'user_id,provider,provider_record_id' });
    if (error) errors.push(`imported_workouts: ${error.message}`);
    else normalized += workouts.length;
  }

  if (sleep.length > 0) {
    const { error } = await supabase
      .from('imported_sleep_summaries')
      .upsert(sleep as any, { onConflict: 'user_id,provider,date' });
    if (error) errors.push(`imported_sleep_summaries: ${error.message}`);
    else normalized += sleep.length;
  }

  if (activity.length > 0) {
    const { error } = await supabase
      .from('imported_activity_snapshots')
      .upsert(activity as any, { onConflict: 'user_id,provider,date' });
    if (error) errors.push(`imported_activity_snapshots: ${error.message}`);
    else normalized += activity.length;
  }

  if (heartRate.length > 0) {
    const { error } = await supabase
      .from('imported_heart_rate_summaries')
      .upsert(heartRate as any, { onConflict: 'user_id,provider,date' });
    if (error) errors.push(`imported_heart_rate_summaries: ${error.message}`);
    else normalized += heartRate.length;
  }

  return { normalized, errors };
}

// --- Main Sync Function ---

/**
 * Coordinate a full health data import.
 * Pipeline: fetch from native SDK → store verbatim in health_data_raw → normalize into domain tables.
 *
 * Gracefully degrades at every step:
 * - If provider unavailable: returns success with 0 records
 * - If permissions denied: returns success with 0 records
 * - If individual fetch fails: continues with other data types
 * - If normalization fails for a record: logs error, continues with rest
 *
 * @param userId - The authenticated user's ID
 * @param since - How far back to fetch (defaults to 7 days)
 */
export async function syncHealthData(
  userId: string,
  since?: Date
): Promise<SyncResult> {
  const result: SyncResult = {
    success: true,
    recordsSynced: 0,
    recordsNormalized: 0,
    errors: [],
  };

  // 1. Check platform support
  const provider = getHealthProvider();
  if (!provider) {
    // Not on a supported platform — graceful degradation
    return result;
  }

  // 2. Check SDK availability
  const available = await isHealthAvailable();
  if (!available) {
    return result;
  }

  // 3. Default sync window: last 7 days
  const syncSince = since ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // 4. Fetch data from all categories (continue on individual failures)
  const allRecords: FetchedRecord[] = [];

  const [workouts, heartRateData, sleepData, activityData] = await Promise.allSettled([
    fetchWorkouts(provider, syncSince),
    fetchHeartRate(provider, syncSince),
    fetchSleep(provider, syncSince),
    fetchActivity(provider, syncSince),
  ]);

  if (workouts.status === 'fulfilled') allRecords.push(...workouts.value);
  else result.errors.push(`workout fetch failed: ${workouts.reason}`);

  if (heartRateData.status === 'fulfilled') allRecords.push(...heartRateData.value);
  else result.errors.push(`heart_rate fetch failed: ${heartRateData.reason}`);

  if (sleepData.status === 'fulfilled') allRecords.push(...sleepData.value);
  else result.errors.push(`sleep fetch failed: ${sleepData.reason}`);

  if (activityData.status === 'fulfilled') allRecords.push(...activityData.value);
  else result.errors.push(`activity fetch failed: ${activityData.reason}`);

  if (allRecords.length === 0) {
    // No records fetched — could be permissions denied or no data available.
    // This is a graceful success, not a failure.
    return result;
  }

  // 5. Store raw records in health_data_raw (ingestion layer)
  let rawRecords: RawHealthRecord[] = [];
  try {
    rawRecords = await storeRawRecords(userId, provider, allRecords);
    result.recordsSynced = rawRecords.length;
  } catch (err) {
    result.success = false;
    result.errors.push(err instanceof Error ? err.message : 'Failed to store raw records');
    return result;
  }

  // 6. Normalize into typed domain tables
  try {
    const normResult = await normalizeAndStore(rawRecords);
    result.recordsNormalized = normResult.normalized;
    result.errors.push(...normResult.errors);
  } catch (err) {
    // Normalization failure is non-fatal — raw records are safely stored
    result.errors.push(err instanceof Error ? err.message : 'Normalization failed');
  }

  return result;
}

/**
 * Get the current health connection status for UI display.
 */
export async function getHealthConnectionStatus(): Promise<{
  connected: boolean;
  provider: HealthProvider | null;
  permissions: HealthPermissions;
}> {
  const provider = getHealthProvider();
  if (!provider) {
    return {
      connected: false,
      provider: null,
      permissions: { workouts: 'unavailable', heartRate: 'unavailable', sleep: 'unavailable', activity: 'unavailable' },
    };
  }

  const available = await isHealthAvailable();
  if (!available) {
    return {
      connected: false,
      provider,
      permissions: { workouts: 'unavailable', heartRate: 'unavailable', sleep: 'unavailable', activity: 'unavailable' },
    };
  }

  return {
    connected: true,
    provider,
    // Actual permission status is best-effort on iOS (always returns granted after request)
    permissions: { workouts: 'not_determined', heartRate: 'not_determined', sleep: 'not_determined', activity: 'not_determined' },
  };
}
