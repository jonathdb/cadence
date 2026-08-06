/**
 * Network status hook using @react-native-community/netinfo.
 *
 * Provides reactive connectivity state for UI indicators and
 * triggers sync engine flush on connectivity restore.
 *
 * Requirements: 4.7, 5.2, 6.2
 */
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

export interface NetworkStatus {
  /** Whether the device currently has network connectivity */
  isConnected: boolean;
  /** Whether the connectivity status is still being determined */
  isLoading: boolean;
}

/**
 * Hook that subscribes to network connectivity changes.
 * Returns the current connectivity state reactively.
 */
export function useNetworkStatus(): NetworkStatus {
  const [isConnected, setIsConnected] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      // NetInfo returns null when status is unknown, treat as connected
      const connected = state.isConnected ?? true;
      setIsConnected(connected);
      setIsLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return { isConnected, isLoading };
}
