# Design Document: Spotify Playlist Cards

## Overview

This feature adds rich, visually polished Spotify playlist cards to the Cadence chat interface. When the AI agent returns results from `spotify_search_playlist`, `spotify_suggest_pace_playlist`, or `spotify_create_playlist` tools, the chat renders inline card components showing playlist artwork, name, description, track count, and a button to open in Spotify.

The implementation touches three layers:

1. **Backend enrichment** — Spotify tool handlers extract `image_url` from the API response and include it in their return payloads.
2. **Presentational components** — A new `PlaylistCard` component and a `PlaylistCardList` wrapper render playlist data following the existing design system.
3. **Chat integration** — The chat renderer detects completed Spotify retrieval tool results and renders playlist cards inline in the message flow.

### Design Decisions

- **Inline rendering via tool result detection**: Rather than modifying the `DisplayMessage` type structure, we detect Spotify tool results attached to assistant messages and render cards alongside the text content. This mirrors the existing `ProgramProposal` pattern but for read-only results.
- **Vertical card stack (not horizontal scroll)**: Cards render in a vertical list with spacing, consistent with the chat's vertical flow. Horizontal scrolling would conflict with the chat's scroll direction.
- **Shared data extraction utility**: A pure `extractPlaylistCardData` function normalizes the different tool result shapes (search/suggest vs. create) into a common `PlaylistCardData` interface. This keeps rendering logic simple and testable.
- **Fallback placeholder for missing artwork**: Uses a themed background with a music note icon rather than leaving a blank space or showing a broken image indicator.

## Architecture

```mermaid
graph TD
    subgraph Backend [Supabase Edge Functions]
        TH[Tool Handlers] -->|includes image_url| TR[Tool Result JSON]
    end

    subgraph Frontend [React Native / Expo]
        CR[Chat Renderer] -->|detects spotify tool results| EX[extractPlaylistCardData]
        EX -->|PlaylistCardData[]| PCL[PlaylistCardList]
        PCL -->|maps| PC[PlaylistCard]
        PC -->|opens URL| LK[expo-linking]
        PC -->|renders image| EI[expo-image]
    end

    TR -->|SSE stream → follow-up response| CR
```

### Data Flow

1. User sends a message → AI responds with a Spotify tool call
2. Chat auto-executes the retrieval tool via `execute-tool-call` edge function
3. Tool handler calls Spotify API, extracts `image_url` from `item.images[0].url`, returns enriched JSON
4. Tool result is sent back to AI for follow-up response
5. Follow-up assistant message is rendered in chat
6. During rendering, the chat detects that the preceding tool call was a Spotify tool with results
7. `extractPlaylistCardData` normalizes the tool result into `PlaylistCardData[]`
8. `PlaylistCardList` renders the cards below the assistant's text content

## Components and Interfaces

### PlaylistCard

**Location:** `src/components/PlaylistCard.tsx`

A single card displaying one playlist's information.

```typescript
interface PlaylistCardProps {
  data: PlaylistCardData;
}
```

**Visual structure:**
- Outer container: `backgroundElevated`, 1px `border`, `Radii.large`, internal padding `Spacing.three`
- Row layout: image on the left, text content on the right
- Image: 64×64px, `Radii.medium` border radius, placeholder if null
- Text stack: name (bold, 1 line ellipsis), description (textSecondary, 2 lines), track count (textTertiary)
- "Open in Spotify" button: accent color, `TouchTarget.minimum` height, conditionally hidden

### PlaylistCardList

**Location:** `src/components/PlaylistCardList.tsx`

A vertical stack of `PlaylistCard` components with `Spacing.two` gap.

```typescript
interface PlaylistCardListProps {
  playlists: PlaylistCardData[];
}
```

Renders nothing if the array is empty.

### extractPlaylistCardData

**Location:** `src/utils/extract-playlist-card-data.ts`

A pure function that normalizes different Spotify tool result shapes into a uniform array.

```typescript
function extractPlaylistCardData(
  toolName: string,
  toolResult: unknown
): PlaylistCardData[]
```

