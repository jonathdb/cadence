/**
 * MetricReadout — Kinetic Obsidian telemetry value.
 *
 * An overline label above a large numeric value with an optional small unit,
 * used for stats like Volume 14,280 kg, Recovery 94%, Resting HR 58 bpm.
 */
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type MetricReadoutProps = {
  label: string;
  value: string | number;
  unit?: string;
  /** Value color token; defaults to primary accent. */
  valueColor?: string;
  align?: 'left' | 'center';
  /** Type scale for the value. Defaults to `titleMedium` for compact use. */
  size?: 'metric' | 'title';
  style?: ViewStyle;
};

export function MetricReadout({
  label,
  value,
  unit,
  valueColor,
  align = 'left',
  size = 'title',
  style,
}: MetricReadoutProps) {
  const theme = useTheme();
  const color = valueColor ?? theme.accent;

  return (
    <View style={[align === 'center' && styles.center, style]}>
      <ThemedText type="labelCaps" style={{ color: theme.textSecondary }}>
        {label}
      </ThemedText>
      <View style={styles.valueRow}>
        <ThemedText type={size === 'metric' ? 'dataMetric' : 'titleMedium'} style={{ color }}>
          {value}
        </ThemedText>
        {unit ? (
          <ThemedText type="bodySmall" style={[styles.unit, { color: theme.textSecondary }]}>
            {unit}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing.half,
    marginTop: Spacing.half,
  },
  unit: {
    marginBottom: 1,
  },
});
