---
name: Kinetic Obsidian
colors:
  surface: '#10141a'
  surface-dim: '#10141a'
  surface-bright: '#353940'
  surface-container-lowest: '#0a0e14'
  surface-container-low: '#181c22'
  surface-container: '#1c2026'
  surface-container-high: '#262a31'
  surface-container-highest: '#31353c'
  on-surface: '#dfe2eb'
  on-surface-variant: '#b9cacb'
  inverse-surface: '#dfe2eb'
  inverse-on-surface: '#2d3137'
  outline: '#849495'
  outline-variant: '#3a494b'
  surface-tint: '#00dce6'
  primary: '#e0fdff'
  on-primary: '#00373a'
  primary-container: '#00f2fe'
  on-primary-container: '#006a70'
  inverse-primary: '#00696f'
  secondary: '#4edea3'
  on-secondary: '#003824'
  secondary-container: '#00a572'
  on-secondary-container: '#00311f'
  tertiary: '#f2f8ff'
  on-tertiary: '#00344d'
  tertiary-container: '#b9e0ff'
  on-tertiary-container: '#006692'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#6ff6ff'
  primary-fixed-dim: '#00dce6'
  on-primary-fixed: '#002022'
  on-primary-fixed-variant: '#004f53'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#c9e6ff'
  tertiary-fixed-dim: '#89ceff'
  on-tertiary-fixed: '#001e2f'
  on-tertiary-fixed-variant: '#004c6e'
  background: '#10141a'
  on-background: '#dfe2eb'
  surface-variant: '#31353c'
typography:
  display-hero:
    fontFamily: Plus Jakarta Sans
    fontSize: 48px
    fontWeight: '800'
    lineHeight: 54px
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '700'
    lineHeight: 28px
    letterSpacing: -0.015em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  title-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  data-metric:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '800'
    lineHeight: 32px
    letterSpacing: -0.02em
  label-caps:
    fontFamily: Plus Jakarta Sans
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 14px
    letterSpacing: 0.08em
  label-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-tablet: 2rem
  margin-desktop: 3rem
  space-2xs: 0.25rem
  space-xs: 0.375rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-2xl: 3rem
---

## Brand & Style

The design system establishes a high-performance biometric dark aesthetic engineered for serious athletes and AI-driven workout tracking. It merges tactical dark-mode ergonomics with high-precision telemetry interfaces. The emotional tone is focused, surgical, elite, and non-distracting during heavy physical output, while feeling hyper-responsive and premium during post-workout analysis.

Visual styling combines deep obsidian foundations with glassmorphic depth tiers, luminous electric cyan accents, and secondary emerald feedback cues. Surfaces reject flat grey drabness in favor of subtle carbon-blue tinting, translucent frosted panels, and razor-sharp border strokes that keep structural hierarchy legible under varying gym lighting conditions.

## Colors

The palette is engineered specifically for deep-contrast readability on OLED panels and high-intensity workout environments.

- **Primary (`#00F2FE`):** Electric cyan used for primary active states, primary CTA button fills, focused borders, active tab glyphs, and high-priority biometric telemetry. It possesses an inherent glow effect against deep dark canvases.
- **Secondary (`#10B981`):** Precision emerald green used for confirmed sets, completed workouts, success badges, and high-efficiency training feedback loops.
- **Tertiary (`#0EA5E9`):** Deep electric blue used for structural indicators, secondary badges, timeline curves, and complementary gradients.
- **Neutral Core (`#0A0E14`):** Pure obsidian canvas base. Stacked surface containers ascend through `#121820` (surface low / card backgrounds), `#1A222D` (surface mid / interactive rows), and `#222E3D` (surface high / floating bars and active toggles).
- **Text & Accents:** High-contrast neutral `#F1F5F9` for primary display values, `#94A3B8` for secondary workout labels (e.g., "RPE", "Sets × Reps"), and `#475569` for subtle structural dividers.

## Typography

The type system uses `Plus Jakarta Sans` across display, body, and UI readouts to maintain geometric crispness and athletic precision. 

- **Numerical Readouts & Telemetry:** Large telemetry values (timers, set numbers, poundage, and reps) utilize `data-metric` with tight letter spacing (`-0.02em`) and heavy weights (`700`–`800`) to guarantee glanceability mid-exercise.
- **Section Headers & Overlines:** Categories like "ACCOUNT", "AI PLAN", and "SESSION" use `label-caps` in uppercase styling with `+0.08em` tracking in muted slate (`#64748B`).
- **Hierarchy:** Strict two-tone hierarchy applies across all cards: prominent names/titles use pure white (`#F8FAFC`), while metadata and unit labels drop to mid-slate (`#94A3B8`).

## Layout & Spacing

The layout is built on an adaptive fluid system optimized for single-hand mobile interactions while anchoring to structured multi-column containers on desktop and tablet views.

- **Mobile Viewports (<640px):** Single-column layout with fixed `1rem` screen margin. Content cards stack vertically with `space-md` (`1rem`) gaps. Bottom padding reserves `5.5rem` to account for the elevated floating navigation bar and prevent viewport truncation.
- **Tablet & Desktop Viewports (>=640px):** Centers workout routines within a maximum container width of `720px` for workout execution views, and expands to an 8-column layout (`1.5rem` gutters) for analytics dashboards.
- **Micro-Spacing:** Compact vertical rhythm (`space-xs` to `space-sm`) inside exercise rows keeps workouts dense and reduces the need for excessive thumb scrolling while handling equipment.

