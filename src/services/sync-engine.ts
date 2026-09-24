/**
 * Sync Engine Service
 *
 * Transmits pending WAL entries to Supabase with:
 * - Last-write-wins conflict resolution (client_timestamp vs server updated_at)
 * - Exponential backoff retry (1s → 2s → 4s → 8s → 16s, max 5 attempts)
 * - Connectivity-aware flushing (triggers on reconnect)
 * - Concurrent entry processing for 30-second completion target
 *
 * Requirements: 4.2, 4.3, 4.5, 4.7
 */
import { getWAL, type WALEntry } from '@/services/wal';
import { supabase } from '@/utils/supabase';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SyncEngineConfig {
  /** Maximum entries per flush batch (default: 20) */
  batchSize?: number;
  /** Maximum retry attempts before marking as failed (default: 5) */
  maxAttempts?: number;
  /** Base retry delay in milliseconds (default: 1000) */
  baseRetryMs?: number;
  /** Concurrency limit for parallel entry transmission (default: 5) */
  concurrency?: number;
}

export type ConflictResolution = 'local' | 'server';

export interface TransmitResult {
  success: boolean;
  error?: string;
}

// ─── Sync Engine ─────────────────────────────────────────────────────────────

export class SyncEngine {
  private isFlushing = false;
  private config: Required<SyncEngineConfig>;

  constructor(config?: SyncEngineConfig) {
    this.config = {
      batchSize: config?.batchSize ?? 20,
      maxAttempts: config?.maxAttempts ?? 5,
      baseRetryMs: config?.baseRetryMs ?? 1000,
      concurrency: config?.concurrency ?? 5,
    };
  }

