# Cadence — AI Agentic Workout Platform
## Engineering & UI Implementation Handover Package (for Kiro)

---

### Executive Overview & Architecture
Cadence is an AI-first, adaptive strength and conditioning mobile web application. At its core, it leverages an autonomous/agentic AI coach that reads physiological telemetry (HRV, CNS readiness, volume load) and allows users to adapt training sessions via natural language, interactive workout modification cards, and BYOK (Bring Your Own Key) model orchestration.

---

### 1. Design System Tokens & Foundations (Kinetic Obsidian)

* **Theme:** Dark Mode Athletic Performance
* **Typography:** `Plus Jakarta Sans`, sans-serif
* **Base Color Palette:**
  - `Surface (Canvas)`: `#0a0e14` to `#10141a`
  - `Card / Container Low`: `#181c22`
  - `Card / Container High`: `#222730`
  - `Border Subdued`: `rgba(255, 255, 255, 0.08)` / `#2a313d`
  - `Primary Accent (Cyan / Electric Pulse)`: `#00f2fe`
  - `Secondary Accent (Teal / Kinetic Energy)`: `#10b981` (emerald green) and `#0ea5e9` (sky blue)
  - `Warning / Deload / Accent`: `#f59e0b` (amber) / `#6366f1` (indigo)
  - `Text Hierarchy`:
    - Display / Headings: `#f1f5f9` (Slate 100), font-weight 700/800
    - Body: `#cbd5e1` (Slate 300), font-weight 400/500
    - Subdued / Metadata: `#64748b` (Slate 500)
* **Corner Radius:** Rounded 8px to 16px (`rounded-xl` / `rounded-2xl` for cards, `rounded-full` for chips and pills).
* **Grid & Viewport:** Mobile portrait viewport (~390px-430px base, responsive full-height scrolling with fixed bottom navigation bar).

---

### 2. Global Navigation Shell (`App Shell`)

The application uses a persistent 5-tab bottom navigation bar (`z-50`, backdrop-blur `rgba(16, 20, 26, 0.9)`):
1. **Chat** (Icon: Bot / Sparkle) -> Route `/chat`
2. **Program** (Icon: Calendar / List) -> Route `/program`
3. **Session** (Icon: Dumbbell / Pulse) -> Route `/session`
4. **Progress** (Icon: Activity / Sparkline) -> Route `/progress`
5. **Settings** (Icon: Sliders / Gears) -> Route `/settings`

Top App Bar:
- Left: Cadence brand pulse logo + app label & active view breadcrumb.
- Right: Notifications bell with unread indicator + Athlete profile avatar.

---

### 3. Screen Specifications & State Models

#### Screen 1: AI Coach Chat (`AI Coach Chat`)
* **Core Purpose:** The central interactive hub where athletes discuss fatigue, injuries, equipment constraints, and receive program adaptations.
* **Component Breakdown:**
  1. **Intelligence Header Bar:**
     - Agent status pill: Active model indicator (e.g. `Claude 3.5 Sonnet` or `GPT-4o`), live biometrics link, mode toggle (`Adaptive` vs `Strict`).
  2. **Message Stream:**
     - User messages: Right-aligned dark-slate bubbles with timestamp and athlete avatar.
     - Coach responses: Left-aligned with Cadence bot avatar, markdown formatting, highlighted routine names.
  3. **Embedded Interactive Workout Modification Card:**
     - Header: Routine title (e.g., `Strength A (Modified)`), target RPE badge (`RPE 6 TARGET`).
     - Exercise Differential List:
       - Item number, Exercise name, tempo notation (`3-0-1-0`), set/rep scheme.
       - Badges: `SWAPPED`, `NEW`, `KEPT` with distinctive color treatments.
     - Dual CTA Row:
       - Primary: `Accept Changes` (dispatches program state mutation and updates Program/Session tabs).
       - Secondary: `View Details` (opens exercise comparison modal).
  4. **Smart Suggestion Chips:** Horizontal scroll with quick-actions (`Swap an exercise`, `Deload next week`, `Add recovery walk`).
  5. **Input Dock:** Multi-line text input with voice dictation button (`mic`), attachment trigger, encrypted biometrics badge, and high-contrast Cyan send action button.

