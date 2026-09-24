/**
 * ProgramProposal component - displays a tool call proposal with
 * approve/reject buttons. Shows program structure for program_create,
 * and generic info for other tool calls.
 *
 * Requirements: 1.2, 2.3
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface ToolCallData {
  id: string;
  name: string;
  arguments: string;
  status: 'pending_approval' | 'approved' | 'auto_applied' | 'rejected';
}

interface ProgramProposalProps {
  toolCall: ToolCallData;
  onApprove: () => void;
  onReject: () => void;
}

export function ProgramProposal({ toolCall, onApprove, onReject }: ProgramProposalProps) {
  const [isExecuting, setIsExecuting] = useState(false);
  const theme = useTheme();

  const parsedArgs = useMemo(() => {
    try {
      if (typeof toolCall.arguments === 'object' && toolCall.arguments !== null) {
        return toolCall.arguments;
      }
      if (!toolCall.arguments || toolCall.arguments.trim() === '') {
        return {};
      }
      return JSON.parse(toolCall.arguments);
    } catch {
      return null;
    }
  }, [toolCall.arguments]);

  const toolDisplayName = useMemo(() => {
    switch (toolCall.name) {
      case 'program_create': return 'Create Program';
      case 'program_modify': return 'Modify Program';
      case 'program_activate': return 'Activate Program';
      case 'journal_draft': return 'Draft Journal Entry';
      case 'get_active_program': return 'Fetching Active Program';
      case 'get_recovery_summary': return 'Fetching Recovery Data';
      case 'get_recent_workouts_summary': return 'Fetching Recent Workouts';
      case 'get_route_history': return 'Fetching Route History';
      case 'get_session_history': return 'Fetching Session History';
      case 'get_session_details': return 'Fetching Session Details';
      case 'get_programs': return 'Fetching Programs';
      case 'get_exercises': return 'Searching Exercise Catalog';
      case 'session_update': return 'Update Session';
      case 'session_delete': return 'Delete Session';
      case 'exercise_instance_add': return 'Add Exercise';
      case 'exercise_instance_update': return 'Update Exercise';
      case 'exercise_instance_remove': return 'Remove Exercise';
      case 'program_archive': return 'Archive Program';
      case 'program_delete': return 'Delete Program';
      default: return toolCall.name.replace(/_/g, ' ');
    }
  }, [toolCall.name]);

  const handleApprove = async () => {
    setIsExecuting(true);
    await onApprove();
    setIsExecuting(false);
  };

  // Already resolved
  if (toolCall.status === 'approved' || toolCall.status === 'auto_applied') {
    return (
      <View style={[styles.container, { borderColor: theme.success, backgroundColor: theme.successSoft }]}>
        <ThemedText style={{ fontSize: 14, fontWeight: '500', color: theme.success }}>
          ✅ {toolDisplayName} — Applied
        </ThemedText>
      </View>
    );
  }

  if (toolCall.status === 'rejected') {
    return (
      <View style={[styles.container, { borderColor: theme.error, backgroundColor: theme.errorSoft }]}>
        <ThemedText style={{ fontSize: 14, fontWeight: '500', color: theme.error }}>
          ❌ {toolDisplayName} — Rejected
        </ThemedText>
      </View>
    );
  }

  // Pending approval - show details
  return (
    <View style={[styles.container, { borderColor: theme.border, backgroundColor: theme.backgroundElevated }]}>
      <View style={styles.header}>
        <ThemedText style={{ fontWeight: '700', fontSize: 14, color: theme.text }}>🔧 {toolDisplayName}</ThemedText>
      </View>

      {/* Program creation details */}
      {toolCall.name === 'program_create' && parsedArgs && (
        <View style={styles.programDetails}>
          <ThemedText style={{ fontWeight: '600', fontSize: 15, color: theme.text, marginBottom: 4 }}>
            {parsedArgs.name || 'Untitled Program'}
          </ThemedText>
          {parsedArgs.days?.map((day: any, idx: number) => (
            <View key={idx} style={styles.dayContainer}>
              <ThemedText style={{ fontWeight: '600', fontSize: 13, color: theme.textSecondary, marginBottom: 2 }}>
                Day {day.day_number}: {day.name}
              </ThemedText>
              {day.items?.map((item: any, itemIdx: number) => (
                <ThemedText key={itemIdx} style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 18 }}>
                  • {item.exercise_name} — {item.target_sets}×{item.target_reps}
                  {item.target_weight ? ` @ ${item.target_weight}kg` : ''}
                  {item.target_rpe ? ` RPE ${item.target_rpe}` : ''}
                </ThemedText>
              ))}
            </View>
          ))}
        </View>
      )}

      {/* Program modify details */}
      {toolCall.name === 'program_modify' && parsedArgs && (
        <View style={styles.programDetails}>
          <ThemedText style={{ fontWeight: '600', fontSize: 15, color: theme.text, marginBottom: 4 }}>
            Reason: {parsedArgs.reason || 'No reason provided'}
          </ThemedText>
          {parsedArgs.changes?.map((change: any, idx: number) => (
            <ThemedText key={idx} style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 18 }}>
              • {change.action}: {change.exercise_name || `Day ${change.day_number}`}
            </ThemedText>
          ))}
        </View>
      )}

      {/* session_update details */}
      {toolCall.name === 'session_update' && parsedArgs && (
        <View style={styles.programDetails}>
          <ThemedText style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 18 }}>
            Session {parsedArgs.session_id?.slice(0, 8) ?? 'unknown'}
          </ThemedText>
          {parsedArgs.updates &&
            Object.entries(parsedArgs.updates as Record<string, unknown>).map(([field, value]) => (
              <ThemedText key={field} style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 18 }}>
                • {field.replace(/_/g, ' ')}: {String(value)}
              </ThemedText>
            ))}
        </View>
      )}

      {/* session_delete details */}
      {toolCall.name === 'session_delete' && parsedArgs && (
        <View style={styles.programDetails}>
          <ThemedText style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 18 }}>
            Session {parsedArgs.session_id?.slice(0, 8) ?? 'unknown'} will be removed from your history.
            Logged sets are kept.
          </ThemedText>
        </View>
      )}

      {/* exercise_instance_add details */}
      {toolCall.name === 'exercise_instance_add' && parsedArgs && (
        <View style={styles.programDetails}>
          <ThemedText style={{ fontWeight: '600', fontSize: 14, color: theme.text }}>
            {parsedArgs.exercise_name ?? 'Unknown exercise'} — Day {parsedArgs.day_number}
          </ThemedText>
          {parsedArgs.updates && (
            <ThemedText style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 18 }}>
              {parsedArgs.updates.target_sets ?? '?'}×{parsedArgs.updates.target_reps ?? '?'}
              {parsedArgs.updates.target_weight ? ` @ ${parsedArgs.updates.target_weight}kg` : ''}
            </ThemedText>
          )}
        </View>
      )}

      {/* exercise_instance_update details */}
      {toolCall.name === 'exercise_instance_update' && parsedArgs && (
        <View style={styles.programDetails}>
          {parsedArgs.updates &&
            Object.entries(parsedArgs.updates as Record<string, unknown>).map(([field, value]) => (
              <ThemedText key={field} style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 18 }}>
                • {field.replace(/_/g, ' ')}: {String(value)}
              </ThemedText>
            ))}
        </View>
      )}

      {/* exercise_instance_remove details */}
      {toolCall.name === 'exercise_instance_remove' && parsedArgs && (
        <View style={styles.programDetails}>
          <ThemedText style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 18 }}>
            Removes one exercise from a program day. Logged history for it is unaffected.
          </ThemedText>
        </View>
      )}

      {/* program_archive / program_delete details */}
      {(toolCall.name === 'program_archive' || toolCall.name === 'program_delete') && parsedArgs && (
        <View style={styles.programDetails}>
          <ThemedText style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 18 }}>
            {toolCall.name === 'program_delete' && parsedArgs.mode === 'purge'
              ? 'This permanently deletes the program. Logged history is preserved.'
              : 'The program will be archived — non-destructive and reversible.'}
          </ThemedText>
        </View>
      )}

      {/* Generic tool call (fallback for anything without bespoke rendering) */}
      {![
        'program_create',
        'program_modify',
        'session_update',
        'session_delete',
        'exercise_instance_add',
        'exercise_instance_update',
        'exercise_instance_remove',
        'program_archive',
        'program_delete',
      ].includes(toolCall.name) &&
        parsedArgs && (
          <View style={styles.programDetails}>
            <ThemedText style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 18 }} numberOfLines={5}>
              {JSON.stringify(parsedArgs, null, 2)}
            </ThemedText>
          </View>
        )}

      {/* Approve/Reject buttons */}
      <View style={styles.buttonRow}>
        <Pressable
          style={[styles.approveButton, { backgroundColor: theme.success }, isExecuting && styles.buttonDisabled]}
          onPress={handleApprove}
          disabled={isExecuting}
        >
          <ThemedText style={styles.approveText}>
            {isExecuting ? 'Applying...' : 'Approve'}
          </ThemedText>
        </Pressable>
        <Pressable
          style={[styles.rejectButton, { backgroundColor: theme.error }, isExecuting && styles.buttonDisabled]}
          onPress={onReject}
          disabled={isExecuting}
        >
          <ThemedText style={styles.rejectText}>Reject</ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: Spacing.two,
    borderWidth: 1,
    borderRadius: Radii.medium,
    padding: Spacing.three,
  },
  header: {
    marginBottom: Spacing.two,
  },
  programDetails: {
    marginBottom: Spacing.two,
    gap: 4,
  },
  dayContainer: {
    marginTop: 6,
    paddingLeft: Spacing.two,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  approveButton: {
    flex: 1,
    borderRadius: Radii.medium,
    padding: Spacing.two,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  rejectButton: {
    flex: 1,
    borderRadius: Radii.medium,
    padding: Spacing.two,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  approveText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  rejectText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
});
