/**
 * ChartTableToggle — Accessible toggle between chart and table views.
 *
 * Provides a "View as table" / "View as chart" button below charts for users
 * who prefer or require textual data representation over visual charts.
 *
 * Requirements: 24.3 (accessible text summary as alternative to visual data)
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface DataRow {
  label: string;
  value: string;
}

interface ChartTableToggleProps {
  /** Whether the table view is currently shown */
  showTable: boolean;
  /** Toggle callback */
  onToggle: () => void;
  /** Data rows to display in table mode */
  data: DataRow[];
  /** Optional header for the table */
  tableTitle?: string;
}

export function ChartTableToggle({
  showTable,
  onToggle,
  data,
  tableTitle,
}: ChartTableToggleProps) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <Pressable
        style={[styles.toggleButton, { backgroundColor: theme.backgroundElement }]}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={showTable ? 'View as chart' : 'View as table'}
        accessibilityHint={
          showTable
            ? 'Switch to visual chart representation'
            : 'Switch to accessible table representation of chart data'
        }
      >
        <ThemedText style={[styles.toggleText, { color: theme.accent }]}>
          {showTable ? '📊 View as chart' : '📋 View as table'}
        </ThemedText>
      </Pressable>

      {showTable && data.length > 0 && (
        <View
          style={[styles.table, { borderColor: theme.border }]}
          accessibilityRole="list"
          accessibilityLabel={tableTitle ? `${tableTitle} data table` : 'Chart data table'}
        >
          {tableTitle && (
            <ThemedText
              style={[styles.tableTitle, { color: theme.textSecondary }]}
              accessibilityRole="header"
            >
              {tableTitle}
            </ThemedText>
          )}
          {data.map((row, index) => (
            <View
              key={`${row.label}-${index}`}
              style={[
                styles.tableRow,
                index < data.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: theme.borderSubtle,
                },
              ]}
              accessibilityLabel={`${row.label}: ${row.value}`}
            >
              <ThemedText style={[styles.tableLabel, { color: theme.text }]}>
                {row.label}
              </ThemedText>
              <ThemedText style={[styles.tableValue, { color: theme.textSecondary }]}>
                {row.value}
              </ThemedText>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  toggleButton: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.twoHalf,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radii.medium,
    minHeight: 36,
    justifyContent: 'center',
  },
  toggleText: {
    fontSize: 12,
    fontWeight: '600',
  },
  table: {
    borderWidth: 1,
    borderRadius: Radii.medium,
    overflow: 'hidden',
  },
  tableTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: Spacing.twoHalf,
    paddingVertical: Spacing.one + 2,
  },
  tableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.twoHalf,
    paddingVertical: Spacing.two,
    minHeight: 36,
  },
  tableLabel: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  tableValue: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
  },
});
