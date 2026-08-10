/**
 * PlaylistCard - Spotify-style embedded card for displaying playlist links.
 *
 * Designed to mimic Spotify's link preview cards as seen in messaging apps:
 * large artwork, dark background, playlist title, and Spotify branding.
 * The entire card is tappable to open the playlist in Spotify.
 *
 * Requirements: 2.1–2.9, 5.1–5.4, 6.1–6.3
 */
import { Image } from 'expo-image';
import * as Linking from 'expo-linking';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import type { PlaylistCardData } from '@/types/spotify';

// Spotify brand green for the icon dot
const SPOTIFY_GREEN = '#1DB954';
// Dark card background matching Spotify's embed style
const CARD_BG = '#282828';
const CARD_BG_PRESSED = '#333333';

interface PlaylistCardProps {
  data: PlaylistCardData;
}

export function PlaylistCard({ data }: PlaylistCardProps) {
  const { name, description, trackCount, externalUrl, imageUrl } = data;

  const handlePress = () => {
    if (externalUrl) {
      Linking.openURL(externalUrl);
    }
  };

  const subtitle = trackCount > 0
    ? `Playlist · ${trackCount} tracks`
    : 'Playlist · Spotify';

  return (
    <Pressable
      onPress={handlePress}
      disabled={!externalUrl}
      style={({ pressed }) => [
        styles.container,
        pressed && { backgroundColor: CARD_BG_PRESSED },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`Open ${name} in Spotify`}
    >
      {/* Artwork */}
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.artwork}
          contentFit="cover"
          accessibilityLabel={`${name} cover art`}
        />
      ) : (
        <View style={styles.artworkPlaceholder} accessibilityLabel={`${name} cover art`}>
          <ThemedText style={styles.placeholderIcon}>♫</ThemedText>
        </View>
      )}

      {/* Info bar */}
      <View style={styles.infoBar}>
        <View style={styles.textContent}>
          <ThemedText style={styles.title} numberOfLines={1}>
            {name}
          </ThemedText>
          {description.length > 0 ? (
            <ThemedText style={styles.subtitle} numberOfLines={1}>
              {description}
            </ThemedText>
          ) : (
            <ThemedText style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </ThemedText>
          )}
        </View>

        {/* Spotify branding indicator */}
        <View style={styles.spotifyBadge}>
          <View style={styles.spotifyDot} />
          <ThemedText style={styles.spotifyLabel}>Spotify</ThemedText>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: CARD_BG,
    borderRadius: Radii.large,
    overflow: 'hidden',
    width: '100%',
  },
  artwork: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#1a1a1a',
  },
  artworkPlaceholder: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderIcon: {
    fontSize: 48,
    color: '#535353',
  },
  infoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.twoHalf,
    gap: Spacing.two,
  },
  textContent: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
    lineHeight: 18,
  },
  subtitle: {
    color: '#a7a7a7',
    fontSize: 12,
    lineHeight: 16,
  },
  spotifyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  spotifyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: SPOTIFY_GREEN,
  },
  spotifyLabel: {
    color: '#a7a7a7',
    fontSize: 11,
    fontWeight: '500',
  },
});
