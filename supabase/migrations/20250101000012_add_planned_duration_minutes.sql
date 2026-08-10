ALTER TABLE program_days
  ADD COLUMN planned_duration_minutes integer
  CONSTRAINT chk_planned_duration_minutes
    CHECK (planned_duration_minutes IS NULL OR (planned_duration_minutes >= 1 AND planned_duration_minutes <= 480));
