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
import { Spacing } from '@/constants/theme';

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

  const parsedArgs = useMemo(() => {
    try {
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
      default: return toolCall.name;
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
      <View style={[styles.container, styles.approvedContainer]}>
        <ThemedText style={styles.statusText}>
          ✅ {toolDisplayName} — Applied
        </ThemedText>
      </View>
    );
  }

  if (toolCall.status === 'rejected') {
    return (
      <View style={[styles.container, styles.rejectedContainer]}>
        <ThemedText style={styles.statusText}>
          ❌ {toolDisplayName} — Rejected
        </ThemedText>
      </View>
    );
  }

  // Pending approval - show details
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <ThemedText style={styles.toolName}>🔧 {toolDisplayName}</ThemedText>
      </View>

      {/* Program creation details */}
      {toolCall.name === 'program_create' && parsedArgs && (
        <View style={styles.programDetails}>
          <ThemedText style={styles.programName}>
            {parsedArgs.name || 'Untitled Program'}
          </ThemedText>
          {parsedArgs.days?.map((day: any, idx: number) => (
            <View key={idx} style={styles.dayContainer}>
              <ThemedText style={styles.dayTitle}>
                Day {day.day_number}: {day.name}
              </ThemedText>
              {day.items?.map((item: any, itemIdx: number) => (
                <ThemedText key={itemIdx} style={styles.exerciseItem}>
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
          <ThemedText style={styles.programName}>
            Reason: {parsedArgs.reason || 'No reason provided'}
          </ThemedText>
          {parsedArgs.changes?.map((change: any, idx: number) => (
            <ThemedText key={idx} style={styles.exerciseItem}>
              • {change.action}: {change.exercise_name || `Day ${change.day_number}`}
            </ThemedText>
          ))}
        </View>
      )}

      {/* Generic tool call */}
      {!['program_create', 'program_modify'].includes(toolCall.name) && parsedArgs && (
        <View style={styles.programDetails}>
          <ThemedText style={styles.exerciseItem} numberOfLines={5}>
            {JSON.stringify(parsedArgs, null, 2)}
          </ThemedText>
        </View>
      )}

      {/* Approve/Reject buttons */}
      <View style={styles.buttonRow}>
        <Pressable
          style={[styles.approveButton, isExecuting && styles.buttonDisabled]}
          onPress={handleApprove}
          disabled={isExecuting}
        >
          <ThemedText style={styles.approveText}>
            {isExecuting ? 'Applying...' : 'Approve'}
          </ThemedText>
        </Pressable>
        <Pressable
          style={[styles.rejectButton, isExecuting && styles.buttonDisabled]}
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
    borderColor: '#e5e7eb',
    borderRadius: 10,
    padding: Spacing.three,
    backgroundColor: '#fafafa',
  },
  approvedContainer: {
    backgroundColor: '#f0fdf4',
    borderColor: '#86efac',
  },
  rejectedContainer: {
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5',
  },
  header: {
    marginBottom: Spacing.two,
  },
  toolName: {
    fontWeight: '700',
    fontSize: 14,
    color: '#374151',
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
  },
  programDetails: {
    marginBottom: Spacing.two,
    gap: 4,
  },
  programName: {
    fontWeight: '600',
    fontSize: 15,
    color: '#1f2937',
    marginBottom: 4,
  },
  dayContainer: {
    marginTop: 6,
    paddingLeft: Spacing.two,
  },
  dayTitle: {
    fontWeight: '600',
    fontSize: 13,
    color: '#4b5563',
    marginBottom: 2,
  },
  exerciseItem: {
    fontSize: 13,
    color: '#6b7280',
    lineHeight: 18,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  approveButton: {
    flex: 1,
    backgroundColor: '#16a34a',
    borderRadius: 8,
    padding: Spacing.two,
    alignItems: 'center',
  },
  rejectButton: {
    flex: 1,
    backgroundColor: '#dc2626',
    borderRadius: 8,
    padding: Spacing.two,
    alignItems: 'center',
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