  /**
   * Flush pending WAL entries to Supabase.
   *
   * Idempotent — concurrent calls are guarded by the isFlushing flag.
   * Processes entries in batches, transmitting concurrently within each batch
   * for faster completion (targeting <30s for all queued entries on reconnect).
   */
  async flush(): Promise<void> {
    if (this.isFlushing) return;
    this.isFlushing = true;

    try {
      const wal = getWAL();

      // Process entries in batches until no pending entries remain
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const pending = wal.getPending(this.config.batchSize);
        if (pending.length === 0) break;

        // Mark batch as syncing
        const ids = pending.map((e) => e.id);
        wal.markSyncing(ids);

        // Transmit entries concurrently (bounded by concurrency limit)
        const results = await this.transmitBatch(pending);

        // Process results
        const synced: string[] = [];
        const failed: string[] = [];

        for (let i = 0; i < pending.length; i++) {
          const entry = pending[i];
          const result = results[i];

          if (result.success) {
            synced.push(entry.id);
          } else {
            // Check if entry has exceeded max attempts
            const nextAttemptCount = entry.attempt_count + 1;
            if (nextAttemptCount >= this.config.maxAttempts) {
              failed.push(entry.id);
            } else {
              failed.push(entry.id);
            }
          }
        }

        if (synced.length > 0) wal.markSynced(synced);
        if (failed.length > 0) wal.markFailed(failed);
      }
    } finally {
      this.isFlushing = false;
    }
  }

  /**
   * Transmit a batch of entries concurrently, respecting the concurrency limit.
   */
  private async transmitBatch(entries: WALEntry[]): Promise<TransmitResult[]> {
    const results: TransmitResult[] = new Array(entries.length);
    let index = 0;

    const worker = async () => {
      while (index < entries.length) {
        const currentIndex = index++;
        results[currentIndex] = await this.transmitEntry(entries[currentIndex]);
      }
    };

    // Launch workers up to concurrency limit
    const workers = Array.from(
      { length: Math.min(this.config.concurrency, entries.length) },
      () => worker()
    );
    await Promise.all(workers);

    return results;
  }

  /**
   * Transmit a single WAL entry to Supabase.
   *
   * For INSERT/UPDATE: checks for conflicts via last-write-wins, then upserts.
   * (Program archive/hide replay here as partial-column updates on the
   * `programs` row — e.g. `{ status: 'archived' }` or `{ hidden: true }`.)
   * For DELETE: removes the record from Supabase (program purge hard-deletes
   * the `programs` row; RLS scopes both update and delete to the owner).
   */
  async transmitEntry(entry: WALEntry): Promise<TransmitResult> {
    try {
      const payload = JSON.parse(entry.payload) as Record<string, unknown>;
      const tableName = entry.table_name;
      const recordId = entry.record_id;

      // Determine the operation based on the WAL entry
      const operation = this.mapWALOperationToDBOperation(entry.operation);

      if (operation === 'DELETE') {
        const { error } = await supabase
          .from(tableName)
          .delete()
          .eq('id', recordId);

        if (error) {
          return { success: false, error: error.message };
        }
        return { success: true };
      }

      // For INSERT and UPDATE, check for conflicts first
      const conflictResult = await this.checkConflict(tableName, recordId, entry.client_timestamp);

      if (conflictResult === 'server') {
        // Server has newer data — discard local write, mark as synced
        return { success: true };
      }

      // Local wins — upsert the data
      const upsertData = {
        id: recordId,
        ...payload,
        updated_at: entry.client_timestamp,
      };

      const { error } = await supabase
        .from(tableName)
        .upsert(upsertData, { onConflict: 'id' });

      if (error) {
        return { success: false, error: error.message };
      }

      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown transmission error';
      return { success: false, error: message };
    }
  }

  /**
   * Resolve conflict between local and server data using last-write-wins.
   *
   * Fetches the current server record's updated_at timestamp and compares
   * with the client_timestamp from the WAL entry.
   *
   * - If local timestamp is newer → 'local' (apply local write)
   * - If server timestamp is newer or equal → 'server' (discard local write)
   * - If no server record exists → 'local' (new record, insert it)
   */
  async checkConflict(
    tableName: string,
    recordId: string,
    clientTimestamp: string
  ): Promise<ConflictResolution> {
    const { data, error } = await supabase
      .from(tableName)
      .select('updated_at')
      .eq('id', recordId)
      .maybeSingle();

    // If error fetching or no record exists, local wins (new record)
    if (error || !data) {
      return 'local';
    }

    return this.resolveConflict(clientTimestamp, data.updated_at as string);
  }

  /**
   * Compare client timestamp vs server updated_at to determine winner.
   *
   * @param clientTimestamp - ISO 8601 timestamp from the WAL entry
   * @param serverUpdatedAt - ISO 8601 timestamp from the server record
   * @returns 'local' if client is newer, 'server' if server is newer or equal
   */
  resolveConflict(clientTimestamp: string, serverUpdatedAt: string): ConflictResolution {
    const clientTime = new Date(clientTimestamp).getTime();
    const serverTime = new Date(serverUpdatedAt).getTime();

    if (clientTime > serverTime) {
      return 'local';
    }
    return 'server';
  }

  /**
   * Calculate the retry delay for a given attempt number using exponential backoff.
   *
   * Formula: baseRetryMs * 2^(attemptCount - 1)
   * - Attempt 1: 1000ms (1s)
   * - Attempt 2: 2000ms (2s)
   * - Attempt 3: 4000ms (4s)
   * - Attempt 4: 8000ms (8s)
   * - Attempt 5: 16000ms (16s)
   *
   * @param attemptCount - The current attempt number (1-based)
   * @returns Delay in milliseconds before the next retry
   */
  getRetryDelayMs(attemptCount: number): number {
    if (attemptCount < 1) return this.config.baseRetryMs;
    return this.config.baseRetryMs * Math.pow(2, attemptCount - 1);
  }

  /**
   * Handle connectivity change events.
   *
   * When connectivity is restored (isConnected = true), triggers an immediate
   * flush to transmit all pending WAL entries. This supports the requirement
   * to complete all queued entries within 30 seconds of connectivity restoration.
   *
   * @param isConnected - Whether the device now has network connectivity
   */
  onConnectivityChange(isConnected: boolean): void {
    if (isConnected) {
      // Trigger flush asynchronously — don't block the caller
      void this.flush();
    }
  }

  /**
   * Get the count of permanently failed entries.
   */
  async getFailedCount(): Promise<number> {
    const wal = getWAL();
    return wal.getFailedCount();
  }

  /**
   * Retry all permanently failed entries by resetting them to pending and flushing.
   */
  async retryFailed(): Promise<void> {
    const wal = getWAL();
    wal.retryFailed();
    await this.flush();
  }

  /**
   * Map WAL operation types to database operation types.
   */
  private mapWALOperationToDBOperation(
    operation: string
  ): 'INSERT' | 'UPDATE' | 'DELETE' {
    switch (operation) {
      case 'session_start':
      case 'set_log':
      // Exercise instances are added to an already-synced program day.
      case 'program_day_item_insert':
        return 'INSERT';
      case 'set_edit':
      case 'session_complete':
      // Program archive/hide are partial column updates on the programs row.
      case 'program_archive':
      case 'program_hide':
      // Session edits and exercise-instance edits are partial column updates.
      case 'session_update':
      case 'program_day_item_update':
        return 'UPDATE';
      // session_soft_delete sets sessions.deleted_at — an UPDATE, never a hard
      // DELETE, so logged_sets survive (Requirement 4.12).
      case 'session_soft_delete':
        return 'UPDATE';
      case 'set_delete':
      // Purge is a hard delete of the programs row (history preserved by the
      // ON DELETE SET NULL FK on sessions.program_day_id — see program-manager).
      case 'program_purge':
      // Removing an exercise instance is a hard delete of the program_day_items
      // row; logged_sets reference exercises + sessions, not the item, so
      // history is inherently preserved (Requirement 4.12).
      case 'program_day_item_delete':
        return 'DELETE';
      default:
        return 'INSERT';
    }
  }

  /**
   * Check whether the engine is currently flushing.
   * Useful for UI indicators and testing.
   */
  getIsFlushing(): boolean {
    return this.isFlushing;
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let syncEngineInstance: SyncEngine | null = null;

/**
 * Initialize the Sync Engine. Should be called during app startup after initWAL().
 */
export function initSyncEngine(config?: SyncEngineConfig): SyncEngine {
  if (syncEngineInstance) {
    return syncEngineInstance;
  }

  syncEngineInstance = new SyncEngine(config);
  return syncEngineInstance;
}

/**
 * Get the singleton Sync Engine instance.
 * @throws Error if initSyncEngine() has not been called
 */
export function getSyncEngine(): SyncEngine {
  if (!syncEngineInstance) {
    throw new Error(
      'SyncEngine not initialized. Call initSyncEngine() during app startup.'
    );
  }
  return syncEngineInstance;
}

/**
 * Reset the Sync Engine singleton (for testing purposes).
 */
export function resetSyncEngine(): void {
  syncEngineInstance = null;
}