**Behavior:**
- For `spotify_search_playlist` / `spotify_suggest_pace_playlist`: maps `result.playlists` array
- For `spotify_create_playlist`: wraps single result into array of one
- Returns empty array for unrecognized shapes or missing data

### Chat Integration Changes

**Location:** `src/app/(tabs)/chat/index.tsx`

In the `renderItem` callback, after rendering the assistant text bubble and before/after the existing `ProgramProposal` section, detect completed Spotify retrieval tool results and render `PlaylistCardList`.

The detection logic:
1. Check if the message has `toolCalls` containing a Spotify tool name
2. Check if the tool call has associated result data (stored during auto-execution)
3. Extract and render cards

**Approach for storing tool results:** Extend `ToolCallData` with an optional `result?: string` field that gets populated after auto-execution completes. This is populated in `autoExecuteRetrievalTools` when a successful response returns.

## Data Models

### PlaylistCardData

The normalized data interface consumed by the card components:

```typescript
interface PlaylistCardData {
  /** Spotify playlist ID */
  id: string;
  /** Playlist display name */
  name: string;
  /** Playlist description (may be empty string) */
  description: string;
  /** Number of tracks in the playlist */
  trackCount: number;
  /** URL to open in Spotify app/web */
  externalUrl: string | null;
  /** Cover art image URL (first image from Spotify API) */
  imageUrl: string | null;
}
```

### Extended ToolCallData

```typescript
interface ToolCallData {
  id: string;
  name: string;
  arguments: string;
  status: 'pending_approval' | 'approved' | 'auto_applied' | 'rejected';
  /** Raw JSON result string from tool execution (populated for auto-executed retrieval tools) */
  result?: string;
}
```

### Enriched Tool Result Shapes

**spotify_search_playlist result (after enrichment):**
```typescript
{
  playlists: Array<{
    id: string;
    name: string;
    description: string;
    tracks_total: number;
    external_url: string | null;
    image_url: string | null;  // NEW
  }>;
}
```

**spotify_suggest_pace_playlist result (after enrichment):**
```typescript
{
  activity_type: string;
  target_bpm_range: { min: number; max: number; label: string };
  effective_pace_seconds_per_km: number | null;
  source: string;
  playlists: Array<{
    id: string;
    name: string;
    description: string;
    tracks_total: number;
    external_url: string | null;
    image_url: string | null;  // NEW
  }>;
}
```

