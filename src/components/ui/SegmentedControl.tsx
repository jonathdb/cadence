/**
 * SegmentedControl — Kinetic Obsidian time/metric/provider selector.
 *
 * Container is a low-tier surface; the active segment is elevated. Two active
 * styles:
 *  - "accent"   → cyan fill with ink text (used for time windows, providers)
 *  - "elevated" → raised surface with cyan text (subtler)
 */
import { useCallback } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
};

export type SegmentedControlProps<T extends string> = {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  activeStyle?: 'accent' | 'elevated';
  style?: ViewStyle;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  activeStyle = 'accent',
  style,
}: SegmentedControlProps<T>) {
  const theme = useTheme();

  const renderSegment = useCallback(
    (opt: SegmentOption<T>) => {
      const isActive = opt.value === value;
      const activeBg =
        activeStyle === 'accent' ? theme.accent : theme.backgroundSelected;
      const activeFg = activeStyle === 'accent' ? theme.accentText : theme.accent;

      return (
        <Pressable
          key={opt.value}
          onPress={() => onChange(opt.value)}
          accessibilityRole="tab"
          accessibilityState={{ selected: isActive }}
          style={[
            styles.segment,
            isActive && {
              backgroundColor: activeBg,
              ...(activeStyle === 'accent' ? theme.shadows.glowSoft : {}),
            },
          ]}
        >
          <ThemedText
            type="labelLarge"
            style={{ color: isActive ? activeFg : theme.textSecondary }}
          >
            {opt.label}
          </ThemedText>
        </Pressable>
      );
    },
    [value, onChange, activeStyle, theme],
  );

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.backgroundElevated, borderColor: theme.border },
        style,
      ]}
    >
      {options.map(renderSegment)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: Spacing.one,
    borderRadius: Radii.large,
    borderWidth: 1,
    gap: Spacing.one,
  },
  segment: {
    flex: 1,
    minHeight: TouchTarget.minimum - 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.two,
    borderRadius: Radii.medium,
  },
});
