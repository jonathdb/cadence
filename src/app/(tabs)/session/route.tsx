/**
 * Live route tracking screen.
 * Displays GPS tracking status, elapsed time, current distance.
 * Provides start/stop controls and shows route summary on completion.
 *
 * Requirements: 30.1, 30.2
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/providers/AuthProvider';
import {
    getRouteTrackingStatus,
    startRouteTracking,
    stopRouteTracking
} from '@/services/route-tracking';

type TrackingPhase = 'idle' | 'tracking' | 'completed';

interface RouteSummary {
  distanceMeters: number;
  durationSeconds: number;
  avgPaceSecondsPerKm: number;
  avgSpeedKmh: number;
  elevationGainMeters: number | null;
}

/**
 * Format seconds into a human-readable duration string (e.g., "1h 23m 05s").
 */
function formatDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${minutes}:${pad(seconds)}`;
}

/**
 * Format distance in meters to a readable string (km or m).
 */
function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${Math.round(meters)} m`;
}

/**
 * Format pace (seconds per km) to a readable string (e.g., "5:30 /km").
 */
function formatPace(secondsPerKm: number): string {
  if (secondsPerKm <= 0) return '—';
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')} /km`;
}

/**
 * Format speed (km/h) to a readable string.
 */
function formatSpeed(kmh: number): string {
  if (kmh <= 0) return '—';
  return `${kmh.toFixed(1)} km/h`;
}

