/**
 * PlaylistCardList - Vertical stack of PlaylistCard components.
 *
 * Renders a list of playlist cards with consistent spacing.
 * Returns null for empty arrays to avoid rendering an empty container.
 *
 * Requirements: 3.3, 3.4
 */
import { StyleSheet, View } from 'react-native';

import { PlaylistCard } from '@/components/PlaylistCard';
import { Spacing } from '@/constants/theme';
import type { PlaylistCardData } from '@/types/spotify';

interface PlaylistCardListProps {
  playlists: PlaylistCardData[];
}

export function PlaylistCardList({ playlists }: PlaylistCardListProps) {
  if (playlists.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      {playlists.map((playlist) => (
        <PlaylistCard key={playlist.id} data={playlist} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
    maxWidth: 280,
  },
});
