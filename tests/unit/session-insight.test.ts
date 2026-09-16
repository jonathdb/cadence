/**
 * Tests for the pure session-insight builder (Task 9).
 * Verifies headline priority and that actionable insights carry a pending_approval
 * proposal while non-actionable ones do not.
 */
import { describe, expect, it } from 'vitest';

import {
  buildSessionInsight,
  type InsightInput,
} from '../../supabase/functions/_shared/session-insight.ts';

function input(overrides: Partial<InsightInput> = {}): InsightInput {
  return {
    program_id: 'prog-1',
    recovery_state: 'ok',
    prs: [],
    strength_suggestions: [],
    cardio_suggestions: [],
    guardrail_notes: [],
    ...overrides,
  };
}

describe('buildSessionInsight', () => {
  it('leads with a recovery warning when compromised (non-actionable)', () => {
    const out = buildSessionInsight(input({ recovery_state: 'compromised' }));
    expect(out.actionable).toBe(false);
    expect(out.tool_calls).toHaveLength(0);
    expect(out.content.toLowerCase()).toContain('recovery');
  });

  it('celebrates a PR (non-actionable)', () => {
    const out = buildSessionInsight(
      input({ prs: [{ exercise_name: 'Bench Press', pr_type: 'weight', value: 110 }] })
    );
    expect(out.actionable).toBe(false);
    expect(out.content).toContain('Bench Press');
    expect(out.content).toContain('110');
  });

  it('emits a pending_approval program_modify for a confident increase (actionable)', () => {
    const out = buildSessionInsight(
      input({
        strength_suggestions: [
          {
            exercise_name: 'Squat',
            suggestion_type: 'increase_weight',
            current_values: { weight: 100, sets: 3 },
            suggested_values: { weight: 105, sets: 3 },
            confidence: 'high',
            reasoning: 'RPE consistently below 7.',
          },
        ],
      })
    );
    expect(out.actionable).toBe(true);
    expect(out.tool_calls).toHaveLength(1);
    expect(out.tool_calls[0].name).toBe('program_modify');
    expect(out.tool_calls[0].status).toBe('pending_approval');
    const args = JSON.parse(out.tool_calls[0].arguments);
    expect(args.program_id).toBe('prog-1');
    expect(args.changes[0].updates.target_weight).toBe(105);
  });

  it('does NOT emit a proposal for a medium-confidence suggestion', () => {
    const out = buildSessionInsight(
      input({
        strength_suggestions: [
          {
            exercise_name: 'Squat',
            suggestion_type: 'increase_weight',
            current_values: { weight: 100, sets: 3 },
            suggested_values: { weight: 105, sets: 3 },
            confidence: 'medium',
            reasoning: 'Trending up.',
          },
        ],
      })
    );
    expect(out.actionable).toBe(false);
    expect(out.tool_calls).toHaveLength(0);
  });

  it('does NOT emit a proposal when there is no active program', () => {
    const out = buildSessionInsight(
      input({
        program_id: null,
        strength_suggestions: [
          {
            exercise_name: 'Squat',
            suggestion_type: 'increase_weight',
            current_values: { weight: 100, sets: 3 },
            suggested_values: { weight: 105, sets: 3 },
            confidence: 'high',
            reasoning: 'Ready.',
          },
        ],
      })
    );
    expect(out.actionable).toBe(false);
  });

  it('surfaces a cardio suggestion when no strength action', () => {
    const out = buildSessionInsight(
      input({
        cardio_suggestions: [
          { activity_type: 'running', suggestion_type: 'increase_distance', confidence: 'medium', reasoning: 'Build your base.' },
        ],
      })
    );
    expect(out.actionable).toBe(false);
    expect(out.content.toLowerCase()).toContain('running');
  });

  it('falls back to neutral encouragement', () => {
    const out = buildSessionInsight(input());
    expect(out.actionable).toBe(false);
    expect(out.content.length).toBeGreaterThan(0);
  });
});
