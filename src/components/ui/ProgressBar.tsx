/**
 * ProgressBar / SegmentBar — Kinetic Obsidian linear progress.
 *
 * ProgressBar: single cyan fill on a muted track (e.g. Phase Adherence 42%).
 * SegmentBar: multiple proportional colored segments (e.g. volume by muscle).
 */
import { StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

export type ProgressBarProps = {
  /** 0..1 */
  progress: number;
  color?: string;
  trackColor?: string;
  height?: number;
  style?: ViewStyle;
};

export function ProgressBar({ progress, color, trackColor, height = 8, style }: ProgressBarProps) {
  const theme = useTheme();
  const clamped = Math.max(0, Math.min(1, progress));

  return (
    <View
      style={[
        styles.track,
        { height, borderRadius: height / 2, backgroundColor: trackColor ?? theme.backgroundHighest },
        style,
      ]}
    >
      <View
        style={{
          width: `${clamped * 100}%`,
          height: '100%',
          borderRadius: height / 2,
          backgroundColor: color ?? theme.accent,
        }}
      />
    </View>
  );
}

export type Segment = {
  /** Relative weight (proportions are normalized). */
  value: number;
  color: string;
};

export type SegmentBarProps = {
  segments: Segment[];
  height?: number;
  gap?: number;
  style?: ViewStyle;
};

export function SegmentBar({ segments, height = 8, gap = 3, style }: SegmentBarProps) {
  const theme = useTheme();
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0) || 1;

  return (
    <View
      style={[
        styles.segmentRow,
        { height, gap, backgroundColor: theme.backgroundHighest, borderRadius: height / 2 },
        style,
      ]}
    >
      {segments.map((seg, i) => (
        <View
          key={i}
          style={{
            flex: Math.max(0, seg.value) / total,
            height: '100%',
            borderRadius: height / 2,
            backgroundColor: seg.color,
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    overflow: 'hidden',
  },
  segmentRow: {
    flexDirection: 'row',
    width: '100%',
    overflow: 'hidden',
  },
});
