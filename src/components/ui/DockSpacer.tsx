/**
 * DockSpacer — reserves floating-dock clearance inside a scroll container.
 *
 * A zero-width `View` whose height equals `useTabBarClearance(extra)`. Drop it
 * in as the last child of a scroll container (e.g. inside a ScrollView, or as a
 * FlatList `ListFooterComponent`) when applying bottom padding via
 * `contentContainerStyle` isn't convenient, so the content clears the
 * absolute-positioned `FloatingTabBar`.
 *
 * Requirements: 1.1, 1.3
 */
import { View } from 'react-native';

import { useTabBarClearance } from '@/hooks/useTabBarClearance';

export type DockSpacerProps = {
  /** Additional height to add on top of the base dock clearance. */
  extra?: number;
};

export function DockSpacer({ extra }: DockSpacerProps) {
  const height = useTabBarClearance(extra);
  return <View style={{ height }} />;
}
