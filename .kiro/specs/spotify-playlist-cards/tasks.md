# Implementation Plan: Spotify Playlist Cards

## Overview

This plan implements rich Spotify playlist cards in the Cadence chat interface. The work spans backend enrichment (adding `image_url` to tool handler responses), a shared data extraction utility, presentational components (`PlaylistCard` and `PlaylistCardList`), and chat renderer integration. Tasks are ordered so that data layer changes land first, followed by the extraction utility, then UI components, and finally chat wiring.

## Tasks

- [ ] 1. Backend: Enrich Spotify tool handlers with image_url
  - [ ] 1.1 Add image_url extraction to spotify_search_playlist and spotify_suggest_pace_playlist handlers
    - In `supabase/functions/_shared/tool-handlers.ts`, update the handler functions for `spotify_search_playlist` and `spotify_suggest_pace_playlist` to extract `image_url` from each playlist item's `images` array (`images[0].url` if non-empty, otherwise `null`)
    - Include `image_url` in each playlist object in the returned Tool_Result JSON
    - _Requirements: 1.1, 1.2_

  - [ ] 1.2 Add image_url extraction to spotify_create_playlist handler
    - In `supabase/functions/_shared/tool-handlers.ts`, update the `spotify_create_playlist` handler to extract `image_url` from the created playlist's Spotify API response (`images[0].url` if available, otherwise `null`)
    - Include `image_url` in the returned Tool_Result JSON
    - _Requirements: 1.3_

  - [ ]* 1.3 Write unit tests for image_url extraction logic
    - Create `tests/unit/spotify-image-extraction.test.ts`
    - Test: handler includes image_url from first image when images array is non-empty
    - Test: handler sets image_url to null when images array is empty
    - Test: handler sets image_url to null when images field is missing
    - _Requirements: 1.1, 1.2, 1.3_

- [ ] 2. Data layer: PlaylistCardData interface and extraction utility
  - [ ] 2.1 Define PlaylistCardData interface
    - Create or extend `src/types/spotify.ts` with the `PlaylistCardData` interface containing: `id`, `name`, `description`, `trackCount`, `externalUrl`, `imageUrl`
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.6_

  - [ ] 2.2 Extend ToolCallData with optional result field
    - In `src/types/chat.ts`, add an optional `result?: string` field to the `ToolCallData` interface
    - This stores the raw JSON result from auto-executed retrieval tools
    - _Requirements: 3.1, 3.2, 4.1_

  - [ ] 2.3 Implement extractPlaylistCardData utility
    - Create `src/utils/extract-playlist-card-data.ts`
    - Implement `extractPlaylistCardData(toolName: string, toolResult: unknown): PlaylistCardData[]`
    - For `spotify_search_playlist` / `spotify_suggest_pace_playlist`: map `result.playlists` array into `PlaylistCardData[]`
    - For `spotify_create_playlist`: wrap single result into array of one `PlaylistCardData`
    - Return empty array for unrecognized shapes, missing data, or error results
    - _Requirements: 3.1, 3.2, 3.4, 4.1, 4.2, 4.3_

  - [ ]* 2.4 Write property tests for extractPlaylistCardData
    - **Property 2: extractPlaylistCardData preserves playlist count and data for search/suggest results**
    - **Validates: Requirements 3.1, 3.2, 3.4**
    - Create `tests/property/extract-playlist-card-data.prop.ts`
    - Use `fast-check` to generate random arrays of playlist objects and verify count and field mapping is preserved

  - [ ]* 2.5 Write property test for create result extraction
    - **Property 3: extractPlaylistCardData produces exactly one card for create results**
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**
    - In `tests/property/extract-playlist-card-data.prop.ts`, add property that generates random create results and verifies single-card output with correct field mapping

  - [ ]* 2.6 Write property test for image URL extraction correctness
    - **Property 1: Image URL extraction correctness**
    - **Validates: Requirements 1.1, 1.2, 1.3**
    - In `tests/property/extract-playlist-card-data.prop.ts`, add property that generates random Spotify API item shapes and verifies `imageUrl` is `images[0].url` when non-empty, or `null` otherwise