#### Screen 2: Training Program (`Training Program`)
* **Core Purpose:** Mesocycle planning, routine overview, and exercise breakdown.
* **Component Breakdown:**
  1. **Phase Header Card:**
     - Mesocycle title (`Phase 1: Foundation Strength & Aerobic Base`).
     - Phase Adherence metric with progress bar (e.g., `42%`, `5 of 12 Sessions Completed`, Target date).
     - Action buttons: `Program Library`, `Templates`.
  2. **Agent Interstitial Banner:** Callout card to query Cadence agent directly to adapt volume.
  3. **Filter Segment:** `This Week`, `Upcoming`, `Cycle Notes`.
  4. **Coach Focus Card:** Visual motivational/tactical card with hero training photography and daily cue (e.g., *"Focus on tempo control — 2-second eccentric lower"*).
  5. **Daily Workout Cards:**
     - `Day 1: Strength A` (Status: `READY`): Exercise list with sets x reps, target RPE, drag handles (`=`), and quick start FAB button.
     - `Day 2: Easy Jog` (Status: `SCHEDULED`): Interval breakdown (Warm-up walk, Steady-state jog, Cool-down).
     - `Day 3: Strength B` (Status: `PREVIEW`): Collapsed summary card with chevron.
  6. **Weekly Compliance Badge:** Progress card toward target weekly sessions (e.g., `Week 2 Target: 3 Workouts`).

#### Screen 3: Start Workout Session (`Start Workout Session`)
* **Core Purpose:** Pre-workout calibration and launchpad for scheduled and spontaneous sessions.
* **Component Breakdown:**
  1. **Cycle Phase Status & Progress Ring:** Phase name, circular progress indicator (`75%`), key stats (`Volume 14,280 kg`, `Pace 3/4`, `Recovery 94%`).
  2. **Quick Dispatch Action Tiles:**
     - `Freestyle Workout`: Manual weight & rep logger with neon dumbbell icon.
     - `Track Outdoor Route`: GPS run/cadence telemetry logger with GPS ready indicator.
  3. **Scheduled Workouts Carousel / List:**
     - Featured Workout (`Strength A`): High-prominence cyan card, biomechanics summary, exercise tags, and glowing `Start Workout` CTA.
     - Secondary items (`Easy Jog & Flush`, locked workouts with schedule date).
  4. **Session Calibration & Sensors Synced:**
     - Resting Heart Rate live readout (`58 bpm`).
     - CNS Readiness Score (`High • 9.2`).
  5. **Coach Intel & Form Guide Cards:** Video/article thumbnails (`Barbell Squat Depth`, `Optimal Foot Strike`).

#### Screen 4: Progress & Analytics (`Progress & Analytics`)
* **Core Purpose:** Objective volume, intensity, and adherence telemetry tracking.
* **Component Breakdown:**
  1. **Header & Timeframe Segmented Control:** Options for `1 Week`, `4 Weeks`, `12 Weeks`.
  2. **Volume by Muscle Group:**
     - Multi-segment progress bar showing total cumulative sets.
     - Muscle group rows (Quads/Hams, Pectorals, Back/Lats, Shoulders/Delts) with set counts, tonnage in kg, percentage share, and trend arrows (up/steady).
  3. **Weekly Volume Trend Chart:**
     - Current Load total (`18,450 kg`) with delta vs previous week (`+8.2% vs W2`).
     - 4-bar bar chart comparing Week 1 through Deload targets, with active glowing bar for current week.
  4. **Frequency & Habit Calendar:**
     - 7-day circular matrix showing workout completion, rest days, and active day indicators with session focus labels (`Push`, `Pull`, `Rest`, `Legs`, `Upper`, `Core`).
     - Summary metrics: Average session duration (`48 min`) and Plan Compliance (`94%`).
  5. **Cadence AI Coach Recovery Insight:** Proactive recommendation card generated by the agent based on recovery telemetry.

