/**
 * ExerciseMedia — renders an exercise's demonstration media (Requirement 2.4, 2.5, 2.7).
 *
 * Consumes the pure `ExerciseMediaViewModel[]` produced by
 * `src/services/exercise-display.ts` (ordered by `orderIndex`, with `url`
 * already resolved to a public URL or `null`). This component is display-only:
 * it never fetches or normalizes data itself.
 *
 * Behaviour (per Design §2d + Error Handling: media load failure / offline):
 *  - Uses `expo-image` (SDK 57) with a `placeholder` (blurhash) and an `onError`
 *    handler that falls back to a placeholder view when the image fails to load
 *    or is unavailable (Req 2.5).
 *  - Lazy: `expo-image` fetches on mount; the text-first detail view (task 4.6)
 *    has already painted, so text is never blocked by media (Req 2.3 is the
 *    detail view's concern — this component only avoids crashing).
 *  - Offline: the default `cachePolicy: 'disk'` serves previously viewed media
 *    from the disk cache; otherwise the placeholder view shows and nothing is
 *    thrown (Req 2.7).
 *  - A `null` url (media row with no resolved public URL) renders the placeholder
 *    directly without ever mounting an <Image> — it never crashes (Req 2.6/2.7).
 *  - `kind === 'image'` renders a still image; `kind === 'gif'` renders an
 *    animated GIF (expo-image animates GIF/WebP by default via `autoplay`).
 *    `kind === 'video'` shows a placeholder for now — real video playback is a
 *    future task (see spec Deferred / Future; free-exercise-db ships still images).
 *
 * _Design: Components §2d; Error Handling (media load failure/offline)._
 * _Requirements: 2.4, 2.5, 2.7._
 */
import { Image, type ImageErrorEventData } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radii, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ExerciseMediaViewModel } from '@/services/exercise-display';

/**
 * A lightweight blurhash used as the loading placeholder for still images.
 * Rendered by expo-image before the source resolves; keeps the layout stable
 * and avoids a flash of empty space. (Generic neutral gradient.)
 */
const PLACEHOLDER_BLURHASH = 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';

/** Media kinds this component can render as an actual image. */
const IMAGE_KINDS = new Set(['image', 'gif']);

export interface ExerciseMediaProps {
  /**
   * The ordered media list from `normalizeExerciseForDisplay(...).media`, or a
   * single item. When empty/omitted, a single placeholder is rendered so the
   * detail view always has a stable visual slot.
   */
  media?: ExerciseMediaViewModel[] | ExerciseMediaViewModel | null;
  /** Accessible label prefix (e.g. the exercise name) for screen readers. */
  exerciseName?: string;
}

/**
 * Placeholder shown when media is unavailable, fails to load, or is a kind we
 * cannot render yet (video). Never throws; renders pure theme-driven markup.
 */
function MediaPlaceholder({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.item,
        styles.placeholder,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}
      accessibilityRole="image"
      accessibilityLabel={label}
    >
      <ThemedText style={[styles.placeholderGlyph, { color: theme.textTertiary }]}>
        {'\u{1F3CB}'}
      </ThemedText>
      <ThemedText
        style={[styles.placeholderText, { color: theme.textTertiary }]}
        numberOfLines={2}
      >
        No demonstration available
      </ThemedText>
    </View>
  );
}

/** Renders a single media item, falling back to a placeholder on error/null. */
function MediaItem({
  item,
  exerciseName,
}: {
  item: ExerciseMediaViewModel;
  exerciseName?: string;
}) {
  const theme = useTheme();
  const [failed, setFailed] = useState(false);

  const label = exerciseName
    ? `${exerciseName} demonstration`
    : 'Exercise demonstration';

  // Video is not yet playable in-app; still images (free-exercise-db) are the
  // current source. Show a placeholder for video and for any missing/failed url.
  const renderable = IMAGE_KINDS.has(item.kind) && item.url != null && !failed;

  if (!renderable) {
    return <MediaPlaceholder label={label} />;
  }

  const handleError = (_event: ImageErrorEventData) => {
    // Fall back to the placeholder view; never rethrow (Req 2.5, 2.7).
    setFailed(true);
  };

  return (
    <Image
      style={[
        styles.item,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
      ]}
      source={{ uri: item.url! }}
      // Blurhash placeholder while the disk/network source resolves.
      placeholder={{ blurhash: PLACEHOLDER_BLURHASH }}
      placeholderContentFit="cover"
      contentFit="cover"
      // Default 'disk' cache serves previously viewed media offline (Req 2.7).
      cachePolicy="disk"
      // Stable transition avoids a hard pop-in once the source resolves.
      transition={200}
      // Reset view content between differing sources (safe for list reuse).
      recyclingKey={item.id}
      onError={handleError}
      accessibilityLabel={label}
    />
  );
}

/**
 * Renders one or more exercise demonstration media items. Accepts the ordered
 * view-model list (or a single item). When there is no media, renders a single
 * placeholder so the layout stays stable and text is never blocked.
 */
export function ExerciseMedia({ media, exerciseName }: ExerciseMediaProps) {
  const items = normalizeMediaProp(media);

  if (items.length === 0) {
    return (
      <View style={styles.container}>
        <MediaPlaceholder
          label={
            exerciseName ? `${exerciseName} demonstration` : 'Exercise demonstration'
          }
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {items.map((item) => (
        <MediaItem key={item.id} item={item} exerciseName={exerciseName} />
      ))}
    </View>
  );
}

/** Coerce the flexible `media` prop into an array (never throws). */
function normalizeMediaProp(
  media: ExerciseMediaProps['media']
): ExerciseMediaViewModel[] {
  if (media == null) return [];
  return Array.isArray(media) ? media : [media];
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: Spacing.two,
  },
  item: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: Radii.large,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  placeholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
  },
  placeholderGlyph: {
    fontSize: 40,
  },
  placeholderText: {
    fontSize: 13,
    textAlign: 'center',
  },
});
