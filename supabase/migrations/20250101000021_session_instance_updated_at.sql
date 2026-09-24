-- Migration: add updated_at to sessions and program_day_items
--
-- Manual + agent edit/delete (spec app-experience-improvements, task 11.4)
-- syncs session and exercise-instance edits through the WAL sync engine's
-- generic last-write-wins conflict check (src/services/sync-engine.ts
-- checkConflict/resolveConflict), which compares the WAL entry's
-- client_timestamp against the target row's `updated_at` column. Neither
-- `sessions` nor `program_day_items` had this column, so conflict resolution
-- for session_update/session_soft_delete and program_day_item_update/insert/
-- delete WAL ops would always read undefined and incorrectly resolve to
-- "server wins", silently discarding legitimate offline edits.
--
-- Both columns default to now() and are nullable-safe (existing rows get the
-- migration-time timestamp); the sync engine's upsert path sets updated_at on
-- every write going forward.

ALTER TABLE sessions ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE program_day_items ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
