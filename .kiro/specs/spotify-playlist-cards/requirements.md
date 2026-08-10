# Requirements Document

## Introduction

This feature adds rich Spotify playlist cards to the chat interface. When the agent returns playlist results from `spotify_create_playlist`, `spotify_search_playlist`, or `spotify_suggest_pace_playlist` tools, the chat renders visually rich cards displaying playlist artwork, name, description, track count, and a button to open the playlist in Spotify. The cards follow the app's existing design system and render inline within the chat message flow.

## Glossary

- **Playlist_Card**: A rich UI component displayed in the chat that shows a Spotify playlist's artwork, name, description, track count, and an external link button.
- **Playlist_Card_List**: A scrollable horizontal or vertical collection of Playlist_Cards rendered when multiple playlists are returned (search or suggestion results).
- **Tool_Result**: The JSON response object returned by a Spotify tool handler after execution, containing playlist data fields.
- **Chat_Renderer**: The message rendering logic in the chat screen (`src/app/(tabs)/chat/index.tsx`) responsible for displaying messages and tool call results.
- **Spotify_Tool**: Any of the three tools that return playlist data: `spotify_search_playlist`, `spotify_create_playlist`, or `spotify_suggest_pace_playlist`.
- **Image_URL**: The URL string pointing to a Spotify playlist's cover art image, extracted from the Spotify API response.
- **Design_System**: The app's themed component library including `ThemedText`, `ThemedView`, and the constants defined in `src/constants/theme.ts` (Colors, Spacing, Radii, Shadows).

## Requirements

### Requirement 1: Tool Handler Image URL Enrichment

**User Story:** As a developer, I want the Spotify tool handlers to include playlist cover art URLs in their responses, so that the frontend can display playlist artwork in cards.

#### Acceptance Criteria

1. WHEN `spotify_search_playlist` returns playlist results, THE Tool_Result SHALL include an `image_url` field for each playlist containing the first available image URL from the Spotify API response, or null if no images exist.
2. WHEN `spotify_suggest_pace_playlist` returns playlist results, THE Tool_Result SHALL include an `image_url` field for each playlist containing the first available image URL from the Spotify API response, or null if no images exist.
3. WHEN `spotify_create_playlist` completes successfully, THE Tool_Result SHALL include an `image_url` field containing the playlist cover art URL from the created playlist's Spotify API response, or null if no image is available.

### Requirement 2: Playlist Card Component

**User Story:** As a user, I want to see a visually rich card for Spotify playlists in the chat, so that I can quickly understand and interact with playlist results without leaving the app.

#### Acceptance Criteria

1. THE Playlist_Card SHALL display the playlist cover art as a square image with dimensions of 64x64 logical pixels and a border radius matching `Radii.medium` from the Design_System.
2. WHEN no Image_URL is available for a playlist, THE Playlist_Card SHALL display a placeholder icon or colored background instead of a broken image.
3. THE Playlist_Card SHALL display the playlist name using `ThemedText` with a bold font weight, truncated to a single line with ellipsis if the name exceeds the available width.
4. THE Playlist_Card SHALL display the playlist description using `ThemedText` in the `textSecondary` color, truncated to two lines with ellipsis.
5. THE Playlist_Card SHALL display the track count formatted as "{count} tracks" using `ThemedText` in the `textTertiary` color.
6. THE Playlist_Card SHALL include an "Open in Spotify" button styled with the Design_System accent color that opens the playlist's `external_url` using the device's default link handler.
7. IF the `external_url` field is null or empty, THEN THE Playlist_Card SHALL hide the "Open in Spotify" button.
8. THE Playlist_Card SHALL use `backgroundElevated` for its background color and a 1-pixel border using the `border` color from the active theme.
9. THE Playlist_Card SHALL use spacing values from the Design_System `Spacing` constants for all internal padding and gaps.

### Requirement 3: Chat Integration for Search and Suggestion Results

**User Story:** As a user, I want to see multiple playlist cards when the agent searches for or suggests playlists, so that I can browse and choose a playlist.

#### Acceptance Criteria

1. WHEN the Chat_Renderer encounters a completed `spotify_search_playlist` tool result, THE Chat_Renderer SHALL render a Playlist_Card_List containing one Playlist_Card for each playlist in the result.
2. WHEN the Chat_Renderer encounters a completed `spotify_suggest_pace_playlist` tool result, THE Chat_Renderer SHALL render a Playlist_Card_List containing one Playlist_Card for each playlist in the result.
3. THE Playlist_Card_List SHALL display cards in a vertical stack with `Spacing.two` gap between cards.
4. WHEN the Tool_Result contains an empty playlists array, THE Chat_Renderer SHALL not render a Playlist_Card_List.

### Requirement 4: Chat Integration for Created Playlist

**User Story:** As a user, I want to see a single playlist card when the agent creates a playlist for me, so that I can immediately open and use it.

#### Acceptance Criteria

1. WHEN the Chat_Renderer encounters a completed `spotify_create_playlist` tool result, THE Chat_Renderer SHALL render a single Playlist_Card with the created playlist's data.
2. THE Playlist_Card for a created playlist SHALL display the playlist name from the Tool_Result `name` field.
3. THE Playlist_Card for a created playlist SHALL display the track count as "{tracks_added} tracks" from the Tool_Result `tracks_added` field.
4. WHEN the `spotify_create_playlist` Tool_Result contains a valid `external_url`, THE Playlist_Card SHALL display the "Open in Spotify" button linking to that URL.

### Requirement 5: Theming and Platform Consistency

**User Story:** As a user, I want playlist cards to match the app's visual style and respond to theme changes, so that the experience feels cohesive.

#### Acceptance Criteria

1. THE Playlist_Card SHALL render correctly in both dark and light themes by reading color values from the active theme context.
2. THE Playlist_Card SHALL adapt its layout for different screen widths by constraining its maximum width to the chat bubble's available width.
3. THE Playlist_Card SHALL meet minimum touch target sizes from the Design_System `TouchTarget.minimum` constant for the "Open in Spotify" button.
4. THE Playlist_Card SHALL use the `Radii.large` border radius for its outer container to match the existing card style in the app.

### Requirement 6: Accessibility

**User Story:** As a user relying on assistive technology, I want playlist cards to be accessible, so that I can understand and interact with the playlist information.

#### Acceptance Criteria

1. THE Playlist_Card SHALL include an `accessibilityLabel` on the "Open in Spotify" button that reads "Open {playlist name} in Spotify".
2. THE Playlist_Card image SHALL include an `accessibilityLabel` describing it as "{playlist name} cover art".
3. THE Playlist_Card container SHALL have an `accessibilityRole` of "summary" to indicate grouped content.