## Elevation & Depth

Visual hierarchy is constructed through luminous glassmorphic tiers and dark obsidian layering rather than standard opaque drop shadows.

- **Level 0 (Canvas Base):** Flat `#0A0E14` with a radial ambient background mesh (`rgba(0, 242, 254, 0.03)` top center, `rgba(16, 185, 129, 0.02)` bottom center).
- **Level 1 (Structural Cards & Modules):** Frosted glass surface created with `#121820` at 85% opacity, backdrop blur of `16px`, and an ultra-subtle border outline of `1px solid rgba(255, 255, 255, 0.07)`.
- **Level 2 (Interactive Rows & Controls):** Elevated elements within cards use `#1A222D` with an inner border of `1px solid rgba(255, 255, 255, 0.1)`.
- **Level 3 (Active / Focused Cards):** Primary cyan accent border `1px solid rgba(0, 242, 254, 0.6)` combined with a soft atmospheric outer glow: `box-shadow: 0 0 24px -4px rgba(0, 242, 254, 0.25)`.
- **Level 4 (Floating Navigation Dock):** Suspended at the screen base using `#0F151F` with 90% opacity, `20px` backdrop filter blur, top highlight `1px solid rgba(255, 255, 255, 0.12)`, and bottom drop shadow `0 20px 40px rgba(0, 0, 0, 0.6)`.

## Shapes

The design system standardizes on level 2 roundedness (`rounded-md: 0.5rem`, `rounded-lg: 1rem`, `rounded-xl: 1.5rem`), creating a sleek athletic hardware aesthetic.

- **Workout & Module Cards:** Structured with `rounded-lg` (`1rem` / `16px`) to balance ergonomics with high-density data display.
- **Interactive List Rows & Input Fields:** Styled with `rounded-md` (`0.5rem` / `8px`) to maintain clear touch affordances.
- **Floating Controls & Indicators:** Segmented control containers use `rounded-lg`, while status tags (e.g. "Active", "PR", "RPE") and icon badges adopt full pill radius (`rounded-full` / `9999px`) to create clear functional contrast against rectangular content cards.

## Components

### Buttons
- **Primary Athletic Button:** High-intensity electric cyan fill (`#00F2FE`) with deep obsidian text (`#0A0E14`, weight 700), subtle cyan shadow `0 4px 14px rgba(0, 242, 254, 0.4)`, and `0.5rem` radius. Active state scales subtly (`scale(0.98)`).
- **Secondary / Ghost Button:** Transparent background with `#1A222D` surface, border `1px solid rgba(255, 255, 255, 0.1)`, and text `#F1F5F9`. Hover brightens the border to `rgba(0, 242, 254, 0.4)`.
- **Destructive / Reset Button:** Low-opacity ruby glass (`rgba(239, 68, 68, 0.12)`) with crimson text (`#F87171`) and border `rgba(239, 68, 68, 0.3)`.

### Exercise Cards & Workout Rows
- Cards are framed in frosted `#121820` with a `1px solid rgba(255, 255, 255, 0.08)` border.
- Exercise title is rendered in `title-md` (`#FFFFFF`), while exercise prescription ("3×12 RPE 6") uses `body-md` in `#94A3B8`.
- Set number badges are circular (`32px × 32px`) or rounded pills filled with `#00F2FE` (white or dark text) or hollow cyan outline rings.

### Segmented Controls (Time & Metric Selectors)
- Container: `#121820` background, `0.5rem` padding (`4px`), `0.75rem` radius, enclosing all tabs.
- Active Segment: Elevated with `#00F2FE` (or `#1A222D` with luminous cyan text) and an instantaneous fluid position slide. Inactive segments remain muted slate (`#64748B`).

### Floating Bottom Navigation Bar
- A detached floating dock fixed `1rem` above the bottom screen edge with `1rem` horizontal margins.
- Surface: Glassmorphic deep charcoal (`rgba(15, 21, 31, 0.92)`) with `20px` backdrop blur and `rounded-2xl` profile.
- Active Tab: Features a luminous cyan icon (`#00F2FE`), an active glow pip or subtle accent underline, and bold high-contrast label text. Inactive tabs display muted icons (`#64748B`).

### Form Inputs & Text Fields
- Input containers feature `#121820` fill, `1px solid rgba(255, 255, 255, 0.12)` border, `14px` internal padding, and `0.5rem` radius.
- Focused state applies an immediate border switch to `#00F2FE` and an atmospheric cyan field glow (`0 0 0 3px rgba(0, 242, 254, 0.15)`).

### Toggle Switches & Badges
- **Toggle:** Track is `#1A222D` (off) and `#00F2FE` (on). The thumb is crisp pure white (`#FFFFFF`) with a micro shadow.
- **Status Pills:** Compact badge with emerald background tint (`rgba(16, 185, 129, 0.15)`), emerald border (`rgba(16, 185, 129, 0.4)`), and vibrant green text (`#10B981`) for "Active" or "Completed" states.