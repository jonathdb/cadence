/**
 * OfflineBanner - Displays a banner at the top of the screen when offline.
 *
 * Shows a prominent indicator that the device lacks network connectivity,
 * informing the user they're operating in offline mode.
 *
 * Requirements: 5.2, 6.2
 */
import { StyleSheet, Text, View } from 'react-native';

import { Spacing, TypeScale } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

/**
 * Renders a visible offline banner when the device has no connectivity.
 * Returns null when online or still loading connectivity status.
 */
export function OfflineBanner() {
  const { isConnected, isLoading } = useNetworkStatus();
  const theme = useTheme();

  // Don't show anything while loading or when online
  if (isLoading || isConnected) {
    return null;
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.warningSoft, borderColor: theme.warning },
      ]}
      accessibilityRole="alert"
      accessibilityLabel="You are offline. Data will sync when connectivity returns."
      accessibilityLiveRegion="polite"
    >
      <Text style={[styles.icon]} aria-hidden>
        ⚡
      </Text>
      <Text style={[styles.text, { color: theme.warning }]}>
        You're offline — changes will sync when connected
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderBottomWidth: 1,
    gap: Spacing.two,
  },
  icon: {
    fontSize: TypeScale.bodyMedium.fontSize,
  },
  text: {
    ...TypeScale.labelMedium,
    flex: 1,
  },
});
