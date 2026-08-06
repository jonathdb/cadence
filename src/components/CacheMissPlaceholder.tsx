/**
 * CacheMissPlaceholder - Displayed when cached data is unavailable while offline.
 *
 * Renders a placeholder message informing the user that the requested data
 * is not available in the local cache and requires connectivity to load.
 *
 * Requirements: 5.2, 6.2
 */
import { StyleSheet, Text, View } from 'react-native';

import { Radii, Spacing, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

interface CacheMissPlaceholderProps {
  /** Optional custom message. Defaults to generic cache miss text. */
  message?: string;
}

/**
 * Renders a centered placeholder indicating no cached data is available.
 * Used in screens that attempt to display data while offline and find the cache empty.
 */
export function CacheMissPlaceholder({
  message = 'No cached data available. Connect to the internet to load this content.',
}: CacheMissPlaceholderProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}
      accessibilityRole="text"
      accessibilityLabel={message}
    >
      <Text style={[styles.icon]} aria-hidden>
        📡
      </Text>
      <Text style={[styles.message, { color: theme.textSecondary }]}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.five,
    margin: Spacing.three,
    borderRadius: Radii.large,
    borderWidth: 1,
    gap: Spacing.twoHalf,
  },
  icon: {
    fontSize: 32,
  },
  message: {
    ...TypeScale.bodyMedium,
    textAlign: 'center',
  },
});
