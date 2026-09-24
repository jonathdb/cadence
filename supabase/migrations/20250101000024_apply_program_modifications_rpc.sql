-- Migration: apply_program_modifications RPC
-- Atomically applies a batch of agent/user program modifications in a single
-- transaction. Any failure RAISEs and rolls back the ENTIRE batch, so a
-- multi-change "replace" can never leave the program in a partial state
-- (fixes: removals silently no-op'ing, and later changes being skipped after
-- an earlier failure while earlier ones stay committed).
--
-- Contract: exercise names are resolved to catalog UUIDs by the caller
-- (tool-handlers.ts::resolveExerciseIdOrThrow) BEFORE calling this function,
-- so catalog grounding (Requirements 2.1, 4.9) stays enforced in one place.
-- This function only ever writes exercise_ids handed to it.
--
-- Each change object (jsonb) has the shape:
--   {
--     "action": "add_day" | "remove_day" | "modify_day"
--             | "add_exercise" | "remove_exercise" | "modify_exercise"
--             | "replace_exercise",
--     "day_numbers": [1, 3],            -- one or more target days
--     "exercise_id": "<uuid>",          -- resolved; the exercise to act on
--     "new_exercise_id": "<uuid>",      -- resolved; replacement (replace_exercise only)
--     "updates": { ... }                -- optional field updates
--   }
--
-- Validates: Requirements 1.2, 1.3, 1.4 (atomic program modification)

