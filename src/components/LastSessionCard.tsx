/**
 * LastSessionCard component
 *
 * Displays a compact "Last Session" summary on Program_Day cards showing:
 * - Date of the most recent completed session
 * - Total sets logged
 * - Total volume (reps × weight)
 * - PR count
 *
 * Displays "No previous session" when no completed session exists.
 *
 * Requirements: 17.1, 17.2
 */
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLastSession } from '@/hooks/useLastSession';

interface LastSessionCardProps {
  programDayId: string;
}

export function LastSessionCard({ programDayId }: LastSessionCardProps) {
  const theme = useTheme();
  const { data, isLoading } = useLastSession(programDayId);

  if (isLoading) {
    return null;
  }

  if (!data) {
    return (
      <View
        style={[styles.container, { backgroundColor: theme.backgroundElement }]}
        accessibilityRole="summary"
        accessibilityLabel="No previous session for this day"
      >
        <ThemedText style={[styles.emptyText, { color: theme.textTertiary }]}>
          No previous session
        </ThemedText>
      </View>
    );
  }

  const formattedDate = formatSessionDate(data.date);
  const formattedVolume = formatVolume(data.totalVolume);

  return (
    <View
      style={[styles.container, { backgroundColor: theme.backgroundElement }]}
      accessibilityRole="summary"
      accessibilityLabel={`Last session on ${formattedDate}: ${data.totalSets} sets, ${formattedVolume} volume, ${data.prCount} personal records`}
    >
      <View style={styles.headerRow}>
        <ThemedText style={[styles.label, { color: theme.textSecondary }]}>
          Last Session
        </ThemedText>
        <ThemedText style={[styles.date, { color: theme.textSecondary }]}>
          {formattedDate}
        </ThemedText>
      </View>
      <View style={styles.statsRow}>
        <StatItem label="Sets" value={String(data.totalSets)} theme={theme} />
        <StatItem label="Volume" value={formattedVolume} theme={theme} />
        <StatItem label="PRs" value={String(data.prCount)} theme={theme} isPr={data.prCount > 0} />
      </View>
    </View>
  );
}

// ─── Stat Item ───────────────────────────────────────────────────────────────

interface StatItemProps {
  label: string;
  value: string;
  theme: ReturnType<typeof useTheme>;
  isPr?: boolean;
}

function StatItem({ label, value, theme, isPr }: StatItemProps) {
  return (
    <View style={styles.statItem} accessibilityLabel={`${label}: ${value}`}>
      <ThemedText style={[styles.statValue, { color: isPr ? theme.prText : theme.accent }]}>
        {value}
      </ThemedText>
      <ThemedText style={[styles.statLabel, { color: theme.textTertiary }]}>
        {label}
      </ThemedText>
    </View>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatSessionDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function formatVolume(volume: number): string {
  if (volume >= 10000) {
    return `${(volume / 1000).toFixed(1)}k`;
  }
  return volume.toLocaleString();
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    borderRadius: Radii.small,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.twoHalf,
    marginTop: Spacing.two,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.one,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  date: {
    fontSize: 11,
    fontWeight: '500',
  },
  emptyText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '500',
    textTransform: 'uppercase',
    marginTop: 1,
  },
});