**spotify_create_playlist result (after enrichment):**
```typescript
{
  playlist_id: string;
  name: string;
  external_url: string | null;
  tracks_added: number;
  image_url: string | null;  // NEW
}
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Image URL extraction correctness

*For any* Spotify API playlist item object, if the `images` array is non-empty, the extracted `image_url` SHALL equal `images[0].url`; if the `images` array is empty or missing, the extracted `image_url` SHALL be `null`.

**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: extractPlaylistCardData preserves playlist count and data for search/suggest results

*For any* valid `spotify_search_playlist` or `spotify_suggest_pace_playlist` tool result containing N playlists (N ≥ 0), `extractPlaylistCardData` SHALL return an array of exactly N `PlaylistCardData` items, where each item's `id`, `name`, `description`, `trackCount`, `externalUrl`, and `imageUrl` fields correspond to the respective source playlist's `id`, `name`, `description`, `tracks_total`, `external_url`, and `image_url` fields.

**Validates: Requirements 3.1, 3.2, 3.4**

### Property 3: extractPlaylistCardData produces exactly one card for create results

*For any* valid `spotify_create_playlist` tool result, `extractPlaylistCardData` SHALL return an array of exactly 1 `PlaylistCardData` item, where the item's `name` equals the result's `name`, `trackCount` equals `tracks_added`, `externalUrl` equals `external_url`, and `imageUrl` equals `image_url`.

**Validates: Requirements 4.1, 4.2, 4.3, 4.4**

### Property 4: Open in Spotify button visibility tied to externalUrl

*For any* `PlaylistCardData` where `externalUrl` is `null` or an empty string, the PlaylistCard component SHALL not render the "Open in Spotify" button. Conversely, for any `PlaylistCardData` where `externalUrl` is a non-empty string, the button SHALL be rendered.

**Validates: Requirements 2.6, 2.7**

### Property 5: Track count formatting

*For any* non-negative integer N used as `trackCount`, the displayed text SHALL be the string `"{N} tracks"` (e.g., `"0 tracks"`, `"1 tracks"`, `"50 tracks"`).

**Validates: Requirements 2.5, 4.3**

### Property 6: Accessibility labels include playlist name

*For any* `PlaylistCardData` with a `name` field, the "Open in Spotify" button's `accessibilityLabel` SHALL equal `"Open {name} in Spotify"` and the image's `accessibilityLabel` SHALL equal `"{name} cover art"`.

**Validates: Requirements 6.1, 6.2**

## Error Handling

| Scenario | Handling Strategy |
|----------|-------------------|
| Spotify API returns no `images` array on a playlist item | Tool handler sets `image_url: null`; card renders placeholder |
| `external_url` is null or empty | "Open in Spotify" button is hidden; no broken link |
| Tool result JSON is malformed or unexpected shape | `extractPlaylistCardData` returns empty array; no cards rendered |
| Image fails to load at runtime (network error) | `expo-image` handles gracefully with its built-in error state; placeholder shown via `placeholder` prop or `onError` fallback |
| Tool execution fails (HTTP error from edge function) | Tool result content contains `{ error: "..." }`; `extractPlaylistCardData` returns empty array (no `playlists` field found) |
| Empty playlists array in result | `PlaylistCardList` renders nothing (returns null) |
| Very long playlist name or description | Truncated via `numberOfLines` prop (1 for name, 2 for description) with ellipsis |

## Testing Strategy

### Property-Based Tests (fast-check)

The project already uses `fast-check` (v4.9.0) with Vitest. Property tests will target the pure logic layer:

**Library:** `fast-check` (already in devDependencies)
**Configuration:** Minimum 100 iterations per property (`{ numRuns: 100 }`)
**File location:** `tests/spotify-playlist-cards/extract-playlist-card-data.prop.ts`
**Tag format:** `Feature: spotify-playlist-cards, Property {N}: {title}`

Properties to implement:
1. Image URL extraction correctness — generate random Spotify API item shapes
2. Search/suggest data preservation — generate arrays of playlist objects, verify round-trip through extraction
3. Create result produces single card — generate random create results
4. Button visibility logic — generate PlaylistCardData with null/empty/valid URLs
5. Track count formatting — generate random non-negative integers
6. Accessibility label correctness — generate random playlist names

### Unit Tests (Example-Based)

**File location:** `tests/spotify-playlist-cards/playlist-card.test.ts`

Cover specific examples and rendering behavior:
- PlaylistCard renders image at 64×64 with Radii.medium
- PlaylistCard shows placeholder when imageUrl is null
- PlaylistCard name is bold, single line
- PlaylistCard description is textSecondary, two lines max
- PlaylistCard container uses backgroundElevated, 1px border, Radii.large
- PlaylistCard button has minHeight matching TouchTarget.minimum
- PlaylistCard container has accessibilityRole="summary"
- PlaylistCardList renders nothing for empty array
- PlaylistCardList renders correct number of cards
- PlaylistCardList uses Spacing.two gap between cards

### Integration Tests

**File location:** `tests/spotify-playlist-cards/chat-integration.test.ts`

- Chat renderer renders PlaylistCardList when assistant message has spotify_search_playlist tool result
- Chat renderer renders single PlaylistCard when assistant message has spotify_create_playlist tool result
- Chat renderer does not render cards when tool result has error
- "Open in Spotify" button calls Linking.openURL with correct URL

### Backend Unit Tests

**File location:** `supabase/functions/_shared/spotify-image-extraction.test.ts`

- Tool handler includes image_url from first image in Spotify API response
- Tool handler sets image_url to null when images array is empty
- Tool handler sets image_url to null when images field is missing

