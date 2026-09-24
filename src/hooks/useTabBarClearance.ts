/**
 * useTabBarClearance hook
 *
 * Single source of truth for the bottom offset a scroll content container or
 * fixed footer must reserve so it clears the absolute-positioned floating tab
 * dock (`FloatingTabBar`). Combines the shared `TabBarClearance` constant with
 * the device safe-area bottom inset and a mandated 8pt gap above the dock.
 *
 * Returns `TabBarClearance + insets.bottom + MIN_GAP + extra`, which is always
 * at least `TabBarClearance + insets.bottom` (the dock never overlaps content).
 *
 * Requirements: 1.1, 1.4
 */
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TabBarClearance } from '@/constants/theme';

/** Minimum vertical gap between content and the top of the dock (Requirement 1). */
const MIN_GAP = 8;

/**
 * Bottom offset a scroll content container or fixed footer must reserve to
 * clear the floating dock: dock height + safe-area inset + 8pt gap.
 *
 * @param extra Additional padding to add on top of the base clearance.
 * @returns The clearance in points.
 */
export function useTabBarClearance(extra: number = 0): number {
  const insets = useSafeAreaInsets();
  return TabBarClearance + insets.bottom + MIN_GAP + extra;
}
