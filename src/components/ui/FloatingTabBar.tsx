/**
 * FloatingTabBar — Kinetic Obsidian detached glass navigation dock.
 *
 * A suspended pill-shaped bar floating above the screen base. The active tab
 * gets a luminous cyan icon + label with a soft glow; inactive tabs are muted.
 * Uses GlassView where supported, solid glass surface fallback otherwise.
 */
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const TAB_ICONS: Record<string, IconName> = {
  chat: 'chat',
  program: 'program',
  session: 'session',
  progress: 'progress',
  settings: 'settings',
};

const TAB_LABELS: Record<string, string> = {
  chat: 'Chat',
  program: 'Program',
  session: 'Session',
  progress: 'Progress',
  settings: 'Settings',
};

/**
 * Minimal structural type for the props the tab bar consumes. Avoids depending
 * on @react-navigation/bottom-tabs internals while staying type-safe here.
 */
type TabRoute = { key: string; name: string };
export type FloatingTabBarProps = {
  state: { index: number; routes: TabRoute[] };
  navigation: {
    emit: (event: { type: 'tabPress'; target: string; canPreventDefault: true }) => {
      defaultPrevented: boolean;
    };
    navigate: (name: string) => void;
  };
};

export function FloatingTabBar({ state, navigation }: FloatingTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const useGlass = isLiquidGlassAvailable();

  const routes = state.routes.filter((r) => TAB_ICONS[r.name]);

  const content = (
    <View style={styles.row}>
      {routes.map((route) => {
        const routeIndex = state.routes.findIndex((r) => r.key === route.key);
        const isActive = state.index === routeIndex;
        const color = isActive ? theme.tabBarActive : theme.tabBarInactive;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isActive && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={TAB_LABELS[route.name]}
            style={styles.tab}
          >
            <View style={isActive ? [styles.activeIcon, theme.shadows.glow] : undefined}>
              <Icon name={TAB_ICONS[route.name]} size={24} color={color} />
            </View>
            <ThemedText type="labelCaps" style={[styles.label, { color }]}>
              {TAB_LABELS[route.name]}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, Spacing.two) }]}
    >
      <View style={[styles.dockShadow, theme.shadows.dock]}>
        {useGlass ? (
          <GlassView
            glassEffectStyle="regular"
            tintColor={theme.tabBarBackground}
            style={[styles.dock, { borderColor: theme.tabBarBorder }]}
          >
            {content}
          </GlassView>
        ) : (
          <View
            style={[
              styles.dock,
              { backgroundColor: theme.tabBarBackground, borderColor: theme.tabBarBorder },
            ]}
          >
            {content}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.three,
  },
  dockShadow: {
    borderRadius: Radii.full,
  },
  dock: {
    borderRadius: Radii.full,
    borderWidth: 1,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
    overflow: 'hidden',
    ...Platform.select({ web: { backdropFilter: 'blur(20px)' } as object }),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  tab: {
    minWidth: 56,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  activeIcon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    marginTop: 2,
  },
});
