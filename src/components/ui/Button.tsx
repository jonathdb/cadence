/**
 * Button primitives — Kinetic Obsidian.
 *
 *  - PrimaryButton     → electric cyan fill, ink text, cyan glow. High-intensity CTA.
 *  - GhostButton       → transparent surface, hairline border, on-surface text.
 *  - DestructiveButton → low-opacity ruby glass, crimson text/border.
 *
 * All support an optional leading `icon` node and press-scale feedback.
 */
import { type ReactNode } from 'react';
import {
    ActivityIndicator,
    Pressable,
    type PressableProps,
    StyleSheet,
    View,
    type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type BaseProps = Omit<PressableProps, 'style'> & {
  label: string;
  icon?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
};

function useButtonState(disabled?: boolean) {
  return ({ pressed }: { pressed: boolean }): ViewStyle => ({
    transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
    opacity: disabled ? 0.5 : 1,
  });
}

export function PrimaryButton({ label, icon, loading, fullWidth, style, disabled, ...rest }: BaseProps) {
  const theme = useTheme();
  const pressStyle = useButtonState(disabled || loading);

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={(state) => [
        styles.base,
        { backgroundColor: theme.accent },
        theme.shadows.glowSoft,
        fullWidth && styles.fullWidth,
        pressStyle(state),
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={theme.accentText} />
      ) : (
        <View style={styles.content}>
          {icon ? <View style={styles.icon}>{icon}</View> : null}
          <ThemedText type="titleMedium" style={{ color: theme.accentText }}>
            {label}
          </ThemedText>
        </View>
      )}
    </Pressable>
  );
}

export function GhostButton({ label, icon, loading, fullWidth, style, disabled, ...rest }: BaseProps) {
  const theme = useTheme();
  const pressStyle = useButtonState(disabled || loading);

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={(state) => [
        styles.base,
        styles.ghost,
        { backgroundColor: theme.backgroundElement, borderColor: theme.borderStrong },
        fullWidth && styles.fullWidth,
        pressStyle(state),
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={theme.text} />
      ) : (
        <View style={styles.content}>
          {icon ? <View style={styles.icon}>{icon}</View> : null}
          <ThemedText type="titleMedium" style={{ color: theme.text }}>
            {label}
          </ThemedText>
        </View>
      )}
    </Pressable>
  );
}

export function DestructiveButton({ label, icon, loading, fullWidth, style, disabled, ...rest }: BaseProps) {
  const theme = useTheme();
  const pressStyle = useButtonState(disabled || loading);

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      style={(state) => [
        styles.base,
        styles.ghost,
        { backgroundColor: theme.errorSoft, borderColor: 'rgba(239,68,68,0.3)' },
        fullWidth && styles.fullWidth,
        pressStyle(state),
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={theme.error} />
      ) : (
        <View style={styles.content}>
          {icon ? <View style={styles.icon}>{icon}</View> : null}
          <ThemedText type="titleMedium" style={{ color: theme.error }}>
            {label}
          </ThemedText>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: TouchTarget.minimum,
    borderRadius: Radii.medium,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.twoHalf,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghost: {
    borderWidth: 1,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  icon: {
    marginRight: 0,
  },
});
