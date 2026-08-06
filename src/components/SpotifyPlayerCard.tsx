/**
 * SpotifyPlayerCard - Compact session music player with expandable playlist queue.
 *
 * Displays a compact card with current track name, artist, and playback controls
 * (play/pause, skip). Expands to show the playlist queue and allows playlist selection
 * from the user's library or Agent-suggested playlists.
 *
 * Only renders when Spotify is connected and session is active (Req 27.4).
 * Offers to resume previously used playlist for program day (Req 27.5).
 *
 * Requirements: 27.1, 27.2, 27.3, 27.4, 27.5
 */
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    StyleSheet,
    View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
    type SpotifyPlaylist,
    useSpotifyPlayer,
} from '@/hooks/useSpotifyPlayer';

// ─── Props ───────────────────────────────────────────────────────────────────

interface SpotifyPlayerCardProps {
  /** Program day ID for resume functionality. Null for freestyle sessions. */
  programDayId: string | null;
  /** Whether the session is currently active */
  sessionActive: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SpotifyPlayerCard({
  programDayId,
  sessionActive,
}: SpotifyPlayerCardProps) {
  const theme = useTheme();
  const {
    isConnected,
    isLoading,
    playback,
    playlists,
    suggestedPlaylists,
    previousPlaylist,
    isLoadingPlaylists,
    play,
    pause,
    skipNext,
    startPlaylist,
    fetchPlaylists,
  } = useSpotifyPlayer(programDayId, sessionActive);

  const [isExpanded, setIsExpanded] = useState(false);
  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  const [dismissedResume, setDismissedResume] = useState(false);

  // Fetch playlists when expanding to picker view
  useEffect(() => {
    if (showPlaylistPicker && playlists.length === 0) {
      fetchPlaylists();
    }
  }, [showPlaylistPicker, playlists.length, fetchPlaylists]);

  const handleToggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handlePlayPause = useCallback(async () => {
    if (playback?.isPlaying) {
      await pause();
    } else {
      await play();
    }
  }, [playback?.isPlaying, play, pause]);

  const handleSkip = useCallback(async () => {
    await skipNext();
  }, [skipNext]);

  const handleSelectPlaylist = useCallback(
    async (playlist: SpotifyPlaylist) => {
      await startPlaylist(playlist.id);
      setShowPlaylistPicker(false);
      setIsExpanded(false);
    },
    [startPlaylist]
  );

  const handleResumePlaylist = useCallback(async () => {
    if (previousPlaylist) {
      await startPlaylist(previousPlaylist.id);
      setDismissedResume(true);
    }
  }, [previousPlaylist, startPlaylist]);

  const handleDismissResume = useCallback(() => {
    setDismissedResume(true);
  }, []);

  // ─── Conditional rendering (Req 27.4) ───────────────────────────────────────

  // Don't render if not connected or session not active
  if (!sessionActive || isLoading || !isConnected) {
    return null;
  }

  // ─── Resume offer (Req 27.5) ───────────────────────────────────────────────

  const showResumeOffer = previousPlaylist && !dismissedResume && !playback?.currentTrack;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.backgroundElevated,
          borderColor: theme.border,
        },
      ]}
    >
      {/* Resume offer banner */}
      {showResumeOffer && (
        <View style={[styles.resumeBanner, { backgroundColor: theme.accentSoft }]}>
          <View style={styles.resumeContent}>
            <ThemedText style={[styles.resumeText, { color: theme.accent }]}>
              Resume "{previousPlaylist.name}"?
            </ThemedText>
          </View>
          <View style={styles.resumeActions}>
            <Pressable
              style={[styles.resumeButton, { backgroundColor: theme.accent }]}
              onPress={handleResumePlaylist}
              accessibilityRole="button"
              accessibilityLabel={`Resume playlist ${previousPlaylist.name}`}
            >
              <ThemedText style={styles.resumeButtonText}>Resume</ThemedText>
            </Pressable>
            <Pressable
              style={[styles.dismissButton, { borderColor: theme.border }]}
              onPress={handleDismissResume}
              accessibilityRole="button"
              accessibilityLabel="Dismiss playlist resume suggestion"
            >
              <ThemedText style={[styles.dismissButtonText, { color: theme.textSecondary }]}>
                ✕
              </ThemedText>
            </Pressable>
          </View>
        </View>
      )}

      {/* Compact player card (Req 27.1) */}
      <Pressable
        style={styles.compactCard}
        onPress={handleToggleExpand}
        accessibilityRole="button"
        accessibilityLabel={
          playback?.currentTrack
            ? `Now playing ${playback.currentTrack.name} by ${playback.currentTrack.artist}. Tap to ${isExpanded ? 'collapse' : 'expand'} playlist queue`
            : 'Spotify player. Tap to select a playlist'
        }
      >
        {/* Spotify branding indicator */}
        <View style={[styles.spotifyDot, { backgroundColor: '#1DB954' }]} />

        {/* Track info */}
        <View style={styles.trackInfo}>
          {playback?.currentTrack ? (
            <>
              <ThemedText
                style={[styles.trackName, { color: theme.text }]}
                numberOfLines={1}
              >
                {playback.currentTrack.name}
              </ThemedText>
              <ThemedText
                style={[styles.artistName, { color: theme.textSecondary }]}
                numberOfLines={1}
              >
                {playback.currentTrack.artist}
              </ThemedText>
            </>
          ) : (
            <ThemedText style={[styles.noTrack, { color: theme.textSecondary }]}>
              No track playing
            </ThemedText>
          )}
        </View>

        {/* Playback controls */}
        <View style={styles.controls}>
          <Pressable
            style={[styles.controlButton, { backgroundColor: theme.backgroundElement }]}
            onPress={handlePlayPause}
            accessibilityRole="button"
            accessibilityLabel={playback?.isPlaying ? 'Pause' : 'Play'}
            hitSlop={8}
          >
            <ThemedText style={[styles.controlIcon, { color: theme.text }]}>
              {playback?.isPlaying ? '⏸' : '▶'}
            </ThemedText>
          </Pressable>

          <Pressable
            style={[styles.controlButton, { backgroundColor: theme.backgroundElement }]}
            onPress={handleSkip}
            accessibilityRole="button"
            accessibilityLabel="Skip to next track"
            hitSlop={8}
          >
            <ThemedText style={[styles.controlIcon, { color: theme.text }]}>
              ⏭
            </ThemedText>
          </Pressable>
        </View>
      </Pressable>

      {/* Expanded playlist queue view (Req 27.2) */}
      {isExpanded && (
        <View style={[styles.expandedSection, { borderTopColor: theme.borderSubtle }]}>
          {/* Tab selector: Queue / Browse */}
          <View style={styles.tabRow}>
            <Pressable
              style={[
                styles.tab,
                !showPlaylistPicker && { borderBottomColor: theme.accent },
              ]}
              onPress={() => setShowPlaylistPicker(false)}
              accessibilityRole="tab"
              accessibilityLabel="View queue"
              accessibilityState={{ selected: !showPlaylistPicker }}
            >
              <ThemedText
                style={[
                  styles.tabText,
                  { color: !showPlaylistPicker ? theme.accent : theme.textSecondary },
                ]}
              >
                Queue
              </ThemedText>
            </Pressable>
            <Pressable
              style={[
                styles.tab,
                showPlaylistPicker && { borderBottomColor: theme.accent },
              ]}
              onPress={() => setShowPlaylistPicker(true)}
              accessibilityRole="tab"
              accessibilityLabel="Browse playlists"
              accessibilityState={{ selected: showPlaylistPicker }}
            >
              <ThemedText
                style={[
                  styles.tabText,
                  { color: showPlaylistPicker ? theme.accent : theme.textSecondary },
                ]}
              >
                Playlists
              </ThemedText>
            </Pressable>
          </View>

          {showPlaylistPicker ? (
            // Playlist picker (Req 27.3)
            <PlaylistPicker
              playlists={playlists}
              suggestedPlaylists={suggestedPlaylists}
              isLoading={isLoadingPlaylists}
              onSelect={handleSelectPlaylist}
            />
          ) : (
            // Queue view
            <QueueView playback={playback} />
          )}
        </View>
      )}
    </View>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function QueueView({ playback }: { playback: ReturnType<typeof useSpotifyPlayer>['playback'] }) {
  const theme = useTheme();

  if (!playback?.currentTrack) {
    return (
      <View style={styles.emptyState}>
        <ThemedText style={[styles.emptyText, { color: theme.textSecondary }]}>
          No track playing. Select a playlist to start.
        </ThemedText>
      </View>
    );
  }

  if (playback.queue.length === 0) {
    return (
      <View style={styles.emptyState}>
        <ThemedText style={[styles.emptyText, { color: theme.textSecondary }]}>
          Queue is playing from your selected playlist.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.queueList}>
      {playback.queue.slice(0, 5).map((track, index) => (
        <View
          key={`${track.id}-${index}`}
          style={[styles.queueItem, { borderBottomColor: theme.borderSubtle }]}
        >
          <ThemedText style={[styles.queueIndex, { color: theme.textTertiary }]}>
            {index + 1}
          </ThemedText>
          <View style={styles.queueTrackInfo}>
            <ThemedText
              style={[styles.queueTrackName, { color: theme.text }]}
              numberOfLines={1}
            >
              {track.name}
            </ThemedText>
            <ThemedText
              style={[styles.queueArtist, { color: theme.textSecondary }]}
              numberOfLines={1}
            >
              {track.artist}
            </ThemedText>
          </View>
        </View>
      ))}
    </View>
  );
}

