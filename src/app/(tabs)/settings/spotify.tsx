/**
 * Spotify connect/disconnect screen.
 * Shows connection status, account name, and allows users to connect or disconnect Spotify.
 * Uses the spotify auth service with OAuth2 PKCE flow.
 *
 * Requirements: 25.1, 25.2, 25.3, 25.4, 25.5, 25.6
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTabBarClearance } from '@/hooks/useTabBarClearance';
import { useAuth } from '@/providers/AuthProvider';
import {
    connectSpotify,
    disconnectSpotify,
    getSpotifyConnectionStatus,
} from '@/services/spotify';

export default function SpotifyScreen() {
  const { session } = useAuth();
  const theme = useTheme();
  const dockClearance = useTabBarClearance();
  const [isConnected, setIsConnected] = useState(false);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [scopes, setScopes] = useState<string[] | null>(null);
  const [accountName, setAccountName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    if (!session?.user.id) return;

    try {
      const status = await getSpotifyConnectionStatus(session.user.id);
      setIsConnected(status.connected);
      setNeedsReconnect(status.needsReconnect);
      setScopes(status.scopes);
      setAccountName(status.accountName);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Spotify status');
    } finally {
      setIsLoading(false);
    }
  }, [session?.user.id]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  async function handleConnect() {
    setIsProcessing(true);
    setError(null);

    try {
      const result = await connectSpotify();
      if (result) {
        setIsConnected(true);
        setNeedsReconnect(false);
        setScopes(result.scopes);
        // Reload status to get account name from Spotify /me endpoint
        if (session?.user.id) {
          const status = await getSpotifyConnectionStatus(session.user.id);
          setAccountName(status.accountName);
        }
      }
      // null result means user cancelled — no error
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect Spotify');
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleDisconnect() {
    if (!session?.user.id) return;

    // Alert.alert doesn't work on web — use window.confirm as fallback
    const confirmed =
      typeof window !== 'undefined' && window.confirm
        ? window.confirm(
            'Disconnect Spotify?\n\nThis will revoke access and remove stored tokens. The Agent will no longer be able to manage playlists.'
          )
        : await new Promise<boolean>((resolve) => {
            Alert.alert(
              'Disconnect Spotify',
              'This will revoke access and remove stored tokens. The Agent will no longer be able to manage playlists.',
              [
                { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Disconnect', style: 'destructive', onPress: () => resolve(true) },
              ]
            );
          });

    if (!confirmed) return;

    setIsProcessing(true);
    setError(null);

    try {
      await disconnectSpotify(session.user.id);
      setIsConnected(false);
      setScopes(null);
      setAccountName(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect Spotify');
    } finally {
      setIsProcessing(false);
    }
  }

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" accessibilityLabel="Loading Spotify connection status" />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: dockClearance }]}>
        <View style={styles.section}>
          <ThemedText type="small" themeColor="textSecondary">
            Connect your Spotify account to let the Agent search, create, and modify playlists
            for your training sessions.
          </ThemedText>
        </View>

        {error && (
          <View style={[styles.errorContainer, { backgroundColor: theme.errorSoft }]}>
            <ThemedText style={[styles.errorText, { color: theme.error }]}>{error}</ThemedText>
          </View>
        )}

        {/* Connection Status */}
        <View style={[styles.statusCard, { backgroundColor: theme.backgroundElement }]}>
          <View style={styles.statusRow}>
            <ThemedText style={styles.statusLabel}>Status</ThemedText>
            <ThemedText
              style={[
                isConnected ? styles.statusConnected : styles.statusDisconnected,
                { color: isConnected ? theme.success : theme.textSecondary },
              ]}
            >
              {isConnected ? 'Connected' : 'Not connected'}
            </ThemedText>
          </View>

          {isConnected && accountName && (
            <View style={styles.statusRow}>
              <ThemedText style={styles.statusLabel}>Account</ThemedText>
              <ThemedText type="small" themeColor="text">
                {accountName}
              </ThemedText>
            </View>
          )}

          {isConnected && scopes && scopes.length > 0 && (
            <View style={styles.scopesSection}>
              <ThemedText style={styles.statusLabel}>Scopes</ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.scopesText}>
                {scopes.join(', ')}
              </ThemedText>
            </View>
          )}
        </View>

        {/* Action Button */}
        <View style={styles.section}>
          {needsReconnect ? (
            <>
              <View style={[styles.warningContainer, { backgroundColor: theme.errorSoft }]}>
                <ThemedText style={[styles.warningText, { color: theme.error }]}>
                  Your Spotify connection has expired or been revoked. Please reconnect to continue using playlist features.
                </ThemedText>
              </View>
              <Pressable
                style={[styles.connectButton, { backgroundColor: theme.accent }, isProcessing && styles.buttonDisabled]}
                onPress={handleConnect}
                disabled={isProcessing}
                accessibilityRole="button"
                accessibilityLabel="Reconnect Spotify account"
              >
                {isProcessing ? (
                  <ActivityIndicator color={theme.accentText} size="small" />
                ) : (
                  <ThemedText style={[styles.buttonText, { color: theme.accentText }]}>Reconnect Spotify</ThemedText>
                )}
              </Pressable>
            </>
          ) : isConnected ? (
            <Pressable
              style={[styles.disconnectButton, { backgroundColor: theme.error }, isProcessing && styles.buttonDisabled]}
              onPress={handleDisconnect}
              disabled={isProcessing}
              accessibilityRole="button"
              accessibilityLabel="Disconnect Spotify account"
            >
              {isProcessing ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <ThemedText style={styles.buttonText}>Disconnect Spotify</ThemedText>
              )}
            </Pressable>
          ) : (
            <Pressable
              style={[styles.connectButton, { backgroundColor: theme.success }, isProcessing && styles.buttonDisabled]}
              onPress={handleConnect}
              disabled={isProcessing}
              accessibilityRole="button"
              accessibilityLabel="Connect Spotify account"
            >
              {isProcessing ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <ThemedText style={styles.buttonText}>Connect Spotify</ThemedText>
              )}
            </Pressable>
          )}
        </View>

        {/* Token info */}
        <View style={[styles.statusCard, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="small" themeColor="textSecondary">
            Spotify access tokens expire after 1 hour. Cadence automatically refreshes them using the stored refresh token. If you revoke access from your Spotify account settings, you'll need to reconnect here.
          </ThemedText>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  section: {
    gap: Spacing.two,
  },
  errorContainer: {
    padding: Spacing.two,
    borderRadius: Radii.medium,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
  warningContainer: {
    padding: Spacing.two,
    borderRadius: Radii.medium,
    marginBottom: Spacing.two,
  },
  warningText: {
    fontSize: 14,
    textAlign: 'center',
  },
  statusCard: {
    padding: Spacing.three,
    borderRadius: Radii.medium,
    gap: Spacing.two,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusLabel: {
    fontWeight: '600',
    fontSize: 14,
  },
  statusConnected: {
    fontWeight: '600',
  },
  statusDisconnected: {},
  scopesSection: {
    gap: Spacing.one,
  },
  scopesText: {
    marginTop: 2,
  },
  connectButton: {
    borderRadius: Radii.medium,
    padding: Spacing.two + 4,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  disconnectButton: {
    borderRadius: Radii.medium,
    padding: Spacing.two + 4,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
