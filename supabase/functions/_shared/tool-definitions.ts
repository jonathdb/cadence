/**
 * Tool definitions for the Cadence AI training agent.
 * These are passed to the LLM so it can invoke structured actions.
 *
 * Format follows OpenAI function calling schema (also compatible with
 * Anthropic tool_use via transformation in the provider adapter).
 */

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export const toolDefinitions: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'program_create',
      description:
        'Create a new training program with structured days, exercises, sets, reps, and timer configurations.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Program name' },
          days: {
            type: 'array',
            description: 'Ordered list of program days',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string', description: 'Day name (e.g. "Push Day")' },
                day_number: { type: 'integer', description: 'Order index (1-based)' },
                planned_duration_minutes: {
                  type: 'integer',
                  description: 'Planned session duration in minutes (1-480). Omit if unknown.',
                },
                items: {
                  type: 'array',
                  description: 'Exercises and blocks for this day',
                  items: {
                    type: 'object',
                    properties: {
                      type: { type: 'string', enum: ['exercise', 'block'] },
                      exercise_name: { type: 'string' },
                      target_sets: { type: 'integer' },
                      target_reps: { type: 'string' },
                      target_weight: { type: 'number' },
                      target_rpe: { type: 'number' },
                      timer_config: {
                        type: 'object',
                        properties: {
                          type: { type: 'string', enum: ['none', 'rest', 'countdown', 'interval', 'duration'] },
                          work_seconds: { type: 'integer' },
                          rest_seconds: { type: 'integer' },
                          rounds: { type: 'integer' },
                          duration_seconds: { type: 'integer' },
                        },
                      },
                      notes: { type: 'string' },
                    },
                    required: ['type', 'exercise_name', 'target_sets', 'target_reps'],
                  },
                },
              },
              required: ['name', 'day_number', 'items'],
            },
          },
        },
        required: ['name', 'days'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'program_modify',
      description:
        'Modify the user\'s active program. Specify the changes to apply. ' +
        'The modify_day action accepts updates including name and planned_duration_minutes (1-480 or null).',
      parameters: {
        type: 'object',
        properties: {
          program_id: { type: 'string', description: 'UUID of the program to modify' },
          changes: {
            type: 'array',
            description: 'List of modifications',
            items: {
              type: 'object',
              properties: {
                action: { type: 'string', enum: ['add_day', 'remove_day', 'modify_day', 'add_exercise', 'remove_exercise', 'modify_exercise'] },
                day_number: { type: 'integer' },
                exercise_name: { type: 'string' },
                updates: { type: 'object', description: 'Fields to update' },
              },
              required: ['action'],
            },
          },
          reason: { type: 'string', description: 'Why this change is being made' },
        },
        required: ['program_id', 'changes', 'reason'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'program_activate',
      description:
        'Activate a program, making it the user\'s current active program. Archives the previously active program.',
      parameters: {
        type: 'object',
        properties: {
          program_id: { type: 'string', description: 'UUID of the program to activate' },
        },
        required: ['program_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'journal_draft',
      description:
        'Draft a journal entry summarizing a completed session for the user to review.',
      parameters: {
        type: 'object',
        properties: {
          session_id: { type: 'string', description: 'UUID of the completed session' },
          content: { type: 'string', description: 'Draft journal entry text' },
          tone: { type: 'string', enum: ['encouraging', 'analytical', 'brief'], description: 'Tone of the entry' },
        },
        required: ['session_id', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recovery_summary',
      description:
        'Retrieve the user\'s recent recovery data (sleep, HRV, resting HR) to inform training recommendations.',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'integer', description: 'Number of days to look back (default 7)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_recent_workouts_summary',
      description:
        'Retrieve summaries of the user\'s recent workout sessions for context.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Max number of sessions to return (default 5)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'spotify_search_playlist',
      description:
        'Search Spotify for playlists matching a query.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query for playlists' },
          limit: { type: 'integer', description: 'Max results (default 5)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'spotify_search_tracks',
      description:
        'Search Spotify for tracks matching a query. Returns track URIs that can be passed to spotify_create_playlist or spotify_modify_playlist. Always use this tool to get real track URIs before creating or modifying playlists — do NOT invent track URIs.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query (e.g. "Blitzkrieg Bop Ramones" or "running 170 bpm rock")' },
          limit: { type: 'integer', description: 'Max results (default 10, max 50)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'spotify_create_playlist',
      description:
        'Create a new Spotify playlist for the user. IMPORTANT: Use spotify_search_tracks first to get valid track URIs — do not fabricate URIs.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Playlist name' },
          description: { type: 'string', description: 'Playlist description' },
          track_uris: {
            type: 'array',
            items: { type: 'string' },
            description: 'Spotify track URIs to add',
          },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'spotify_modify_playlist',
      description:
        'Add or remove tracks from an existing Spotify playlist.',
      parameters: {
        type: 'object',
        properties: {
          playlist_id: { type: 'string', description: 'Spotify playlist ID' },
          add_tracks: {
            type: 'array',
            items: { type: 'string' },
            description: 'Track URIs to add',
          },
          remove_tracks: {
            type: 'array',
            items: { type: 'string' },
            description: 'Track URIs to remove',
          },
        },
        required: ['playlist_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_route_history',
      description:
        'Retrieve the user\'s recent GPS route history with summary stats (distance, duration, pace, speed, elevation gain, date). Optionally includes full GPS point data for detailed analysis. Use this tool when the user asks about their running/walking history, trends, or when you need route context for recommendations.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'integer',
            description: 'Max number of routes to return (default 10)',
          },
          include_full_points: {
            type: 'boolean',
            description: 'Whether to include the full GPS point_stream data for each route (default false). Only set to true when detailed route geometry is needed.',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'spotify_suggest_pace_playlist',
      description:
        'Suggest a Spotify playlist tailored to the user\'s running/cycling/walking pace. Works with or without route history — activity_type is the only required parameter. When route history is available, uses pace data for precise BPM matching. When unavailable, accepts session_context (session type, planned duration, intensity) from the user\'s program to estimate appropriate BPM. Falls back to activity-type defaults when no context is provided. Optionally accepts genres, seed_artists, and seed_tracks to personalize recommendations via the Spotify Recommendations API (max 5 combined seeds).',
      parameters: {
        type: 'object',
        properties: {
          activity_type: {
            type: 'string',
            enum: ['running', 'cycling', 'walking'],
            description: 'Type of cardio activity',
          },
          target_pace_seconds_per_km: {
            type: 'number',
            description: 'Target pace in seconds per kilometer (e.g., 300 for 5:00/km). Used to determine ideal BPM range for music.',
          },
          duration_minutes: {
            type: 'number',
            description: 'Planned duration of the activity in minutes. Used to suggest playlists of appropriate length.',
          },
          recent_route_summary: {
            type: 'object',
            description: 'Summary of the user\'s recent route history to inform playlist selection.',
            properties: {
              avg_pace_seconds_per_km: {
                type: 'number',
                description: 'Average pace across recent routes in seconds per km',
              },
              avg_speed_kmh: {
                type: 'number',
                description: 'Average speed across recent routes in km/h',
              },
              distance_meters: {
                type: 'number',
                description: 'Typical route distance in meters',
              },
              elevation_gain_meters: {
                type: 'number',
                description: 'Typical elevation gain in meters (hilly routes may need different energy)',
              },
            },
          },
          session_context: {
            type: 'object',
            description: 'Program-derived session context for BPM estimation when route history is unavailable.',
            properties: {
              session_type: {
                type: 'string',
                enum: ['easy run', 'tempo run', 'interval session', 'long run'],
                description: 'Type of running session from the training program',
              },
              planned_duration_minutes: {
                type: 'number',
                minimum: 1,
                maximum: 480,
                description: 'Planned session duration in minutes',
              },
              intensity_label: {
                type: 'string',
                enum: ['low', 'moderate', 'high'],
                description: 'Session intensity level',
              },
            },
          },
          genres: {
            type: 'array',
            items: { type: 'string' },
            description: 'Spotify genre identifiers for recommendations (e.g., "pop", "hip-hop", "electronic"). Combined with seed_artists and seed_tracks, max 5 total seeds.',
          },
          seed_artists: {
            type: 'array',
            items: { type: 'string' },
            description: 'Spotify artist IDs or artist names to seed recommendations. Names are resolved to IDs via the Spotify Search API. Combined with genres and seed_tracks, max 5 total seeds.',
          },
          seed_tracks: {
            type: 'array',
            items: { type: 'string' },
            description: 'Spotify track IDs or track names to seed recommendations. Names are resolved to IDs via the Spotify Search API. Combined with genres and seed_artists, max 5 total seeds.',
          },
        },
        required: ['activity_type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_active_program',
      description:
        'Retrieve the user\'s currently active training program with full structure ' +
        '(days with planned_duration_minutes, exercises, blocks, targets). Returns null if no active program exists.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_programs',
      description:
        'List all of the user\'s programs (active, draft, archived) with summary info ' +
        'and day details including planned_duration_minutes.',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['active', 'draft', 'archived', 'all'],
            description: 'Filter by program status (default: all)',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_session_history',
      description:
        'Retrieve the user\'s recent completed workout sessions with summary data (date, program day, duration, sets, volume, PRs).',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 100,
            description: 'Max number of sessions to return (default 10)',
          },
          program_id: {
            type: 'string',
            description: 'Filter by program UUID',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_session_details',
      description:
        'Retrieve all logged sets for a specific session, grouped by exercise, with session metadata and block completions.',
      parameters: {
        type: 'object',
        properties: {
          session_id: { type: 'string', description: 'UUID of the session' },
        },
        required: ['session_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'suggest_progression',
      description:
        'Analyze exercise history, recovery data, and program targets to suggest weight/volume adjustments for the next session. ' +
        'Call get_session_details, get_recovery_summary, and get_active_program first to gather the required input data. ' +
        'Returns structured suggestions with reasoning that should be presented to the user for approval before applying changes.',
      parameters: {
        type: 'object',
        properties: {
          exercise_history: {
            type: 'array',
            description: 'Array of exercise histories with recent session data (most-recent-first)',
            items: {
              type: 'object',
              properties: {
                exercise_name: { type: 'string' },
                muscle_group: {
                  type: 'string',
                  enum: ['chest', 'back', 'shoulders', 'biceps', 'triceps',
                         'quads', 'hamstrings', 'glutes', 'calves'],
                },
                sessions: {
                  type: 'array',
                  description: 'Recent sessions for this exercise, ordered most-recent-first',
                  items: {
                    type: 'object',
                    properties: {
                      session_date: { type: 'string', description: 'ISO date string' },
                      sets: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            weight: { type: 'number' },
                            reps: { type: 'integer' },
                            rpe: { type: 'number', nullable: true },
                          },
                          required: ['weight', 'reps'],
                        },
                      },
                    },
                    required: ['session_date', 'sets'],
                  },
                },
              },
              required: ['exercise_name', 'muscle_group', 'sessions'],
            },
          },
          recovery_summary: {
            type: 'object',
            description: 'Recent recovery data (from get_recovery_summary)',
            properties: {
              avg_sleep_hours: { type: 'number', description: 'Average sleep hours over the period' },
              hrv_ms: { type: 'number', description: 'Most recent HRV in milliseconds' },
              hrv_baseline_ms: { type: 'number', description: 'User baseline HRV in milliseconds (7-day average)' },
              resting_hr_bpm: { type: 'number', description: 'Resting heart rate in BPM' },
            },
            required: ['avg_sleep_hours', 'hrv_ms', 'hrv_baseline_ms', 'resting_hr_bpm'],
          },
          program_targets: {
            type: 'array',
            description: 'Current program targets for each exercise (from get_active_program)',
            items: {
              type: 'object',
              properties: {
                exercise_name: { type: 'string' },
                target_sets: { type: 'integer' },
                target_rep_range: { type: 'string', description: 'e.g. "8-12"' },
                target_weight: { type: 'number' },
                target_rpe: { type: 'number', nullable: true },
              },
              required: ['exercise_name', 'target_sets', 'target_rep_range', 'target_weight'],
            },
          },
          scope: {
            type: 'string',
            enum: ['full_program', 'single_exercise'],
            description: 'Whether to evaluate all exercises or just the first one (default: full_program)',
          },
        },
        required: ['exercise_history', 'recovery_summary', 'program_targets'],
      },
    },
  },
];

/**
 * Convert OpenAI-style tool definitions to Anthropic tool format.
 */
export function toAnthropicTools(
  tools: ToolDefinition[]
): { name: string; description: string; input_schema: Record<string, unknown> }[] {
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
}
