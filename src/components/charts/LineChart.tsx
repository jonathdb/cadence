/**
 * LineChart component — trend line chart for weekly volume/frequency.
 * Uses react-native-svg for rendering with Design_System colors.
 *
 * Requirements: 13.3, 13.4, 13.5
 */
import { StyleSheet, View } from 'react-native';
import Svg, {
    Circle,
    G,
    Line,
    Polyline,
    Text as SvgText,
} from 'react-native-svg';

import { Spacing } from '@/constants/theme';

export interface LineChartDataPoint {
  label: string;
  value: number;
}

export interface LineChartProps {
  data: LineChartDataPoint[];
  accentColor: string;
  textColor: string;
  height?: number;
  formatValue?: (value: number) => string;
}

/**
 * Line chart showing trend over time (e.g., weekly volume or frequency).
 * Draws a polyline connecting data points with labeled axes.
 */
export function LineChart({
  data,
  accentColor,
  textColor,
  height = 140,
}: LineChartProps) {
  if (data.length === 0) return null;

  const chartWidth = 300; // logical width, SVG scales via viewBox
  const chartHeight = height;
  const paddingTop = 20;
  const paddingBottom = 28;
  const paddingLeft = 40;
  const paddingRight = 16;

  const plotWidth = chartWidth - paddingLeft - paddingRight;
  const plotHeight = chartHeight - paddingTop - paddingBottom;

  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const minValue = 0;
  const valueRange = maxValue - minValue || 1;

  // Calculate point positions
  const points = data.map((d, i) => {
    const x = paddingLeft + (data.length > 1 ? (i / (data.length - 1)) * plotWidth : plotWidth / 2);
    const y = paddingTop + plotHeight - ((d.value - minValue) / valueRange) * plotHeight;
    return { x, y, ...d };
  });

  // Polyline points string
  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ');

  // Y-axis labels (3 ticks)
  const yTicks = [0, maxValue / 2, maxValue];

  // X-axis labels (selective display)
  const xLabelIndices = getXLabelIndices(data.length);

  return (
    <View style={[styles.container, { height: chartHeight }]}>
      <Svg
        width="100%"
        height={chartHeight}
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Y-axis grid lines and labels */}
        {yTicks.map((tick, i) => {
          const y = paddingTop + plotHeight - ((tick - minValue) / valueRange) * plotHeight;
          return (
            <G key={`ytick-${i}`}>
              <Line
                x1={paddingLeft}
                y1={y}
                x2={chartWidth - paddingRight}
                y2={y}
                stroke={textColor}
                strokeOpacity={0.15}
                strokeWidth={0.5}
              />
              <SvgText
                x={paddingLeft - 4}
                y={y + 3}
                fontSize={9}
                fill={textColor}
                textAnchor="end"
                opacity={0.7}
              >
                {formatTickValue(tick)}
              </SvgText>
            </G>
          );
        })}

        {/* Trend line */}
        {points.length > 1 && (
          <Polyline
            points={polylinePoints}
            fill="none"
            stroke={accentColor}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Data points */}
        {points.map((p, i) => (
          <Circle
            key={`point-${i}`}
            cx={p.x}
            cy={p.y}
            r={3.5}
            fill={accentColor}
          />
        ))}

        {/* X-axis labels */}
        {xLabelIndices.map((idx) => {
          const p = points[idx];
          if (!p) return null;
          return (
            <SvgText
              key={`xlabel-${idx}`}
              x={p.x}
              y={chartHeight - 6}
              fontSize={9}
              fill={textColor}
              textAnchor="middle"
              opacity={0.7}
            >
              {p.label}
            </SvgText>
          );
        })}
      </Svg>
    </View>
  );
}

/** Determine which x-axis labels to show based on data count */
function getXLabelIndices(count: number): number[] {
  if (count <= 1) return [0];
  if (count <= 4) return Array.from({ length: count }, (_, i) => i);
  if (count <= 6) return [0, Math.floor(count / 2), count - 1];
  // For larger sets, show evenly distributed labels
  const step = Math.ceil(count / 5);
  const indices: number[] = [];
  for (let i = 0; i < count; i += step) {
    indices.push(i);
  }
  if (indices[indices.length - 1] !== count - 1) {
    indices.push(count - 1);
  }
  return indices;
}

/** Format Y-axis tick value compactly */
function formatTickValue(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(0)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}k`;
  return `${Math.round(value)}`;
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingVertical: Spacing.one,
  },
});