export default function RouteTrackingScreen() {
  const { session } = useAuth();
  const userId = session?.user?.id;

  const [phase, setPhase] = useState<TrackingPhase>('idle');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [currentDistance, setCurrentDistance] = useState(0);
  const [pointCount, setPointCount] = useState(0);
  const [summary, setSummary] = useState<RouteSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll tracking status while actively tracking
  useEffect(() => {
    if (phase === 'tracking') {
      pollIntervalRef.current = setInterval(() => {
        const status = getRouteTrackingStatus();
        if (status.isTracking) {
          setElapsedSeconds(status.elapsedSeconds);
          setCurrentDistance(status.currentDistance);
          setPointCount(status.pointCount);
        }
      }, 1000);
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [phase]);

  // Check if tracking is already active on mount
  useEffect(() => {
    const status = getRouteTrackingStatus();
    if (status.isTracking) {
      setPhase('tracking');
      setElapsedSeconds(status.elapsedSeconds);
      setCurrentDistance(status.currentDistance);
      setPointCount(status.pointCount);
    }
  }, []);

  const handleStart = useCallback(async () => {
    if (!userId) {
      setError('You must be signed in to track a route.');
      return;
    }

    setError(null);
    const result = await startRouteTracking(userId);

    if (result.success) {
      setPhase('tracking');
      setElapsedSeconds(0);
      setCurrentDistance(0);
      setPointCount(0);
    } else {
      setError(result.error ?? 'Failed to start route tracking.');
    }
  }, [userId]);

  const handleStop = useCallback(async () => {
    Alert.alert(
      'Stop Tracking',
      'Are you sure you want to stop recording your route?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop',
          style: 'destructive',
          onPress: async () => {
            const result = await stopRouteTracking();

            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }

            if (result.success) {
              // Compute final stats from the last known values
              const finalDuration = elapsedSeconds;
              const finalDistance = currentDistance;
              const distanceKm = finalDistance / 1000;
              const avgSpeedKmh = finalDuration > 0
                ? (distanceKm / finalDuration) * 3600
                : 0;
              const avgPaceSecondsPerKm = distanceKm > 0
                ? finalDuration / distanceKm
                : 0;

              setSummary({
                distanceMeters: finalDistance,
                durationSeconds: finalDuration,
                avgPaceSecondsPerKm,
                avgSpeedKmh,
                elevationGainMeters: null, // Elevation computed server-side on save
              });
              setPhase('completed');
            } else {
              setError(result.error ?? 'Failed to stop route tracking.');
              setPhase('idle');
            }
          },
        },
      ],
    );
  }, [elapsedSeconds, currentDistance]);

  const handleReset = useCallback(() => {
    setPhase('idle');
    setSummary(null);
    setElapsedSeconds(0);
    setCurrentDistance(0);
    setPointCount(0);
    setError(null);
  }, []);

  // Idle state — show start button
  if (phase === 'idle') {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.centered}>
          <ThemedText type="subtitle" style={styles.title}>
            Track Route
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.description}>
            Record your running or walking route with GPS tracking.
          </ThemedText>

          {error && (
            <View style={styles.errorContainer}>
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            </View>
          )}

          <Pressable
            style={styles.startButton}
            onPress={handleStart}
            accessibilityRole="button"
            accessibilityLabel="Start route tracking"
          >
            <ThemedText style={styles.startButtonText}>Start Tracking</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  // Tracking state — show live stats
  if (phase === 'tracking') {
    return (
      <ThemedView style={styles.container}>
        <View style={styles.centered}>
          <View style={styles.trackingIndicator}>
            <View style={styles.trackingDot} />
            <ThemedText style={styles.trackingLabel}>Recording</ThemedText>
          </View>

          <ThemedText style={styles.timer}>{formatDuration(elapsedSeconds)}</ThemedText>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <ThemedText type="small" themeColor="textSecondary">
                Distance
              </ThemedText>
              <ThemedText style={styles.statValue}>{formatDistance(currentDistance)}</ThemedText>
            </View>

            <View style={styles.statItem}>
              <ThemedText type="small" themeColor="textSecondary">
                Points
              </ThemedText>
              <ThemedText style={styles.statValue}>{pointCount}</ThemedText>
            </View>
          </View>

          {error && (
            <View style={styles.errorContainer}>
              <ThemedText style={styles.errorText}>{error}</ThemedText>
            </View>
          )}

          <Pressable
            style={styles.stopButton}
            onPress={handleStop}
            accessibilityRole="button"
            accessibilityLabel="Stop route tracking"
          >
            <ThemedText style={styles.stopButtonText}>Stop Tracking</ThemedText>
          </Pressable>
        </View>
      </ThemedView>
    );
  }

  // Completed state — show route summary
  return (
    <ThemedView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <ThemedText type="subtitle" style={styles.title}>
            Route Complete 🏃
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Here's your route summary.
          </ThemedText>
        </View>

        {summary && (
          <View style={styles.summaryGrid}>
            <View style={styles.summaryCard}>
              <ThemedText type="small" themeColor="textSecondary">
                Distance
              </ThemedText>
              <ThemedText style={styles.summaryValue}>
                {formatDistance(summary.distanceMeters)}
              </ThemedText>
            </View>

            <View style={styles.summaryCard}>
              <ThemedText type="small" themeColor="textSecondary">
                Duration
              </ThemedText>
              <ThemedText style={styles.summaryValue}>
                {formatDuration(summary.durationSeconds)}
              </ThemedText>
            </View>

            <View style={styles.summaryCard}>
              <ThemedText type="small" themeColor="textSecondary">
                Avg Pace
              </ThemedText>
              <ThemedText style={styles.summaryValue}>
                {formatPace(summary.avgPaceSecondsPerKm)}
              </ThemedText>
            </View>

            <View style={styles.summaryCard}>
              <ThemedText type="small" themeColor="textSecondary">
                Avg Speed
              </ThemedText>
              <ThemedText style={styles.summaryValue}>
                {formatSpeed(summary.avgSpeedKmh)}
              </ThemedText>
            </View>

            {summary.elevationGainMeters != null && (
              <View style={styles.summaryCard}>
                <ThemedText type="small" themeColor="textSecondary">
                  Elevation Gain
                </ThemedText>
                <ThemedText style={styles.summaryValue}>
                  {Math.round(summary.elevationGainMeters)} m
                </ThemedText>
              </View>
            )}
          </View>
        )}

        <Pressable
          style={styles.doneButton}
          onPress={handleReset}
          accessibilityRole="button"
          accessibilityLabel="Start a new route"
        >
          <ThemedText style={styles.doneButtonText}>Track Another Route</ThemedText>
        </Pressable>
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
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  scrollContent: {
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.four,
  },
  header: {
    gap: Spacing.one,
    alignItems: 'center',
    paddingTop: Spacing.three,
  },
  title: {
    fontSize: 22,
  },
  description: {
    textAlign: 'center',
    lineHeight: 20,
  },
  errorContainer: {
    backgroundColor: '#fef2f2',
    borderRadius: 8,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    textAlign: 'center',
  },
  // Tracking indicator
  trackingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  trackingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#22c55e',
  },
  trackingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#22c55e',
  },
  // Timer display
  timer: {
    fontSize: 48,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  // Live stats
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.five,
  },
  statItem: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
  },
  // Buttons
  startButton: {
    backgroundColor: '#22c55e',
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: Spacing.five,
    width: '100%',
    alignItems: 'center',
  },
  startButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  stopButton: {
    backgroundColor: '#ef4444',
    borderRadius: 10,
    paddingVertical: 16,
    paddingHorizontal: Spacing.five,
    width: '100%',
    alignItems: 'center',
  },
  stopButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  doneButton: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  // Summary grid
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  summaryCard: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: '#f3f4f6',
    borderRadius: 12,
    padding: Spacing.three,
    alignItems: 'center',
    gap: Spacing.one,
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: '700',
  },
});
