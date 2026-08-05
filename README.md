# Cadence

AI-powered fitness training app. Chat with an AI agent to create personalized programs, log workouts, track PRs, and manage Spotify playlists for your sessions.

## Stack

- **Frontend:** React Native + Expo v57 (Expo Router, Dev Client)
- **Backend:** Supabase (Postgres + RLS, Auth, Edge Functions, Realtime)
- **AI:** OpenAI / Anthropic (BYOK - bring your own key)
- **Health:** Apple HealthKit + Android Health Connect
- **Music:** Spotify Web API (OAuth2 PKCE)
- **GPS:** expo-location with background tracking (Phase 2)

## Features

**AI Agent**
- Natural language program creation and modification
- Tool calls with permission gating (approval required or auto-apply)
- Streaming responses via SSE
- Full audit log of all agent actions

**Training Programs**
- Structured programs with days, exercises, sets, reps, RPE targets
- Timer configurations (rest, countdown, interval, duration)
- Single active program constraint (DB-enforced)
- Program library with activation/archival

**Session Logging**
- Auto-fill from previous sessions (priority chain)
- Real-time PR detection (weight, reps at weight, estimated 1RM)
- Timer UI with background notifications
- End-of-session summary with volume and PRs

**Progression**
- Volume by muscle group with selectable time window
- Per-exercise history
- Activity summary (Cadence sessions only)

**Health Integration**
- Import workouts, sleep, heart rate, activity from HealthKit/Health Connect
- Cardio autofill from imported workouts
- Recovery summaries for AI recommendations

**Spotify**
- OAuth2 PKCE connection
- Playlist search, creation, and modification via AI agent
- Pace-based playlist suggestions (BPM correlated to running pace)

**Route Tracking (Phase 2)**
- Background GPS recording via expo-location
- Haversine distance, pace, speed, elevation gain
- PostGIS storage with point stream
- Route history queryable by the AI agent

## Getting Started

### Prerequisites

- Node.js 18+
- Docker Desktop (for local Supabase)
- Expo CLI (`npx expo`)

### Setup

```bash
# Install dependencies
npm install

# Start local Supabase
npx supabase start

# Apply migrations and seed data
npx supabase db reset

# Start the app
npx expo start
```

Press **w** for web, **i** for iOS simulator, **a** for Android emulator.

### Environment Variables

Create a `.env` file:

```
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:55001
EXPO_PUBLIC_SUPABASE_ANON_KEY=<from supabase start output>
```

### Native Features

HealthKit, Health Connect, background GPS, and notifications require a Dev Client build:

```bash
npx expo prebuild
npx expo run:ios    # or run:android
```

## Project Structure

```
src/
  app/              # Expo Router screens
    (auth)/         # Login, register, verify-email
    (tabs)/         # Main app (chat, program, session, progress, settings, journal)
  components/       # Shared UI components
  constants/        # Design system (theme, colors, spacing, radii)
  hooks/            # useTheme, useColorScheme
  providers/        # AuthProvider
  services/         # Business logic (PR detection, auto-fill, timer, etc.)
  types/            # TypeScript interfaces
  utils/            # Supabase client

supabase/
  functions/        # Edge Functions (agent-chat, store-api-key, delete-account)
  migrations/       # Database schema
  seed.sql          # Global exercise library

tests/
  unit/             # 306 unit tests (vitest)
```

## Testing

```bash
npx vitest --run
```

## Design System

Dark-first with teal/cyan accent. System fonts. Consistent spacing (4px grid), radii, and semantic color tokens. See `src/constants/theme.ts`.

## License

MIT
