-- Migration: Clone Template RPC Function
-- Atomic transaction: copies program structure from template snapshot into user's library.
-- Validates: Requirements 4.1, 4.2, 4.3

CREATE OR REPLACE FUNCTION clone_template(
  p_user_id uuid,
  p_template_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_snapshot jsonb;
  v_program_id uuid;
  v_day_id uuid;
  v_day jsonb;
  v_item jsonb;
  v_template_title text;
BEGIN
  -- Get the template snapshot (must be published)
  SELECT program_snapshot, title INTO v_snapshot, v_template_title
  FROM program_templates
  WHERE id = p_template_id AND is_published = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template not found or not published';
  END IF;

  -- Create the program as a draft
  INSERT INTO programs (user_id, name, status)
  VALUES (p_user_id, v_snapshot->>'name', 'draft')
  RETURNING id INTO v_program_id;

  -- Create program_days and their items from the snapshot
  FOR v_day IN SELECT * FROM jsonb_array_elements(v_snapshot->'program_days')
  LOOP
    INSERT INTO program_days (program_id, day_number, name)
    VALUES (
      v_program_id,
      (v_day->>'day_number')::integer,
      v_day->>'name'
    )
    RETURNING id INTO v_day_id;

    -- Insert items for this day
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_day->'items')
    LOOP
      INSERT INTO program_day_items (
        program_day_id, type, order_index,
        exercise_id, target_sets, target_reps,
        target_weight, target_rpe, timer_config, notes
      )
      VALUES (
        v_day_id,
        v_item->>'type',
        (v_item->>'order')::integer,
        CASE WHEN v_item->>'exercise_id' IS NOT NULL
          THEN (v_item->>'exercise_id')::uuid ELSE NULL END,
        (v_item->>'target_sets')::integer,
        v_item->>'target_reps',
        CASE WHEN v_item->>'target_weight' IS NOT NULL
          THEN (v_item->>'target_weight')::numeric ELSE NULL END,
        CASE WHEN v_item->>'target_rpe' IS NOT NULL
          THEN (v_item->>'target_rpe')::numeric ELSE NULL END,
        CASE WHEN v_item->'timer_config' IS NOT NULL AND v_item->'timer_config' != 'null'::jsonb
          THEN v_item->'timer_config' ELSE NULL END,
        v_item->>'notes'
      );
    END LOOP;
  END LOOP;

  -- Record the clone event
  INSERT INTO template_clones (template_id, user_id)
  VALUES (p_template_id, p_user_id);

  -- Increment clone count on the template
  UPDATE program_templates
  SET clone_count = clone_count + 1, updated_at = now()
  WHERE id = p_template_id;

  RETURN v_program_id;
END;
$$;