- [ ] 3. Checkpoint - Ensure data layer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. UI: PlaylistCard component
  - [ ] 4.1 Implement PlaylistCard component
    - Create `src/components/PlaylistCard.tsx`
    - Render outer container with `backgroundElevated`, 1px `border`, `Radii.large`, padding `Spacing.three`
    - Row layout: 64×64 image (Radii.medium border radius) on left, text stack on right
    - Use `expo-image` for the playlist artwork with placeholder fallback (themed music icon background) when `imageUrl` is null
    - Name: bold `ThemedText`, single line with ellipsis (`numberOfLines={1}`)
    - Description: `textSecondary` color, two lines with ellipsis (`numberOfLines={2}`)
    - Track count: `textTertiary` color, formatted as `"{trackCount} tracks"`
    - "Open in Spotify" button: accent color, `TouchTarget.minimum` height, hidden when `externalUrl` is null or empty
    - Button opens URL via `expo-linking` (`Linking.openURL`)
    - `accessibilityLabel` on button: `"Open {name} in Spotify"`
    - `accessibilityLabel` on image: `"{name} cover art"`
    - `accessibilityRole="summary"` on container
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 5.1, 5.2, 5.3, 5.4, 6.1, 6.2, 6.3_

  - [ ]* 4.2 Write property test for button visibility
    - **Property 4: Open in Spotify button visibility tied to externalUrl**
    - **Validates: Requirements 2.6, 2.7**
    - Create `tests/property/playlist-card.prop.ts`
    - Generate `PlaylistCardData` with null/empty/valid URLs and verify button render state

  - [ ]* 4.3 Write property test for track count formatting
    - **Property 5: Track count formatting**
    - **Validates: Requirements 2.5, 4.3**
    - In `tests/property/playlist-card.prop.ts`, generate random non-negative integers and verify displayed text is `"{N} tracks"`

  - [ ]* 4.4 Write property test for accessibility labels
    - **Property 6: Accessibility labels include playlist name**
    - **Validates: Requirements 6.1, 6.2**
    - In `tests/property/playlist-card.prop.ts`, generate random playlist names and verify button `accessibilityLabel` is `"Open {name} in Spotify"` and image `accessibilityLabel` is `"{name} cover art"`

  - [ ]* 4.5 Write unit tests for PlaylistCard rendering
    - Create `tests/unit/playlist-card.test.tsx`
    - Test: image renders at 64×64 with Radii.medium
    - Test: placeholder shown when imageUrl is null
    - Test: name is bold, single line
    - Test: description is textSecondary, two lines max
    - Test: container uses backgroundElevated, 1px border, Radii.large
    - Test: button has minHeight matching TouchTarget.minimum
    - Test: container has accessibilityRole="summary"
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.8, 5.3, 5.4, 6.3_

- [ ] 5. UI: PlaylistCardList component
  - [ ] 5.1 Implement PlaylistCardList component
    - Create `src/components/PlaylistCardList.tsx`
    - Accept `playlists: PlaylistCardData[]` prop
    - Render a vertical stack of `PlaylistCard` components with `Spacing.two` gap
    - Return `null` if the array is empty
    - _Requirements: 3.3, 3.4_

  - [ ]* 5.2 Write unit tests for PlaylistCardList
    - Create `tests/unit/playlist-card-list.test.tsx`
    - Test: renders nothing for empty array
    - Test: renders correct number of cards
    - Test: uses Spacing.two gap between cards
    - _Requirements: 3.3, 3.4_

- [ ] 6. Chat integration: Wire playlist cards into chat renderer
  - [ ] 6.1 Store tool results after auto-execution
    - In the auto-execution logic (likely in chat hook or service that calls `execute-tool-call`), populate the `result` field on `ToolCallData` when a retrieval tool completes successfully
    - _Requirements: 3.1, 3.2, 4.1_

  - [ ] 6.2 Render PlaylistCardList in chat message flow
    - In `src/app/(tabs)/chat/index.tsx` (or the relevant `renderItem` callback), after the assistant text bubble:
      - Detect if the message has `toolCalls` with a Spotify tool name (`spotify_search_playlist`, `spotify_suggest_pace_playlist`, `spotify_create_playlist`)
      - Check if the tool call has a populated `result` field
      - Call `extractPlaylistCardData(toolName, JSON.parse(result))` to get `PlaylistCardData[]`
      - Render `<PlaylistCardList playlists={data} />` below the text content
    - _Requirements: 3.1, 3.2, 4.1_

  - [ ]* 6.3 Write integration tests for chat rendering of playlist cards
    - Create `tests/integration/spotify-playlist-cards.test.tsx`
    - Test: chat renders PlaylistCardList when assistant message has spotify_search_playlist tool result
    - Test: chat renders single PlaylistCard when assistant message has spotify_create_playlist tool result
    - Test: chat does not render cards when tool result has error
    - Test: "Open in Spotify" button calls Linking.openURL with correct URL
    - _Requirements: 3.1, 4.1, 2.6_

- [ ] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The implementation uses TypeScript with React Native (Expo) and `fast-check` for property-based tests
- `expo-image` is used for image rendering with built-in placeholder support
- `expo-linking` is used for opening external URLs

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1", "2.2"] },
    { "id": 1, "tasks": ["1.3", "2.3"] },
    { "id": 2, "tasks": ["2.4", "2.5", "2.6", "4.1", "5.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "4.4", "4.5", "5.2", "6.1"] },
    { "id": 4, "tasks": ["6.2"] },
    { "id": 5, "tasks": ["6.3"] }
  ]
}
```
