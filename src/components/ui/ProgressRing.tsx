/**
 * ProgressRing — Kinetic Obsidian circular progress indicator.
 *
 * A thin track ring with a cyan progress arc and a centered percent label,
 * used for cycle/phase completion (e.g. 75%).
 */
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';

export type ProgressRingProps = {
  /** Progress from 0 to 1. */
  progress: number;
  size?: number;
  strokeWidth?: number;
  /** Optional label override; defaults to the rounded percent. */
  label?: string;
  color?: string;
};

export function ProgressRing({
  progress,
  size = 48,
  strokeWidth = 4,
  label,
  color,
}: ProgressRingProps) {
  const theme = useTheme();
  const clamped = Math.max(0, Math.min(1, progress));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference * (1 - clamped);
  const arcColor = color ?? theme.accent;

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={theme.backgroundHighest}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={arcColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashoffset}
          fill="none"
          // Start the arc at 12 o'clock
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.labelWrap} pointerEvents="none">
        <ThemedText type="labelCaps" style={{ color: arcColor }}>
          {label ?? `${Math.round(clamped * 100)}%`}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
