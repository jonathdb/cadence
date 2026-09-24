# Manual Verification Checklist — App Experience Improvements

Layout, scroll, and end-to-end CRUD behaviors that depend on real device
insets, gesture handling, and network timing are not unit-testable. Run this
checklist on a physical or simulated device before considering the feature
complete.

**Required devices:**
- A notched/Dynamic-Island iOS device or simulator (to exercise a non-zero
  `insets.bottom` safe area)
- An Android device or emulator with a 3-button OR gesture-bar navigation mode
  (to exercise a different `insets.bottom` value than iOS)

Check off each item on **both** devices unless noted otherwise. Record any
failures with a screenshot and the device/OS version.

---

## 1. Dock clearance (Requirements 1.1–1.3, 1.5–1.7)

For each screen below: scroll to the very bottom of the content. Confirm no
content is obscured by the floating tab dock, and there is a visible gap
(~8pt) between the last piece of content and the top of the dock.

- [ ] `(tabs)/chat` — chat message list scrolled to bottom; the message input
      bar itself also sits clear of the dock
- [ ] `(tabs)/session` (Session Hub) — recent sessions list
- [ ] `(tabs)/session/[dayId]` (active logging) — the fixed "Complete Session"
      footer never overlaps the dock, independent of scroll position
- [ ] `(tabs)/session/freestyle`
- [ ] `(tabs)/session/summary/[sessionId]` — including with the notes editor
      open (verify the Save/Cancel row is reachable)
- [ ] `(tabs)/program` (active program)
- [ ] `(tabs)/program/library` (Exercise Library)
- [ ] `(tabs)/program/edit/[programId]` — both "Create" (new) and "Edit"
      (existing program) modes
- [ ] `(tabs)/progress` and `(tabs)/progress/exercise/[exerciseId]`
- [ ] `(tabs)/progress/exercise/[exerciseId]/details` (new exercise detail screen)
- [ ] `(tabs)/settings` and `(tabs)/settings/permissions` — last permission
      toggle is fully visible and tappable above the dock
- [ ] `(tabs)/journal` and `(tabs)/journal/[id]`

## 2. Exercise detail — text-first rendering (Requirements 2.3–2.5, 2.7)

On `(tabs)/progress/exercise/[exerciseId]/details`:

- [ ] Open a fully-enriched exercise (imported from free-exercise-db, or any
      exercise with `description`/`explanation`/chips populated). Confirm
      name, chips, description, and "How To" text are all visible and
      readable **before** the demonstration image finishes loading (throttle
      network to "Slow 3G" or airplane-mode-then-reconnect to observe this).
- [ ] Open a legacy/custom exercise with no enrichment data (e.g. a
      user-created exercise). Confirm the screen renders placeholder text
      ("No description available yet.", etc.) instead of blank space or an
      error, and chips section is simply absent (no empty box).
- [ ] With the device offline (airplane mode) and the image not previously
      cached, confirm the media area shows the placeholder graphic — never a
      crash, spinner stuck forever, or blank white screen.
- [ ] Force an image load failure (e.g. temporarily corrupt/rename a synced
      asset, or intercept the request) and confirm `ExerciseMedia` falls back
      to the placeholder rather than showing a broken-image icon.

## 3. Exercise attribution (Requirement 2.8)

- [ ] Open an exercise imported from free-exercise-db (`source_license` =
      `Unlicense`). Confirm **no** attribution text is shown.
- [ ] Manually set one exercise's `source`/`source_license` to a
      CC-BY-SA-style value (e.g. via Supabase Studio) and confirm attribution
      text **does** appear on its detail screen, naming the source and license.

## 4. Model picker (Requirements 6.1–6.9)

On the chat screen's model picker (tap the model pill in the chat dock):

- [ ] With a provider that has both curated and non-curated models exceeding
      5 total, confirm at most 5 models render for that provider, curated
      ones first.
- [ ] Scroll the picker sheet through its full content — confirm every
      provider section and every model is reachable by scroll (no clipped
      bottom section).
- [ ] As a non-BYOK user with no backend key for a provider, confirm that
      provider collapses to a single "— unavailable" row (no per-model list).
- [ ] Tap the collapsed "unavailable" row — confirm it navigates to
      Settings → API Keys.
- [ ] As a BYOK user (added your own key for a provider in Settings), confirm
      all listed models for that provider are selectable, not just curated ones.

## 5. Program archive / hide / purge (Requirements 3.1–3.8, 4.5, 4.12)

On the Program Library (`saved-programs.tsx`) and the program edit screen:

- [ ] Tap Delete on a program → confirm the confirmation dialog names the
      program and offers Archive (default) vs. Delete permanently.
- [ ] Choose Archive → confirm the program's status badge changes to
      "Archived" and it is no longer selectable as active, but still appears
      in the list.