#### Screen 5: Settings & AI Config (`Settings & AI Config`)
* **Core Purpose:** BYOK LLM gateway, automation rules, and external biometric sync management.
* **Component Breakdown:**
  1. **Account Profile Summary:** Athlete name, PRO tier badge, email, and Edit Profile action.
  2. **BYOK (Bring Your Own Key) Engine Configuration:**
     - AI Provider Segmented Switcher: `OpenAI`, `Anthropic`, `Local LLM (Ollama/LMStudio)`.
     - Primary Reasoning Model selector dropdown (e.g., `GPT-4o`, `Claude 3.5 Sonnet`, `Llama 3.3 70B`).
     - API Key input card with masked display (`sk-live-9382...7b89`), `Verified` status badge, and `ROTATE` action.
     - Token Telemetry & Billing: `Today's Tokens (14.8k, 142 tps)` and `Est. Cost ($0.04)`.
  3. **Workout Session Automation:**
     - Toggles: Rest Timer Auto-Start, Audio Voice & Haptic Cues.
     - Segmented timer cadence presets: Compound (e.g. 90 sec) vs. Isolation (e.g. 60 sec).
  4. **Hardware & Streaming Integrations:**
     - Spotify Audio Engine sync (BPM pacing matching).
     - Apple Health & Garmin telemetry sync.
     - Autonomous Agent Permissions (define what the coach can edit without manual athlete confirmation).
  5. **Sign Out Action:** Subtle destructible action button.

---

### 4. Technical Architecture & Implementation Stack Recommendation

* **Frontend:** React 19 / Next.js App Router (or React Native / Expo if mobile native) with Tailwind CSS.
* **State Management:** Zustand / TanStack Query (Query cache for telemetry & program state).
* **Local Storage / Persistence:** IndexedDB or SQLite for offline workout logging.
* **AI Gateway:** Vercel AI SDK (`ai` package) with unified endpoints supporting OpenAI, Anthropic, and local endpoints via user-supplied API keys.
* **Biometrics Sync:** HealthKit / Google Health Connect integration bridges.

---

### 5. UI Component Hierarchy Tree

```
App
├── NavigationShell (Header & BottomTabBar)
│   ├── View: /chat
│   │   ├── IntelligenceStatusBanner
│   │   ├── ChatMessageList
│   │   │   ├── UserMessageBubble
│   │   │   └── AgentMessageBubble
│   │   │       └── WorkoutModificationCard (with Accept/Reject mutations)
│   │   ├── QuickPromptChips
│   │   └── ChatInputDock
│   ├── View: /program
│   │   ├── MesocycleAdherenceCard
│   │   ├── AgentPromptBanner
│   │   ├── ProgramTabs (This Week / Upcoming)
│   │   ├── CoachFocusHero
│   │   └── RoutineDayCard (Exercises, Sets, Reps, RPE)
│   ├── View: /session
│   │   ├── ReadinessScoreRing
│   │   ├── QuickDispatchGrid (Freestyle, Route GPS)
│   │   ├── ScheduledWorkoutHero (Start Workout CTA)
│   │   ├── SensorReadouts (HR, CNS)
│   │   └── VideoMovementGuides
│   ├── View: /progress
│   │   ├── TimeframeFilter
│   │   ├── MuscleVolumeDistribution
│   │   ├── WeeklyTonnageBarChart
│   │   ├── SevenDayHabitMatrix
│   │   └── CoachRecoveryInsightCard
│   └── View: /settings
│       ├── AthleteProfileCard
│       ├── BYOKEngineCard (Provider, Model, Key, Usage Tracker)
│       ├── WorkoutAutomationToggles (Rest timers, tempo cues)
│       └── ConnectedSensorsList (Garmin, Apple Health, Spotify)
```