CREATE OR REPLACE FUNCTION apply_program_modifications(
  p_user_id uuid,
  p_program_id uuid,
  p_changes jsonb,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_change jsonb;
  v_action text;
  v_day_number integer;
  v_day_numbers jsonb;
  v_day_id uuid;
  v_exercise_id uuid;
  v_new_exercise_id uuid;
  v_updates jsonb;
  v_next_order integer;
  v_deleted integer;
  v_updated integer;
  v_old_item RECORD;
  v_changes_applied integer := 0;
BEGIN
  -- Verify program ownership up front.
  PERFORM 1 FROM programs
  WHERE id = p_program_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Program not found or not owned by user';
  END IF;

  -- Capture before_state.
  v_before := program_structure_snapshot(p_program_id);

  FOR v_change IN SELECT * FROM jsonb_array_elements(p_changes)
  LOOP
    v_action := v_change->>'action';
    v_updates := v_change->'updates';

    -- Normalize target days into a jsonb array. Accept either
    -- "day_numbers": [..] or a single "day_number".
    IF v_change ? 'day_numbers' AND jsonb_typeof(v_change->'day_numbers') = 'array' THEN
      v_day_numbers := v_change->'day_numbers';
    ELSIF v_change ? 'day_number' THEN
      v_day_numbers := jsonb_build_array(v_change->'day_number');
    ELSE
      v_day_numbers := '[]'::jsonb;
    END IF;

    -- ---- Program-level day actions (single day) ----
    IF v_action = 'add_day' THEN
      IF v_updates IS NULL THEN
        RAISE EXCEPTION 'add_day requires "updates" with day name';
      END IF;
      INSERT INTO program_days (program_id, day_number, name, planned_duration_minutes)
      VALUES (
        p_program_id,
        COALESCE((v_change->>'day_number')::integer, 1),
        COALESCE(v_updates->>'name', 'Day ' || COALESCE(v_change->>'day_number', '1')),
        CASE WHEN v_updates ? 'planned_duration_minutes'
             AND v_updates->>'planned_duration_minutes' IS NOT NULL
          THEN (v_updates->>'planned_duration_minutes')::integer ELSE NULL END
      );
      v_changes_applied := v_changes_applied + 1;
      CONTINUE;
    END IF;

    -- ---- Exercise / day actions that operate over one or more days ----
    IF jsonb_array_length(v_day_numbers) = 0 THEN
      RAISE EXCEPTION 'Action "%" requires "day_number" or "day_numbers"', v_action;
    END IF;

    FOR v_day_number IN
      SELECT (value)::integer FROM jsonb_array_elements_text(v_day_numbers)
    LOOP
      -- Resolve the day for THIS program. Fail loud if it doesn't resolve
      -- to exactly one day.
      SELECT id INTO v_day_id
      FROM program_days
      WHERE program_id = p_program_id AND day_number = v_day_number;

      IF v_day_id IS NULL AND v_action <> 'remove_day' THEN
        RAISE EXCEPTION 'Day % not found in this program', v_day_number;
      END IF;

      IF v_action = 'remove_day' THEN
        IF v_day_id IS NOT NULL THEN
          DELETE FROM program_days WHERE id = v_day_id;
        END IF;
        v_changes_applied := v_changes_applied + 1;

      ELSIF v_action = 'modify_day' THEN
        IF v_updates IS NULL THEN
          RAISE EXCEPTION 'modify_day requires "updates"';
        END IF;
        UPDATE program_days
        SET
          name = COALESCE(v_updates->>'name', name),
          planned_duration_minutes = CASE
            WHEN v_updates ? 'planned_duration_minutes' THEN
              CASE WHEN v_updates->>'planned_duration_minutes' IS NULL THEN NULL
                   ELSE (v_updates->>'planned_duration_minutes')::integer END
            ELSE planned_duration_minutes END
        WHERE id = v_day_id;
        v_changes_applied := v_changes_applied + 1;

      ELSIF v_action = 'add_exercise' THEN
        v_exercise_id := (v_change->>'exercise_id')::uuid;
        IF v_exercise_id IS NULL THEN
          RAISE EXCEPTION 'add_exercise requires a resolved "exercise_id"';
        END IF;
        SELECT COALESCE(MAX(order_index), 0) + 1 INTO v_next_order
        FROM program_day_items WHERE program_day_id = v_day_id;
        INSERT INTO program_day_items (
          program_day_id, type, order_index, exercise_id,
          target_sets, target_reps, target_weight, target_rpe, timer_config, notes
        )
        VALUES (
          v_day_id, 'exercise', v_next_order, v_exercise_id,
          COALESCE((v_updates->>'target_sets')::integer, 3),
          COALESCE(v_updates->>'target_reps', '8-12'),
          CASE WHEN v_updates->>'target_weight' IS NOT NULL
               THEN (v_updates->>'target_weight')::numeric ELSE NULL END,
          CASE WHEN v_updates->>'target_rpe' IS NOT NULL
               THEN (v_updates->>'target_rpe')::numeric ELSE NULL END,
          CASE WHEN v_updates ? 'timer_config' AND v_updates->'timer_config' != 'null'::jsonb
               THEN v_updates->'timer_config' ELSE NULL END,
          v_updates->>'notes'
        );
        v_changes_applied := v_changes_applied + 1;

      ELSIF v_action = 'remove_exercise' THEN
        v_exercise_id := (v_change->>'exercise_id')::uuid;
        IF v_exercise_id IS NULL THEN
          RAISE EXCEPTION 'remove_exercise requires a resolved "exercise_id"';
        END IF;
        DELETE FROM program_day_items
        WHERE program_day_id = v_day_id AND exercise_id = v_exercise_id;
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
        IF v_deleted = 0 THEN
          RAISE EXCEPTION 'remove_exercise matched no exercise on day %', v_day_number;
        END IF;
        v_changes_applied := v_changes_applied + 1;

      ELSIF v_action = 'modify_exercise' THEN
        v_exercise_id := (v_change->>'exercise_id')::uuid;
        IF v_exercise_id IS NULL OR v_updates IS NULL THEN
          RAISE EXCEPTION 'modify_exercise requires a resolved "exercise_id" and "updates"';
        END IF;
        UPDATE program_day_items
        SET
          target_sets = COALESCE((v_updates->>'target_sets')::integer, target_sets),
          target_reps = COALESCE(v_updates->>'target_reps', target_reps),
          target_weight = CASE WHEN v_updates ? 'target_weight'
            THEN CASE WHEN v_updates->>'target_weight' IS NULL THEN NULL
                      ELSE (v_updates->>'target_weight')::numeric END
            ELSE target_weight END,
          target_rpe = CASE WHEN v_updates ? 'target_rpe'
            THEN CASE WHEN v_updates->>'target_rpe' IS NULL THEN NULL
                      ELSE (v_updates->>'target_rpe')::numeric END
            ELSE target_rpe END,
          timer_config = CASE WHEN v_updates ? 'timer_config'
            THEN CASE WHEN v_updates->'timer_config' = 'null'::jsonb THEN NULL
                      ELSE v_updates->'timer_config' END
            ELSE timer_config END,
          notes = CASE WHEN v_updates ? 'notes' THEN v_updates->>'notes' ELSE notes END
        WHERE program_day_id = v_day_id AND exercise_id = v_exercise_id;
        GET DIAGNOSTICS v_updated = ROW_COUNT;
        IF v_updated = 0 THEN
          RAISE EXCEPTION 'modify_exercise matched no exercise on day %', v_day_number;
        END IF;
        v_changes_applied := v_changes_applied + 1;

      ELSIF v_action = 'replace_exercise' THEN
        v_exercise_id := (v_change->>'exercise_id')::uuid;
        v_new_exercise_id := (v_change->>'new_exercise_id')::uuid;
        IF v_exercise_id IS NULL OR v_new_exercise_id IS NULL THEN
          RAISE EXCEPTION 'replace_exercise requires resolved "exercise_id" and "new_exercise_id"';
        END IF;

        -- Find the existing item so the replacement inherits its slot
        -- (order_index) and, unless overridden, its targets.
        SELECT * INTO v_old_item
        FROM program_day_items
        WHERE program_day_id = v_day_id AND exercise_id = v_exercise_id
        ORDER BY order_index
        LIMIT 1;

        IF v_old_item.id IS NULL THEN
          RAISE EXCEPTION 'replace_exercise: exercise to replace not found on day %', v_day_number;
        END IF;

        UPDATE program_day_items
        SET
          exercise_id = v_new_exercise_id,
          target_sets = COALESCE((v_updates->>'target_sets')::integer, target_sets),
          target_reps = COALESCE(v_updates->>'target_reps', target_reps),
          target_weight = CASE WHEN v_updates ? 'target_weight'
            THEN CASE WHEN v_updates->>'target_weight' IS NULL THEN NULL
                      ELSE (v_updates->>'target_weight')::numeric END
            ELSE target_weight END,
          target_rpe = CASE WHEN v_updates ? 'target_rpe'
            THEN CASE WHEN v_updates->>'target_rpe' IS NULL THEN NULL
                      ELSE (v_updates->>'target_rpe')::numeric END
            ELSE target_rpe END,
          timer_config = CASE WHEN v_updates ? 'timer_config'
            THEN CASE WHEN v_updates->'timer_config' = 'null'::jsonb THEN NULL
                      ELSE v_updates->'timer_config' END
            ELSE timer_config END,
          notes = CASE WHEN v_updates ? 'notes' THEN v_updates->>'notes' ELSE notes END
        WHERE id = v_old_item.id;
        v_changes_applied := v_changes_applied + 1;

      ELSE
        RAISE EXCEPTION 'Unknown modification action: %', v_action;
      END IF;
    END LOOP;
  END LOOP;

  -- Capture after_state and record history.
  v_after := program_structure_snapshot(p_program_id);

  INSERT INTO modification_history (program_id, user_id, change_type, before_state, after_state, source)
  VALUES (p_program_id, p_user_id, p_reason, v_before, v_after, 'agent');

  RETURN jsonb_build_object(
    'program_id', p_program_id,
    'modifications_applied', v_changes_applied
  );
END;
$$;

-- Helper: full program structure snapshot for before/after modification_history.
-- Mirrors tool-handlers.ts::fetchProgramStructure so history stays consistent
-- whichever path wrote it.
CREATE OR REPLACE FUNCTION program_structure_snapshot(p_program_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'status', p.status,
    'days', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', d.id,
          'day_number', d.day_number,
          'name', d.name,
          'planned_duration_minutes', d.planned_duration_minutes,
          'items', COALESCE((
            SELECT jsonb_agg(
              jsonb_build_object(
                'id', i.id,
                'type', i.type,
                'order_index', i.order_index,
                'exercise_id', i.exercise_id,
                'block_id', i.block_id,
                'target_sets', i.target_sets,
                'target_reps', i.target_reps,
                'target_weight', i.target_weight,
                'target_rpe', i.target_rpe,
                'timer_config', i.timer_config,
                'notes', i.notes
              ) ORDER BY i.order_index
            )
            FROM program_day_items i
            WHERE i.program_day_id = d.id
          ), '[]'::jsonb)
        ) ORDER BY d.day_number
      )
      FROM program_days d
      WHERE d.program_id = p.id
    ), '[]'::jsonb)
  )
  FROM programs p
  WHERE p.id = p_program_id;
$$;

GRANT EXECUTE ON FUNCTION apply_program_modifications(uuid, uuid, jsonb, text) TO service_role;
GRANT EXECUTE ON FUNCTION program_structure_snapshot(uuid) TO service_role;
