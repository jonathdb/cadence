/**
 * Database type definitions for Supabase typed client.
 * Contains the minimal table definitions needed for the vertical slice.
 * Replace with generated types from `supabase gen types typescript` after migrations are applied.
 */
export type Database = {
  public: {
    Tables: {
      programs: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          status: 'draft' | 'active' | 'archived';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          status?: 'draft' | 'active' | 'archived';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          status?: 'draft' | 'active' | 'archived';
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'programs_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      program_days: {
        Row: {
          id: string;
          program_id: string;
          day_number: number;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          program_id: string;
          day_number: number;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          program_id?: string;
          day_number?: number;
          name?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'program_days_program_id_fkey';
            columns: ['program_id'];
            referencedRelation: 'programs';
            referencedColumns: ['id'];
          },
        ];
      };
      program_day_items: {
        Row: {
          id: string;
          program_day_id: string;
          exercise_id: string | null;
          block_id: string | null;
          type: 'exercise' | 'block';
          order_index: number;
          target_sets: number;
          target_reps: string;
          target_weight: number | null;
          target_rpe: number | null;
          timer_config: Record<string, unknown> | null;
          notes: string | null;
        };
        Insert: {
          id?: string;
          program_day_id: string;
          exercise_id?: string | null;
          block_id?: string | null;
          type?: 'exercise' | 'block';
          order_index: number;
          target_sets: number;
          target_reps: string;
          target_weight?: number | null;
          target_rpe?: number | null;
          timer_config?: Record<string, unknown> | null;
          notes?: string | null;
        };
        Update: {
          id?: string;
          program_day_id?: string;
          exercise_id?: string | null;
          block_id?: string | null;
          type?: 'exercise' | 'block';
          order_index?: number;
          target_sets?: number;
          target_reps?: string;
          target_weight?: number | null;
          target_rpe?: number | null;
          timer_config?: Record<string, unknown> | null;
          notes?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'program_day_items_program_day_id_fkey';
            columns: ['program_day_id'];
            referencedRelation: 'program_days';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'program_day_items_exercise_id_fkey';
            columns: ['exercise_id'];
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
        ];
      };
      exercises: {
        Row: {
          id: string;
          user_id: string | null;
          name: string;
          primary_muscle_group: string;
          secondary_muscle_groups: string[] | null;
          instructions: string | null;
          notes: string | null;
          is_global: boolean;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          name: string;
          primary_muscle_group: string;
          secondary_muscle_groups?: string[] | null;
          instructions?: string | null;
          notes?: string | null;
          is_global?: boolean;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          name?: string;
          primary_muscle_group?: string;
          secondary_muscle_groups?: string[] | null;
          instructions?: string | null;
          notes?: string | null;
          is_global?: boolean;
        };
        Relationships: [];
      };
      chat_messages: {
        Row: {
          id: string;
          user_id: string;
          role: 'user' | 'assistant' | 'system' | 'tool';
          content: string;
          tool_calls: Record<string, unknown>[] | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          role: 'user' | 'assistant' | 'system' | 'tool';
          content: string;
          tool_calls?: Record<string, unknown>[] | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          role?: 'user' | 'assistant' | 'system' | 'tool';
          content?: string;
          tool_calls?: Record<string, unknown>[] | null;
          created_at?: string;
        };
        Relationships: [];
      };
      user_api_keys: {
        Row: {
          id: string;
          user_id: string;
          openai_key_encrypted: string | null;
          anthropic_key_encrypted: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          openai_key_encrypted?: string | null;
          anthropic_key_encrypted?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          openai_key_encrypted?: string | null;
          anthropic_key_encrypted?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_settings: {
        Row: {
          id: string;
          user_id: string;
          permission_program_edits: 'approval_required' | 'auto_apply';
          permission_journal_edits: 'approval_required' | 'auto_apply';
          permission_spotify_actions: 'approval_required' | 'auto_apply';
          permission_health_access: 'approval_required' | 'auto_apply';
          health_connected: boolean;
          health_provider: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          permission_program_edits?: 'approval_required' | 'auto_apply';
          permission_journal_edits?: 'approval_required' | 'auto_apply';
          permission_spotify_actions?: 'approval_required' | 'auto_apply';
          permission_health_access?: 'approval_required' | 'auto_apply';
          health_connected?: boolean;
          health_provider?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          permission_program_edits?: 'approval_required' | 'auto_apply';
          permission_journal_edits?: 'approval_required' | 'auto_apply';
          permission_spotify_actions?: 'approval_required' | 'auto_apply';
          permission_health_access?: 'approval_required' | 'auto_apply';
          health_connected?: boolean;
          health_provider?: string | null;
        };
        Relationships: [];
      };
      sessions: {
        Row: {
          id: string;
          user_id: string;
          program_day_id: string;
          route_id: string | null;
          status: 'in_progress' | 'completed';
          started_at: string;
          completed_at: string | null;
          total_duration_seconds: number | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          program_day_id: string;
          route_id?: string | null;
          status?: 'in_progress' | 'completed';
          started_at?: string;
          completed_at?: string | null;
          total_duration_seconds?: number | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          program_day_id?: string;
          route_id?: string | null;
          status?: 'in_progress' | 'completed';
          started_at?: string;
          completed_at?: string | null;
          total_duration_seconds?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'sessions_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sessions_program_day_id_fkey';
            columns: ['program_day_id'];
            referencedRelation: 'program_days';
            referencedColumns: ['id'];
          },
        ];
      };
      logged_sets: {
        Row: {
          id: string;
          session_id: string;
          exercise_id: string;
          set_number: number;
          reps: number;
          weight: number;
          rpe: number | null;
          notes: string | null;
          is_pr: boolean;
          pr_type: 'weight' | 'reps_at_weight' | 'estimated_1rm' | null;
          actual_duration_seconds: number | null;
          logged_at: string;
        };
        Insert: {
          id?: string;
          session_id: string;
          exercise_id: string;
          set_number: number;
          reps: number;
          weight: number;
          rpe?: number | null;
          notes?: string | null;
          is_pr?: boolean;
          pr_type?: 'weight' | 'reps_at_weight' | 'estimated_1rm' | null;
          actual_duration_seconds?: number | null;
          logged_at?: string;
        };
        Update: {
          id?: string;
          session_id?: string;
          exercise_id?: string;
          set_number?: number;
          reps?: number;
          weight?: number;
          rpe?: number | null;
          notes?: string | null;
          is_pr?: boolean;
          pr_type?: 'weight' | 'reps_at_weight' | 'estimated_1rm' | null;
          actual_duration_seconds?: number | null;
          logged_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'logged_sets_session_id_fkey';
            columns: ['session_id'];
            referencedRelation: 'sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'logged_sets_exercise_id_fkey';
            columns: ['exercise_id'];
            referencedRelation: 'exercises';
            referencedColumns: ['id'];
          },
        ];
      };
      audit_log: {
        Row: {
          id: string;
          user_id: string;
          timestamp: string;
          action_type: string;
          permission_category: string;
          parameters: Record<string, unknown>;
          approval_status: 'approved' | 'auto_applied' | 'rejected';
          outcome: 'success' | 'failure';
          error_message: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          timestamp?: string;
          action_type: string;
          permission_category: string;
          parameters: Record<string, unknown>;
          approval_status: 'approved' | 'auto_applied' | 'rejected';
          outcome: 'success' | 'failure';
          error_message?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          timestamp?: string;
          action_type?: string;
          permission_category?: string;
          parameters?: Record<string, unknown>;
          approval_status?: 'approved' | 'auto_applied' | 'rejected';
          outcome?: 'success' | 'failure';
          error_message?: string | null;
        };
        Relationships: [];
      };
      journal_entries: {
        Row: {
          id: string;
          user_id: string;
          session_id: string | null;
          content: string;
          agent_drafted: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          session_id?: string | null;
          content: string;
          agent_drafted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          session_id?: string | null;
          content?: string;
          agent_drafted?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'journal_entries_user_id_fkey';
            columns: ['user_id'];
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      modification_history: {
        Row: {
          id: string;
          program_id: string;
          user_id: string;
          change_type: string;
          before_state: Record<string, unknown>;
          after_state: Record<string, unknown>;
          source: 'user' | 'agent';
          created_at: string;
        };
        Insert: {
          id?: string;
          program_id: string;
          user_id: string;
          change_type: string;
          before_state: Record<string, unknown>;
          after_state: Record<string, unknown>;
          source: 'user' | 'agent';
          created_at?: string;
        };
        Update: {
          id?: string;
          program_id?: string;
          user_id?: string;
          change_type?: string;
          before_state?: Record<string, unknown>;
          after_state?: Record<string, unknown>;
          source?: 'user' | 'agent';
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      activate_program: {
        Args: { p_user_id: string; p_program_id: string };
        Returns: undefined;
      };
      get_user_api_key: {
        Args: { p_user_id: string; p_provider: string };
        Returns: string | null;
      };
    };
    Enums: Record<string, never>;
  };
};
