/**
 * Session insight builder (Task 9).
 *
 * PURE — no DB/network. Given the outputs the session-insight edge function has
 * already gathered (PRs hit in the session, and the unified progression result),
 * produce ONE concise proactive insight for the user, plus an optional actionable
 * tool proposal (emitted as a pending_approval program_modify) when a confident
 * change is warranted. Any actionable change still requires user approval.
 */

export interface SessionPR {
  exercise_name: string;
  pr_type: string;
  value: number;
}

export interface StrengthSuggestionLite {
  exercise_name: string;
  suggestion_type: string;
  current_values: { weight: number; sets: number };
  suggested_values: { weight: number; sets: number };
  confidence: 'high' | 'medium';
  reasoning: string;
}

export interface CardioSuggestionLite {
  activity_type: string;
  suggestion_type: string;
  confidence: 'high' | 'medium';
  reasoning: string;
}

export interface InsightInput {
  program_id: string | null;
  recovery_state: 'compromised' | 'ok';
  prs: SessionPR[];
  strength_suggestions: StrengthSuggestionLite[];
  cardio_suggestions: CardioSuggestionLite[];
  guardrail_notes: string[];
}

/** A proposed tool call, shaped like the pending_approval tool_calls the client expects. */
export interface ProposedToolCall {
  id: string;
  name: string;
  arguments: string; // JSON string
  status: 'pending_approval';
}

export interface SessionInsight {
  /** The concise message to show at the top of chat. */
  content: string;
  /** True when the insight carries an approval-gated proposal. */
  actionable: boolean;
  /** The proposed tool call(s), if actionable. */
  tool_calls: ProposedToolCall[];
}

function fmtWeight(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

/**
 * Build a single proactive insight. Priority for the headline:
 *   1. Compromised recovery (safety first)
 *   2. A PR hit this session (celebrate)
 *   3. A confident (high) progression suggestion → actionable proposal
 *   4. A cardio suggestion
 *   5. Otherwise a neutral encouragement
 *
 * Only ONE high-confidence strength increase becomes an actionable proposal so
 * the user isn't overwhelmed; everything else is conversational.
 */
export function buildSessionInsight(input: InsightInput): SessionInsight {
  const idBase = `insight-${Date.now()}`;

  // 1) Recovery first.
  if (input.recovery_state === 'compromised') {
    return {
      content:
        'Nice work finishing your session. Your recent recovery looks compromised ' +
        '(low sleep or a dip in HRV), so I\'d keep the next session lighter or take a rest day. ' +
        'Want me to plan an easier week?',
      actionable: false,
      tool_calls: [],
    };
  }

  // 2) PR celebration.
  if (input.prs.length > 0) {
    const top = input.prs[0];
    const prText =
      top.pr_type === 'weight'
        ? `a new weight PR on ${top.exercise_name} (${fmtWeight(top.value)})`
        : top.pr_type === 'estimated_1rm'
          ? `a new estimated 1RM on ${top.exercise_name} (${fmtWeight(top.value)})`
          : `a reps PR on ${top.exercise_name}`;
    return {
      content: `Big session — you hit ${prText}! ${input.prs.length > 1 ? `That's ${input.prs.length} PRs today. ` : ''}Keep it up.`,
      actionable: false,
      tool_calls: [],
    };
  }

  // 3) Confident strength progression → actionable proposal.
  const confidentIncrease = input.strength_suggestions.find(
    (s) => s.suggestion_type === 'increase_weight' && s.confidence === 'high'
  );
  if (confidentIncrease && input.program_id) {
    const { exercise_name, current_values, suggested_values } = confidentIncrease;
    const changedWeight = suggested_values.weight !== current_values.weight;
    const changedSets = suggested_values.sets !== current_values.sets;
    const what = changedWeight
      ? `increase ${exercise_name} from ${fmtWeight(current_values.weight)} to ${fmtWeight(suggested_values.weight)}`
      : changedSets
        ? `add a set to ${exercise_name} (${current_values.sets} → ${suggested_values.sets})`
        : `progress ${exercise_name}`;

    const proposal: ProposedToolCall = {
      id: `${idBase}-progress`,
      name: 'program_modify',
      arguments: JSON.stringify({
        program_id: input.program_id,
        reason: `Proactive progression after a strong session: ${confidentIncrease.reasoning}`,
        changes: [
          {
            action: 'modify_exercise',
            exercise_name,
            updates: changedWeight
              ? { target_weight: suggested_values.weight }
              : { target_sets: suggested_values.sets },
          },
        ],
      }),
      status: 'pending_approval',
    };

    return {
      content:
        `Solid session. Based on your recent training I'd ${what} next time. ` +
        `${confidentIncrease.reasoning} Approve the change and I'll update your program.`,
      actionable: true,
      tool_calls: [proposal],
    };
  }

  // 4) Cardio suggestion.
  const cardio = input.cardio_suggestions.find((c) => c.suggestion_type !== 'maintain_cardio');
  if (cardio) {
    return {
      content: `Nice work. For your ${cardio.activity_type}: ${cardio.reasoning}`,
      actionable: false,
      tool_calls: [],
    };
  }

  // 5) Guardrail note surfaced, if any.
  if (input.guardrail_notes.length > 0) {
    return {
      content: `Good session. One note: ${input.guardrail_notes[0]}`,
      actionable: false,
      tool_calls: [],
    };
  }

  // 6) Neutral fallback.
  return {
    content: 'Session logged — you\'re on track. Keep the momentum going!',
    actionable: false,
    tool_calls: [],
  };
}
