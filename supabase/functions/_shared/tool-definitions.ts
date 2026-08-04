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
        'Modify the user\'s active program. Specify the changes to apply.',
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
      name: 'spotify_create_playlist',
      description:
        'Create a new Spotify playlist for the user.',
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
        'Suggest a Spotify playlist tailored to the user\'s running/cycling/walking pace. Uses route history context (pace profile, distance, duration) to find playlists with music matching the activity intensity. For running, correlates pace to BPM: ~170-180 BPM for 5:00-6:00 min/km, ~150-165 BPM for 6:00-7:00 min/km, ~140-150 BPM for walking. Use this tool when the user requests music for a cardio session and route history is available.',
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
        },
        required: ['activity_type'],
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
