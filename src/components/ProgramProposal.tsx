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

      {/* Generic tool call */}
      {!['program_create', 'program_modify'].includes(toolCall.name) && parsedArgs && (
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
