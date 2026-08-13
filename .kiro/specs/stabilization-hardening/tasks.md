# Implementation Plan: Stabilization & Hardening

## Overview

This implementation plan covers a stabilization pass across five areas: fixing Spotify test mocks to match handler implementations, adding GitHub Actions CI, integrating Sentry error monitoring, fixing a missing initWAL import, and configuring EAS builds. All changes are infrastructure/DX improvements with no user-facing functionality changes. Implementation uses TypeScript throughout.

## Tasks

- [x] 1. Fix Spotify tool-handler test mocks
  - [x] 1.1 Update `spotify_create_playlist` test mocks for multi-endpoint retry pattern
    - Mock `/me/playlists` as the primary endpoint (returns success)
    - Mock `/users/{id}/playlists` as the fallback endpoint
    - Add Supabase `user_spotify_tokens` table query mock (`.from().select().eq().single()` chain)
    - Add assertion: when primary succeeds, verify fallback endpoint is NOT called
    - Add test case: when primary throws, verify fallback is called and returns successful playlist result
    - _Requirements: 1.1, 1.2, 1.3, 1.7_

  - [x] 1.2 Update `spotify_suggest_pace_playlist` test mocks for correct query format
    - Update the mock URL assertion to match the exact output of `buildPacePlaylistQuery(activityType, bpmRange, durationMinutes)`
    - Ensure the encoded search query follows format: `"{bpmRange.label} {bpmRange.min}-{bpmRange.max} bpm {activityType}"` for running
    - _Requirements: 1.4_

  - [x] 1.3 Update `spotify_modify_playlist` test mocks for correct endpoint and body format
    - Change endpoint from `/playlists/{id}/tracks` to `/playlists/{id}/items`
    - Change request body from `{ tracks: [{uri}] }` to `{ uris: [...] }` for both POST (add) and DELETE (remove)
    - _Requirements: 1.5_

  - [x] 1.4 Run full Spotify test suite and verify zero failures
    - Execute `npx vitest --run tests/unit/spotify-tool-handlers.test.ts`
    - Verify all tests pass with zero failures
    - _Requirements: 1.6_

- [x] 2. Checkpoint - Verify Spotify tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Add GitHub Actions CI pipeline
  - [x] 3.1 Create `.github/workflows/ci.yml` workflow file
    - Configure trigger on push to `main` branch and on all pull requests
    - Set up `ubuntu-latest` runner
    - Add checkout step
    - Add Node.js 20 setup with `actions/setup-node@v4` and `cache: 'npm'`
    - Add `npm ci` step for dependency installation
    - Add `npx tsc --noEmit` step for type checking
    - Add `npx vitest --run` step for test execution
    - Add `npx expo lint` step for linting
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9_

- [x] 4. Fix initWAL import in StoreIntegrationProvider
  - [x] 4.1 Add missing `initWAL` import and error handling wrapper
    - Add `import { initWAL } from '@/services/wal'` to import block in `src/providers/StoreIntegrationProvider.tsx`
    - Wrap `initWAL()` call in try/catch
    - On failure: log error via Error Logger, skip `initSyncEngine()`, continue rendering children
    - Ensure existing platform check (skip on web) and sign-out cleanup logic remain intact
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [ ]* 4.2 Write unit tests for StoreIntegrationProvider WAL error handling
    - Test: when `initWAL` throws, verify `initSyncEngine` is NOT called
    - Test: when `initWAL` succeeds, verify `initSyncEngine` IS called
    - Test: when platform is web, verify neither `initWAL` nor `initSyncEngine` are called
    - _Requirements: 4.2, 4.3, 4.4_

- [x] 5. Checkpoint - Verify WAL fix and CI config
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Integrate Sentry error monitoring
  - [x] 6.1 Install `@sentry/react-native` dependency
    - Add `@sentry/react-native` as a production dependency via `npm install`
    - _Requirements: 3.1_

  - [x] 6.2 Create `src/lib/sentry.ts` initialization module
    - Implement `initSentry()` function that reads DSN from `process.env.EXPO_PUBLIC_SENTRY_DSN`
    - Implement environment detection: `__DEV__` → development, EAS channel `preview` → preview, otherwise → production
    - Read app version from `Constants.expoConfig?.version`
    - Only send events when environment is `production` or `preview`
    - Wrap initialization in try/catch — on failure, set internal flag to `false`
    - Implement `captureException(error, context?)` that no-ops when not initialized
    - Implement `isSentryInitialized()` helper
    - _Requirements: 3.2, 3.3_

  - [x] 6.3 Extend `src/lib/error-logger.ts` to forward errors to Sentry in production
    - After structured JSON logging, call `captureException()` with metadata (component stack, route, session ID)
    - In development mode, log to console only without calling Sentry
    - If Sentry is not initialized (no DSN), preserve existing console-only behavior
    - _Requirements: 3.4, 3.5_

  - [x] 6.4 Extend `src/components/ErrorBoundary.tsx` to report to Sentry
    - In `componentDidCatch`, call `Sentry.captureException(error, { contexts: { react: { componentStack } } })`
    - Derive component tree name from the `componentStack` string
    - _Requirements: 3.6_

  - [x] 6.5 Initialize Sentry in `src/app/_layout.tsx` at app start
    - Call `initSentry()` early in the root layout
    - Ensure initialization runs before any error boundaries mount
    - _Requirements: 3.2_

  - [x] 6.6 Add source map upload step to CI workflow for production builds
    - Add conditional step in `.github/workflows/ci.yml` for `npx sentry-cli releases files upload-sourcemaps`
    - Use `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` secrets
    - Ensure build fails if upload fails
    - _Requirements: 3.7, 3.8_

  - [ ]* 6.7 Write unit tests for Sentry initialization module
    - Test: `initSentry()` does not throw when DSN is missing
    - Test: `captureException()` is a no-op when not initialized
    - Test: environment detection logic with mocked `__DEV__` and `Constants`
    - Test: production mode calls `captureException` from error logger
    - Test: development mode does NOT call `captureException`
    - _Requirements: 3.2, 3.3, 3.4, 3.5_

- [x] 7. Checkpoint - Verify Sentry integration
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Configure EAS builds
  - [x] 8.1 Create `eas.json` with development, preview, and production profiles
    - Define `development` profile: `distribution: "internal"`, `developmentClient: true`, `channel: "development"`
    - Define `preview` profile: `distribution: "internal"`, `developmentClient: false`, `channel: "preview"`
    - Define `production` profile: `distribution: "store"`, `channel: "production"`, `autoIncrement: true` for both iOS and Android
    - Include empty `ios: {}` and `android: {}` objects in each profile
    - Do NOT include `projectId` — rely on `app.json > expo.extra.eas.projectId`
    - Set `cli.version` to `">= 15.0.0"`
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- No property-based tests are included — the design explicitly assessed PBT as not applicable for this feature (infrastructure/config changes with no algorithmic input variation)
- Unit tests validate specific examples and edge cases
- The Spotify test mock fixes (tasks 1.1–1.4) ARE the tests — fixing them ensures regression coverage

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["1.4", "3.1", "4.1", "8.1"] },
    { "id": 2, "tasks": ["4.2", "6.1"] },
    { "id": 3, "tasks": ["6.2"] },
    { "id": 4, "tasks": ["6.3", "6.4", "6.5"] },
    { "id": 5, "tasks": ["6.6", "6.7"] }
  ]
}
```
