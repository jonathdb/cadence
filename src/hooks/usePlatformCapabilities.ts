/**
 * usePlatformCapabilities hook
 *
 * Provides React components with access to platform capability information
 * for conditional rendering of native-only UI elements.
 *
 * Usage:
 * ```tsx
 * const { notifications, health, gps, isWeb } = usePlatformCapabilities();
 *
 * return (
 *   <View>
 *     {notifications && <NotificationSettings />}
 *     {health && <HealthIntegrationCard />}
 *     {gps && <RouteTrackingButton />}
 *   </View>
 * );
 * ```
 *
 * Requirements: 23.2, 23.3
 */
import { useMemo } from 'react';

import {
    getPlatformCapabilities,
    type PlatformCapabilities,
} from '@/lib/platform-capabilities';

/**
 * Returns platform capabilities for use in component rendering logic.
 * The capabilities are stable (platform doesn't change at runtime),
 * so this uses useMemo with an empty dependency array.
 */
export function usePlatformCapabilities(): PlatformCapabilities {
  return useMemo(() => getPlatformCapabilities(), []);
}
