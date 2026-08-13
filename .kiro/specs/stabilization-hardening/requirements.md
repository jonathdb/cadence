# Requirements Document

## Introduction

This specification covers a stabilization and hardening pass for the Cadence fitness app. The work addresses five areas: fixing failing Spotify tool-handler tests, adding a CI pipeline via GitHub Actions, integrating Sentry for production error monitoring, fixing a missing `initWAL()` import in `StoreIntegrationProvider`, and adding EAS Build configuration. The goal is to improve reliability, observability, and build infrastructure without changing user-facing functionality.

## Glossary

- **Test_Suite**: The Vitest-based test runner executing all unit and property tests in the `tests/` and `supabase/functions/` directories
- **CI_Pipeline**: A GitHub Actions workflow that runs automated checks on code changes
- **Sentry_SDK**: The `@sentry/react-native` library used for capturing and reporting runtime errors in production
- **Error_Logger**: The module at `src/lib/error-logger.ts` responsible for structured error output
- **Error_Boundary**: The React error boundary component at `src/components/ErrorBoundary.tsx` that catches unhandled component errors
- **WAL_Service**: The Write-Ahead Log singleton at `src/services/wal.ts` providing offline persistence via expo-sqlite
- **Store_Integration_Provider**: The React provider at `src/providers/StoreIntegrationProvider.tsx` that hydrates the Zustand store and initializes the sync engine
- **EAS_Config**: The `eas.json` file defining Expo Application Services build profiles
- **Spotify_Tool_Handlers**: The Supabase edge-function module at `supabase/functions/_shared/tool-handlers.ts` implementing Spotify API interactions
- **Spotify_Test_File**: The test file at `tests/unit/spotify-tool-handlers.test.ts` exercising the Spotify tool handlers

## Requirements

### Requirement 1: Fix Spotify Tool-Handler Test Mocks

**User Story:** As a developer, I want all Spotify tool-handler tests to pass, so that the test suite provides reliable regression coverage for the multi-endpoint retry pattern.

#### Acceptance Criteria

1. WHEN the `spotify_create_playlist` handler is invoked in tests, THE Spotify_Test_File SHALL mock the `/me/playlists` endpoint as the primary endpoint and the `/users/{id}/playlists` endpoint as the fallback, matching the ordered multi-endpoint retry loop in the handler implementation
2. WHEN the `spotify_create_playlist` handler succeeds on the primary `/me/playlists` endpoint in tests, THE Spotify_Test_File SHALL verify that `spotifyApiRequest` is not called with the `/users/{id}/playlists` fallback endpoint
3. WHEN the `spotify_create_playlist` handler fails on the primary `/me/playlists` endpoint in tests, THE Spotify_Test_File SHALL verify that the handler retries by calling `spotifyApiRequest` with the `/users/{id}/playlists` fallback endpoint and returns a successful playlist result
4. WHEN the `spotify_suggest_pace_playlist` handler is invoked in tests, THE Spotify_Test_File SHALL mock `spotifyApiRequest` to accept the search query string produced by `buildPacePlaylistQuery` (format: `"{bpmRange.label} {bpmRange.min}-{bpmRange.max} bpm {activityType}"` for running) so that the mock matches the actual URL path the handler constructs
5. WHEN the `spotify_modify_playlist` handler is invoked in tests with add or remove operations, THE Spotify_Test_File SHALL mock the `/playlists/{id}/items` endpoint (not `/playlists/{id}/tracks`) using the `{ uris: [...] }` body format for both POST (add) and DELETE (remove) operations, matching the handler implementation
6. WHEN the full Test_Suite is executed after all mock corrections are applied, THE Test_Suite SHALL report zero test failures across the spotify-tool-handlers test file
7. WHEN the `spotify_create_playlist` handler is invoked in tests, THE Spotify_Test_File SHALL mock the Supabase `user_spotify_tokens` table query (used for debug logging in the handler) so that the handler does not throw due to an unmocked Supabase call

### Requirement 2: GitHub Actions CI Pipeline

**User Story:** As a developer, I want an automated CI pipeline that validates code on every push and pull request, so that regressions are caught before merging.

#### Acceptance Criteria