function PlaylistPicker({
  playlists,
  suggestedPlaylists,
  isLoading,
  onSelect,
}: {
  playlists: SpotifyPlaylist[];
  suggestedPlaylists: SpotifyPlaylist[];
  isLoading: boolean;
  onSelect: (playlist: SpotifyPlaylist) => void;
}) {
  const theme = useTheme();

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator
          size="small"
          color={theme.accent}
          accessibilityLabel="Loading playlists"
        />
      </View>
    );
  }

  const sections = [
    ...(suggestedPlaylists.length > 0
      ? [{ title: 'Suggested', data: suggestedPlaylists }]
      : []),
    ...(playlists.length > 0
      ? [{ title: 'Your Library', data: playlists }]
      : []),
  ];

  if (sections.length === 0) {
    return (
      <View style={styles.emptyState}>
        <ThemedText style={[styles.emptyText, { color: theme.textSecondary }]}>
          No playlists found in your library.
        </ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.playlistPickerContainer}>
      {sections.map((section) => (
        <View key={section.title} style={styles.playlistSection}>
          <ThemedText style={[styles.sectionTitle, { color: theme.textSecondary }]}>
            {section.title}
          </ThemedText>
          <FlatList
            data={section.data}
            keyExtractor={(item) => item.id}
            scrollEnabled={false}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.playlistItem, { borderBottomColor: theme.borderSubtle }]}
                onPress={() => onSelect(item)}
                accessibilityRole="button"
                accessibilityLabel={`Play playlist ${item.name} by ${item.owner}, ${item.trackCount} tracks`}
              >
                <View
                  style={[
                    styles.playlistIcon,
                    { backgroundColor: theme.backgroundElement },
                  ]}
                >
                  <ThemedText style={[styles.playlistIconText, { color: theme.accent }]}>
                    ♫
                  </ThemedText>
                </View>
                <View style={styles.playlistInfo}>
                  <ThemedText
                    style={[styles.playlistName, { color: theme.text }]}
                    numberOfLines={1}
                  >
                    {item.name}
                  </ThemedText>
                  <ThemedText
                    style={[styles.playlistMeta, { color: theme.textSecondary }]}
                    numberOfLines={1}
                  >
                    {item.owner} · {item.trackCount} tracks
                  </ThemedText>
                </View>
              </Pressable>
            )}
          />
        </View>
      ))}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: Radii.large,
    overflow: 'hidden',
  },
  // Resume banner
  resumeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  resumeContent: {
    flex: 1,
    marginRight: Spacing.two,
  },
  resumeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  resumeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  resumeButton: {
    paddingHorizontal: Spacing.twoHalf,
    paddingVertical: Spacing.one + 2,
    borderRadius: Radii.small,
    minHeight: 32,
    justifyContent: 'center',
  },
  resumeButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  dismissButton: {
    width: 28,
    height: 28,
    borderRadius: Radii.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  // Compact card
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.twoHalf,
    gap: Spacing.two,
    minHeight: 56,
  },
  spotifyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  trackInfo: {
    flex: 1,
    gap: 1,
  },
  trackName: {
    fontSize: 14,
    fontWeight: '600',
  },
  artistName: {
    fontSize: 12,
  },
  noTrack: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
  },
  controlButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlIcon: {
    fontSize: 14,
  },
  // Expanded section
  expandedSection: {
    borderTopWidth: 1,
    paddingBottom: Spacing.two,
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
  },
  tab: {
    paddingVertical: Spacing.two,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
  },
  // Queue view
  queueList: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.one + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  queueIndex: {
    fontSize: 12,
    fontWeight: '600',
    width: 18,
    textAlign: 'center',
  },
  queueTrackInfo: {
    flex: 1,
    gap: 1,
  },
  queueTrackName: {
    fontSize: 13,
    fontWeight: '500',
  },
  queueArtist: {
    fontSize: 11,
  },
  // Empty state
  emptyState: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
  },
  // Loading
  loadingContainer: {
    paddingVertical: Spacing.four,
    alignItems: 'center',
  },
  // Playlist picker
  playlistPickerContainer: {
    paddingTop: Spacing.two,
    maxHeight: 300,
  },
  playlistSection: {
    gap: Spacing.one,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
  playlistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.two,
  },
  playlistIcon: {
    width: 36,
    height: 36,
    borderRadius: Radii.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playlistIconText: {
    fontSize: 16,
  },
  playlistInfo: {
    flex: 1,
    gap: 1,
  },
  playlistName: {
    fontSize: 14,
    fontWeight: '600',
  },
  playlistMeta: {
    fontSize: 11,
  },
});