- [ ] Toggle "Show hidden" off, then Hide an archived program → confirm it
      disappears from the default list; toggle "Show hidden" on → confirm it
      reappears with a "Hidden" badge.
- [ ] Choose Delete permanently on an archived program with logged session
      history → confirm the second, explicit confirmation appears, and after
      confirming, the program is gone from the list but a previously logged
      session referencing one of its days still opens correctly (its
      `program_day_id` link is simply cleared, not the session itself).
- [ ] Turn off network (airplane mode), archive a program, confirm the row
      updates immediately (optimistic UI), then reconnect and confirm the
      change persists on the server (refresh from another device/session).

## 6. Manual + agent session and exercise-instance edit/delete (Requirements 4.1–4.4, 4.6–4.8, 4.14)

- [ ] On `session/summary/[sessionId]`, tap "Add"/"Edit" on Notes, type text,
      Save → confirm the notes persist after navigating away and back.
- [ ] On the same screen, tap Delete → confirm the confirmation prompt, then
      confirm the session disappears from the Session Hub list, but a direct
      query of `logged_sets` for that session (e.g. via Supabase Studio) still
      shows the original rows (soft-delete, not a hard delete).
- [ ] On an active session screen (`session/[dayId]`), tap "Edit" on an
      exercise's target sets/reps, change values, Save → confirm the header
      updates immediately and the change is reflected if you reload the
      program elsewhere. Confirm the exercise's catalog entry (Exercise
      Library detail page) is unaffected.
- [ ] Tap "Remove" on an exercise instance mid-session → confirm the
      confirmation prompt, then confirm it disappears from today's plan
      while any sets already logged for it remain visible in the session
      summary afterward.
- [ ] Cancel out of both the notes edit and the instance edit forms without
      saving → confirm no changes were persisted.

## 7. Agent-initiated mutations — approval gate (Requirements 4.9–4.11)

With the relevant permission category set to "Approval required" in Settings
→ Permissions:

- [ ] Ask the agent to update or delete a session, add/update/remove an
      exercise from a program day, or archive/delete a program. Confirm a
      `pending_approval` proposal card renders in chat (not an immediate
      mutation) with a human-readable description of the change.
- [ ] Tap Approve → confirm the change actually applies (verify in the
      relevant screen) and the card updates to an "Applied" state.
- [ ] Repeat and tap Reject instead → confirm the entity is unchanged and the
      card shows a "Rejected"/"not applied" state.
- [ ] Switch the relevant category to "Auto-apply" in Settings → repeat the
      same agent request → confirm it applies immediately without a
      pending-approval card.

## 8. Offline/sync convergence (Requirements 3.7, 4.13, 4.14)

- [ ] With the device offline, perform one of each: archive a program, edit a
      session's notes, edit an exercise instance's target reps, delete an
      exercise instance. Confirm each change reflects immediately in the UI.
- [ ] Reconnect to the network and wait up to 30 seconds. Confirm all four
      changes are visible on a second device/session logged into the same
      account (i.e. they reached the server, not just local state).
- [ ] Force a genuine conflict (edit the same session's notes on two devices
      while one is offline, then reconnect) and confirm the app doesn't crash
      and one of the two edits deterministically wins — note whichever value
      is left over as expected/unexpected in your report.

## 9. First-run onboarding (Requirements 5.1–5.10)

- [ ] Sign up as a brand-new user → confirm the onboarding flow presents
      automatically within ~2 seconds of landing on the authenticated app.
- [ ] Tap Skip on the very first step → confirm the app proceeds to the main
      tabs and does not show onboarding again on next launch.
- [ ] As a fresh user, fill in only some fields (e.g. goal + equipment, skip
      the rest), then tap Skip on a later step → confirm the entered fields
      were saved (check Settings → Profile) and the unentered fields are
      empty, not defaulted to something incorrect.
- [ ] Complete the full flow for a fresh user → confirm all entered values
      appear correctly in Settings → Profile afterward.
- [ ] From Settings → Profile, tap "Set up with guided onboarding" as an
      existing user with values already set → confirm the flow opens
      pre-populated (or at least does not clear existing values on Skip) and
      completing/skipping it returns you to the app without re-showing on
      next launch.
- [ ] Force a save failure during onboarding (e.g. airplane mode right when
      tapping Finish) → confirm an error is shown, values remain in the form,
      and onboarding presents again on next launch (status was not marked
      resolved).

---

## Sign-off

| Area | iOS device/version | Android device/version | Result | Notes |
|---|---|---|---|---|
| 1. Dock clearance | | | | |
| 2. Exercise detail text-first | | | | |
| 3. Attribution | | | | |
| 4. Model picker | | | | |
| 5. Program archive/hide/purge | | | | |
| 6. Session/instance edit/delete | | | | |
| 7. Agent approval gate | | | | |
| 8. Offline/sync convergence | | | | |
| 9. Onboarding | | | | |