1. WHEN code is pushed to the `main` branch, THE CI_Pipeline SHALL trigger a workflow run
2. WHEN a pull request is opened or updated targeting any branch, THE CI_Pipeline SHALL trigger a workflow run
3. WHEN the CI_Pipeline runs, THE CI_Pipeline SHALL install dependencies using `npm ci`
4. WHEN the CI_Pipeline runs, THE CI_Pipeline SHALL execute TypeScript type checking via `npx tsc --noEmit`
5. WHEN the CI_Pipeline runs, THE CI_Pipeline SHALL execute the test suite via `npx vitest --run`
6. WHEN the CI_Pipeline runs, THE CI_Pipeline SHALL execute linting via `npx expo lint`
7. IF any step in the CI_Pipeline fails, THEN THE CI_Pipeline SHALL report a failing status and halt subsequent steps
8. THE CI_Pipeline SHALL use Node.js version 20 as the runtime environment
9. THE CI_Pipeline SHALL cache npm dependencies to reduce workflow execution time

### Requirement 3: Sentry Error Monitoring Integration

**User Story:** As a developer, I want production errors to be reported to Sentry with full context, so that runtime issues can be diagnosed and prioritized.

#### Acceptance Criteria

1. THE Sentry_SDK SHALL be installed as a production dependency in the project
2. WHEN the application starts and a valid Sentry DSN is present in environment variables, THE Sentry_SDK SHALL be initialized in the root layout with the DSN, app version, and environment tag set to one of "development", "preview", or "production"
3. IF the Sentry DSN environment variable is missing or empty at application start, THEN THE Sentry_SDK SHALL not initialize and THE Error_Logger SHALL log errors to the console only
4. WHILE the application is running in production mode, THE Error_Logger SHALL forward unhandled exceptions, unhandled promise rejections, and explicitly captured errors to Sentry with structured metadata including error message, component stack, current route name, and user session ID
5. WHILE the application is running in development mode, THE Error_Logger SHALL log errors to the console without sending to Sentry
6. WHEN the Error_Boundary catches an unhandled component error, THE Error_Boundary SHALL report the error to Sentry with the component stack trace and the name of the component tree where the error originated
7. WHEN an EAS production build is created, THE CI_Pipeline SHALL upload source maps to Sentry for symbolicated stack traces
8. IF source map upload to Sentry fails during the CI build, THEN THE CI_Pipeline SHALL fail the build and output an error message indicating the upload failure reason

### Requirement 4: Fix initWAL Import in StoreIntegrationProvider

**User Story:** As a developer, I want the WAL service to initialize correctly on native platforms, so that offline-first persistence functions without silent runtime errors.

#### Acceptance Criteria

1. THE Store_Integration_Provider SHALL import the `initWAL` function from `@/services/wal`
2. WHEN a user is authenticated and the platform is native (Platform.OS is not "web"), THE Store_Integration_Provider SHALL call `initWAL()` before calling `initSyncEngine()`
3. WHEN the application runs on the web platform (Platform.OS is "web"), THE Store_Integration_Provider SHALL skip WAL initialization and sync engine initialization entirely
4. IF `initWAL()` throws an error, THEN THE Store_Integration_Provider SHALL log the error using the Error_Logger, skip sync engine initialization, and continue rendering its children without crashing
5. IF the user signs out while on a native platform, THEN THE Store_Integration_Provider SHALL call `resetSyncEngine()` and unsubscribe from NetInfo listeners before the effect cleanup completes

### Requirement 5: EAS Build Configuration

**User Story:** As a developer, I want EAS build profiles configured for development, preview, and production, so that builds can be created for testing and app store submission.

#### Acceptance Criteria

1. THE EAS_Config SHALL define a `development` profile with `distribution` set to `internal` and `developmentClient` set to `true`
2. THE EAS_Config SHALL define a `preview` profile with `distribution` set to `internal` and `developmentClient` set to `false`, producing a standalone build for team testing
3. THE EAS_Config SHALL define a `production` profile with `distribution` set to `store`
4. THE EAS_Config SHALL include both `ios` and `android` build configurations in each of the three profiles
5. THE EAS_Config SHALL rely on the `projectId` defined in `app.json` at `expo.extra.eas.projectId` and SHALL NOT redeclare a `projectId` within `eas.json`
6. WHEN the `development` profile is used, THE EAS_Config SHALL set `developmentClient` to `true` to enable loading the app through the Expo dev client
7. WHEN the `production` profile is used, THE EAS_Config SHALL set `autoIncrement` to `true` for both iOS and Android to automatically increment the build number on each submission build
8. THE EAS_Config SHALL assign a unique `channel` name matching each profile name (`development`, `preview`, `production`) to enable EAS Update targeting per environment
