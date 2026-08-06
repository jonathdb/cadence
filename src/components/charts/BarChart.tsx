/**
 * BarChart component — horizontal bar chart for volume-by-muscle-group.
 * Uses react-native-svg for rendering with Design_System colors.
 *
 * Requirements: 13.1, 13.5
 */
import { StyleSheet, View } from 'react-native';
import Svg, { G, Rect, Text as SvgText } from 'react-native-svg';

import { Spacing } from '@/constants/theme';

export interface BarChartDataPoint {
  label: string;
  value: number;
}

export interface BarChartProps {
  data: BarChartDataPoint[];
  accentColor: string;
  textColor: string;
  height?: number;
  maxBars?: number;
}

/**
 * Horizontal bar chart showing volume distribution by category.
 * Bars scale relative to the maximum value in the dataset.
 */
export function BarChart({
  data,
  accentColor,
  textColor,
  height = 180,
  maxBars = 8,
}: BarChartProps) {
  // Limit to top N bars (data should already be sorted by value desc)
  const displayData = data.slice(0, maxBars);

  if (displayData.length === 0) return null;

  const maxValue = Math.max(...displayData.map((d) => d.value), 1);

  const barHeight = 20;
  const barGap = 8;
  const labelWidth = 80;
  const chartPadding = 4;
  const chartWidth = 300; // logical width (SVG viewBox scales)
  const barAreaWidth = chartWidth - labelWidth - 50; // space for value labels

  const totalHeight = displayData.length * (barHeight + barGap) - barGap + chartPadding * 2;
  const svgHeight = Math.max(totalHeight, height);

  return (
    <View style={[styles.container, { height: svgHeight }]}>
      <Svg
        width="100%"
        height={svgHeight}
        viewBox={`0 0 ${chartWidth} ${svgHeight}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {displayData.map((item, index) => {
          const y = chartPadding + index * (barHeight + barGap);
          const barWidth = (item.value / maxValue) * barAreaWidth;

          const displayLabel = formatLabel(item.label);
          const displayValue = formatCompactValue(item.value);

          return (
            <G key={item.label}>
              {/* Label */}
              <SvgText
                x={labelWidth - 6}
                y={y + barHeight / 2 + 4}
                fontSize={10}
                fill={textColor}
                textAnchor="end"
              >
                {displayLabel}
              </SvgText>

              {/* Bar */}
              <Rect
                x={labelWidth}
                y={y}
                width={Math.max(barWidth, 2)}
                height={barHeight}
                rx={4}
                ry={4}
                fill={accentColor}
                opacity={0.85}
              />

              {/* Value label */}
              <SvgText
                x={labelWidth + Math.max(barWidth, 2) + 6}
                y={y + barHeight / 2 + 4}
                fontSize={9}
                fill={textColor}
                textAnchor="start"
              >
                {displayValue}
              </SvgText>
            </G>
          );
        })}
      </Svg>
    </View>
  );
}

/** Capitalize and truncate muscle group label */
function formatLabel(label: string): string {
  const formatted = label
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
  return formatted.length > 12 ? formatted.slice(0, 11) + '…' : formatted;
}

/** Format volume value compactly */
function formatCompactValue(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return `${Math.round(value)}`;
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    paddingVertical: Spacing.one,
  },
});
