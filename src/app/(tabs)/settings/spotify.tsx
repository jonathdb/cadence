/**
 * Spotify connect/disconnect screen.
 * Shows connection status and allows users to connect or disconnect Spotify.
 * Uses the spotify auth service.
 *
 * Requirements: 25.1
 */
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/providers/AuthProvider';
import {
    connectSpotify,
    disconnectSpotify,
    getSpotifyConnectionStatus,
} from '@/services/spotify';

export default function SpotifyScreen() {
  const { session } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [scopes, setScopes] = useState<string[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    if (!session?.user.id) return;

    try {
      const status = await getSpotifyConnectionStatus(session.user.id);
      setIsConnected(status.connected);
      setScopes(status.scopes);
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
        setScopes(result.scopes);
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

    Alert.alert(
      'Disconnect Spotify',
      'This will revoke access and remove stored tokens. The Agent will no longer be able to manage playlists.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            setIsProcessing(true);
            setError(null);

            try {
              await disconnectSpotify(session.user.id);
              setIsConnected(false);
              setScopes(null);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Failed to disconnect Spotify');
            } finally {
              setIsProcessing(false);
            }
          },
        },
      ]
    );
  }

  if (isLoading) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator size="large" />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.section}>
          <ThemedText type="small" themeColor="textSecondary">
            Connect your Spotify account to let the Agent search, create, and modify playlists
            for your training sessions.
          </ThemedText>
        </View>

        {error && (
          <View style={styles.errorContainer}>
            <ThemedText style={styles.errorText}>{error}</ThemedText>
          </View>
        )}

        {/* Connection Status */}
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <ThemedText style={styles.statusLabel}>Status</ThemedText>
            <ThemedText style={isConnected ? styles.statusConnected : styles.statusDisconnected}>
              {isConnected ? 'Connected' : 'Not connected'}
            </ThemedText>
          </View>

          {isConnected && scopes && scopes.length > 0 && (
            <View style={styles.statusRow}>
              <ThemedText style={styles.statusLabel}>Scopes</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {scopes.join(', ')}
              </ThemedText>
            </View>
          )}
        </View>

        {/* Action Button */}
        <View style={styles.section}>
          {isConnected ? (
            <Pressable
              style={[styles.disconnectButton, isProcessing && styles.buttonDisabled]}
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
              style={[styles.connectButton, isProcessing && styles.buttonDisabled]}
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
    backgroundColor: '#fee2e2',
    padding: Spacing.two,
    borderRadius: 8,
  },
  errorText: {
    fontSize: 14,
    color: '#dc2626',
    textAlign: 'center',
  },
  statusCard: {
    padding: Spacing.three,
    borderRadius: 8,
    backgroundColor: 'rgba(128, 128, 128, 0.1)',
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
    color: '#16a34a',
    fontWeight: '600',
  },
  statusDisconnected: {
    color: '#6b7280',
  },
  connectButton: {
    backgroundColor: '#1DB954',
    borderRadius: 8,
    padding: Spacing.two + 4,
    alignItems: 'center',
  },
  disconnectButton: {
    backgroundColor: '#ef4444',
    borderRadius: 8,
    padding: Spacing.two + 4,
    alignItems: 'center',
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
