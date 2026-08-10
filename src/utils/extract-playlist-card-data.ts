import type { PlaylistCardData } from "@/types/spotify";

/**
 * Tool names that return a `playlists` array in their result.
 */
const SEARCH_SUGGEST_TOOLS = [
  "spotify_search_playlist",
  "spotify_suggest_pace_playlist",
] as const;

/**
 * Tool name that returns a single created playlist.
 */
const CREATE_TOOL = "spotify_create_playlist";

/**
 * Type guard: checks if the value is a non-null object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Type guard: checks if the result has an error field (indicating a failed tool call).
 */
function hasError(result: Record<string, unknown>): boolean {
  return "error" in result;
}

/**
 * Maps a single playlist item from search/suggest results into PlaylistCardData.
 */
function mapSearchPlaylistItem(item: unknown): PlaylistCardData | null {
  if (!isRecord(item)) return null;

  const id = typeof item.id === "string" ? item.id : "";
  if (!id) return null;

  return {
    id,
    name: typeof item.name === "string" ? item.name : "",
    description: typeof item.description === "string" ? item.description : "",
    trackCount:
      typeof item.tracks_total === "number" ? item.tracks_total : 0,
    externalUrl:
      typeof item.external_url === "string" ? item.external_url : null,
    imageUrl: typeof item.image_url === "string" ? item.image_url : null,
  };
}

/**
 * Maps a create playlist result into a single PlaylistCardData.
 */
function mapCreatePlaylistResult(
  result: Record<string, unknown>
): PlaylistCardData | null {
  const id =
    typeof result.playlist_id === "string" ? result.playlist_id : "";
  if (!id) return null;

  return {
    id,
    name: typeof result.name === "string" ? result.name : "",
    description: "",
    trackCount:
      typeof result.tracks_added === "number" ? result.tracks_added : 0,
    externalUrl:
      typeof result.external_url === "string" ? result.external_url : null,
    imageUrl: typeof result.image_url === "string" ? result.image_url : null,
  };
}

/**
 * Normalizes different Spotify tool result shapes into a uniform PlaylistCardData array.
 *
 * - For `spotify_search_playlist` / `spotify_suggest_pace_playlist`: maps `result.playlists` array
 * - For `spotify_create_playlist`: wraps single result into array of one
 * - Returns empty array for unrecognized shapes, missing data, or error results
 */
export function extractPlaylistCardData(
  toolName: string,
  toolResult: unknown
): PlaylistCardData[] {
  if (!isRecord(toolResult)) return [];
  if (hasError(toolResult)) return [];

  // Handle search/suggest tools
  if (
    SEARCH_SUGGEST_TOOLS.includes(
      toolName as (typeof SEARCH_SUGGEST_TOOLS)[number]
    )
  ) {
    const playlists = toolResult.playlists;
    if (!Array.isArray(playlists) || playlists.length === 0) return [];

    const mapped: PlaylistCardData[] = [];
    for (const item of playlists) {
      const card = mapSearchPlaylistItem(item);
      if (card) mapped.push(card);
    }
    return mapped;
  }

  // Handle create tool
  if (toolName === CREATE_TOOL) {
    const card = mapCreatePlaylistResult(toolResult);
    return card ? [card] : [];
  }

  // Unrecognized tool name
  return [];
}
