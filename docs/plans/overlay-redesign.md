## 1. Goal

Redesign the overlay around a suggestion that is readable at a glance, with asking, screen capture, slides, transcript, and meeting context reachable through predictable navigation. Preserve live-meeting behavior, capture protection, ghost-mode shortcuts, and drafts while completing the composition-only objective of `dk-b7399dd8`.

## 2. Placement

### Product shape and benchmark

Use a **persistent answer surface plus one secondary workspace**, selected through a compact navigation rail:

**Answer · Ask · Screen · Slide · Transcript · Context**

Answer is the ordinary meeting default. A meeting that starts with a deck opens Slide once presentation hydration completes, unless the owner has already selected another workspace. Later slide, context, transcript, and ambient-suggestion events never change the workspace.

At the existing **380×460 DIP** default:

- The selected answer’s headline appears near the top, without scrolling past controls.
- Answer mode gives the remaining content area to the suggestion.
- Secondary workspaces retain an approximately 110–130 DIP answer preview above their content. Answer restores the complete reading surface.
- Every workspace takes one click or one shortcut while the overlay has focus.
- Switching workspaces preserves drafts, attachment, history selection, and reading position.
- No automatic arrival steals keyboard focus.

These are acceptance targets, not measured results. Confirm that the owner can identify the suggested response in roughly two seconds and switch tasks without searching through stacked controls.

Two relevant benchmarks:

| Comparable experience   | Observed pattern                                                                                                                                                                                                                                                                       | Application to Sanas                                                                                                                                                   |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Microsoft Teams Copilot | A dedicated meeting pane contains private questions, a composer, and a separate prompt picker; desktop users can pop the pane out. [Microsoft documentation](https://support.microsoft.com/en-gb/teams/copilot/catch-up-on-meetings-with-microsoft-365-copilot-in-teams?nochrome=true) | Give assistance a stable surface and disclose secondary actions deliberately. Sanas’s proposed persistent answer preview is a design inference for its smaller window. |
| Granola                 | Meeting-scoped Chat supports questions during a meeting, with a consistent entry point and explicit context scope. [Granola documentation](https://docs.granola.ai/help-center/getting-more-from-your-notes/chatting-with-your-meetings)                                               | Make Ask easy to find and keep its scope visibly tied to the current meeting. Keep organization and bulk editing in the main window.                                   |

### Inventory and destination

“Primary” means visible during a live call; “secondary” means directly reachable through the rail, preferences button, or selected answer’s actions.

| Existing piece                                                              | Authoritative state/dependency                                 | Destination and behavior                                                                                                                                              |
| --------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Listening, paused, idle, error                                              | `useTranscript()` → `MeetingState`                             | **Primary:** compact header status. Show paused/error truthfully; manual assistance remains available while paused.                                                   |
| Ghost control and restoration hint                                          | Main window click-through state; `overlay.onGhostState`        | **Primary:** named icon button and visible ghost indicator. Hint uses configured overlay shortcut.                                                                    |
| Opacity slider                                                              | `useOverlaySettings`, settings broadcasts, Electron opacity    | **Secondary:** preferences popover. Preserve 0.4–1 range and synchronization with Settings.                                                                           |
| System-audio warning                                                        | `MeetingState.captureWarning`                                  | **Primary when present:** persistent compact warning outside workspace content. Expand for the complete explanation; never dismiss the underlying condition locally.  |
| Meeting errors                                                              | `MeetingState.error`                                           | **Primary when present:** short status with expandable detail and Open Sanas action.                                                                                  |
| Answer every question                                                       | Per-meeting assist snapshot/events                             | **Secondary:** preferences. Show a small active indicator when enabled; changing it does not change the saved default.                                                |
| Selected suggestion and purpose                                             | `useSuggestionHistory`; purpose/manual-kind metadata           | **Primary:** headline, type, streaming/error state. Preserve Answer, Next point, Typed answer, Screen answer, Audience question, and detail distinctions.             |
| Suggestion body and code copying                                            | Shared `SuggestionContent` renderers                           | **Primary:** complete body in Answer mode. Detail and screen answers retain full rendering; compact rendering must not discard their prose.                           |
| Previous/next, index, Latest                                                | History reducer and selected transient ID                      | **Secondary answer actions:** one compact history row, displayed only when useful.                                                                                    |
| New answer indication                                                       | Latest versus selected history item                            | **Primary when relevant:** small actionable badge. Ambient arrivals preserve an older or scrolled answer; requested answers retain their existing selection behavior. |
| Earlier-context indication                                                  | Suggestion context revision versus current context             | **Primary metadata:** retain beside the answer, including its compact preview.                                                                                        |
| Answer now                                                                  | `assist.now`; active meeting and requested-lane availability   | **Primary action:** always reachable in answer chrome. Ambient generation alone must not disable it.                                                                  |
| More detail / Back to source                                                | Stored suggestion ID, grounding, source link, admission        | **Secondary answer actions:** stay attached to the relevant card. Preserve eligibility and source/detail navigation.                                                  |
| Typed composer                                                              | Text, admission pending/error, compose activation              | **Secondary: Ask.** Enter sends; Shift+Enter inserts a newline; IME remains intact; Escape preserves draft.                                                           |
| Attach / Replace / Remove screen                                            | Main-owned token; bounded thumbnail; `useCaptureDraft`         | **Ask attachment controls.** Preserve failed-replacement and rejected-send behavior.                                                                                  |
| Capture screen                                                              | `screenCapture.capture`; active meeting and requested lane     | **Secondary: Screen**, with a prominent Capture screen action and the existing global shortcut. Opening Screen alone never captures.                                  |
| Capturing / analyzing / failure                                             | Capture status subscription, initial snapshot, sequence number | **Primary compact feedback while relevant**, with full status in Screen. Keep feedback visible when another workspace is selected.                                    |
| Ask the audience                                                            | Requested-lane admission; recent finalized discussion          | **Secondary:** Ask workspace action, also available in Slide. One shared request handler; retain no-discussion feedback.                                              |
| Current slide, script, talking point, facts                                 | `usePresentationState`, current slide and revision             | **Secondary: Slide.** Title/ordinal remain prominent; script scrolls; facts expand.                                                                                   |
| Previous/next slide                                                         | Main presentation movement; configured global shortcuts        | **Slide controls**, plus unchanged global shortcuts in every workspace, including paused/ghosted operation.                                                           |
| Transcript tail and speaker labels                                          | Last 12 lines from shared live transcript buffer               | **Secondary: Transcript.** Preserve interim styling and teal/sand speaker meaning. Full historical transcript remains in main.                                        |
| Meeting-only context text                                                   | Context snapshot/revision; draft; explicit Apply               | **Secondary: Context.** Retain quick text editing, Apply, Reload, conflict feedback, and unsaved indication.                                                          |
| Full deck editor/import, reorder, restore, clear, continue-from             | Existing shared `MeetingContextEditor` and presentation editor | **Main window:** existing Live → Meeting context and slides editor. Remove this form from the overlay bundle.                                                         |
| Internal splitter and whisper maximize                                      | Ratio setting, measured content height, drag/maximize state    | Replace with Answer navigation and predictable workspace allocation. Retire splitter UI and its measurement machinery.                                                |
| Window movement and resizing                                                | Header drag region; renderer resize grips; main bounds fitting | Preserve **right, bottom, and corner grips**, saved bounds, minimum dimensions, and monitor handling.                                                                 |
| Meeting lifecycle, audio source, voice pinning, job setup, settings/history | Existing main-window pages                                     | **Main window.** Add a working Open Sanas action; do not duplicate lifecycle/audio ownership in the overlay.                                                          |

### Navigation and interaction contract

Use a narrow vertical rail with familiar icons, accessible names, and tooltips. Display text labels when width permits; keep the active workspace’s full name in its heading. The rail never becomes a second collection of action buttons.

| Action                                               | Access                                                            |
| ---------------------------------------------------- | ----------------------------------------------------------------- |
| Answer / Ask / Screen / Slide / Transcript / Context | Local `Ctrl+1` through `Ctrl+6`                                   |
| Overlay preferences                                  | Local `Ctrl+,`                                                    |
| Navigate rail                                        | Tab into rail; arrow keys and Home/End within it                  |
| Return to full answer                                | Answer rail item or `Ctrl+1`                                      |
| Show/hide/unghost overlay                            | Existing configurable global shortcut; default `Ctrl+Shift+Space` |
| Answer now                                           | Existing global shortcut; default `Ctrl+Shift+Enter`              |
| Open and focus Ask                                   | Existing global shortcut; default `Ctrl+Shift+K`                  |
| Capture and explain screen                           | Existing global shortcut; default `Ctrl+Shift+S`                  |
| Previous/next slide                                  | Existing globals; defaults `Ctrl+Alt+PageUp/PageDown`             |

Local navigation shortcuts are explicitly labeled **“while the overlay is focused.”** From another application, the existing Ask shortcut provides keyboard entry. Do not promise globally accessible workspace shortcuts.

Reserve the listed modified navigation chords deliberately, including in draft fields; suppress them during IME composition. Never intercept ordinary typing, selection, clipboard shortcuts, or unmodified arrows outside the rail.

Escape closes an open preferences/detail popover first and restores its trigger focus. Otherwise it returns to Answer and releases overlay focus while retaining drafts. Main’s `blur()` does not promise restoration of a particular external application.

Additional rules:

- The compose listener and readiness handshake live above conditional workspace rendering. A cold-start Ask intent opens Ask and focuses the mounted textarea.
- Successful typed submission clears only the submitted draft and consumed attachment; leave Ask open so the owner can continue. The response appears in the persistent answer surface.
- Requested answers select their card without changing the workspace or stealing focus.
- A global capture updates persistent feedback and the answer surface without forcing Screen open.
- Selecting Screen does not acquire an image. Capture screen sends immediately; Attach screen captures for the typed question and does not generate an answer.
- Slide remains a stable navigation destination without a deck, showing a useful empty state. It must not silently display Transcript.
- Workspace switches preserve context drafts and presentation scroll position. A presentation revision resets slide scroll; a new meeting resets meeting-owned drafts and history.
- Async completion for an old meeting must not clear or populate the next meeting’s draft.
- Hidden workspace content is removed from keyboard navigation; persistent controllers remain mounted.

### Layout and visual system

Reuse Sanas’s dark palette, teal accent, warm sand for the owner’s voice, Segoe UI system typography, and Cascadia code typography.

Define shared tokens for surfaces, text, borders, status colors, spacing, radii, focus rings, and control dimensions. Use 4/8/12/16 spacing, approximately 15–16px answer headlines, 13–14px body text, and 12px metadata. Standard controls are at least 28–32 DIP high; the minimum-height rail may use 24 DIP targets.

Provide one button vocabulary—primary, secondary, quiet, icon—and consistently styled text fields, toggles, range inputs, and navigation items. Cover default, hover, pressed/selected, focus-visible, disabled, busy, and error states. Style shared suggestion copy controls too. Nothing inside the overlay should fall back to browser-default styling.

Keep `overlay.css` as an import entry. Extract shared tokens from the library’s existing `base.css`; reuse `controls.css`, with scoped overlay adaptations. Put new CSS layers under the documented `app/styles/` home. Do not import the library’s opaque body or application shell into the overlay.

Window rules:

- Keep default **380×460** and minimum **280×230 DIP**.
- Workspace changes never resize or reposition the native window.
- At minimum height, secondary workspaces retain a compact answer preview; their own content scrolls. Answer mode always provides the full suggestion.
- Long code and scripts scroll within their content regions. Chrome, navigation, and resize handles remain reachable.
- Expanded warnings and preferences must scroll within the window, not extend beyond it.
- Keep Electron whole-window opacity as the sole user opacity setting; avoid multiplying it with a new root CSS opacity.
- Preserve transparent outer body, protected content, `screen-saver` always-on-top level, and all interactive `no-drag` regions.
- Use local assets and reduced-motion support. Announce state changes politely; do not announce every streamed token.

**Tradeoff:** removing the internal splitter loses arbitrary transcript/answer proportions. Predictable workspaces and a single-step full-answer view better serve the requested navigation improvement. Preserve the unused `overlayWhisperRatio` settings contract temporarily for compatibility; stop reading/writing it from the redesigned overlay.

### State mockups

Rail labels below are expanded for clarity; compact windows use icons with accessible labels. Brackets denote controls.

**Idle / no meeting**

```text
+------------------------------------------+
| SANAS   Idle                 [Ghost] [⋯] |
+---------+--------------------------------+
| Answer* | Start a meeting in Sanas.      |
| Ask     |                                |
| Screen  | [Open Sanas]                   |
| Slide   |                                |
| Transcr | Suggestions appear here        |
| Context | during your meeting.           |
+---------+-------------------------------◢+
```

Ask and capture actions are disabled without a meeting. Live with no suggestion instead says “Listening for key moments” and offers Answer now.

**Live suggestion**

```text
+------------------------------------------+
| SANAS   Listening            [Ghost] [⋯] |
| ! No system audio detected     [Details] |
+---------+--------------------------------+
| Answer* | ANSWER             [Answer now]|
| Ask     | Ship the pilot after the       |
| Screen  | audit-log check passes.        |
| Slide   |                                |
| Transcr | Supporting point or code...    |
| Context |                                |
|         | [<] 3/3 [>] [Latest]           |
|         | [More detail]                  |
+---------+-------------------------------◢+
```

**Asking / composer**

```text
+------------------------------------------+
| SANAS   Listening            [Ghost] [⋯] |
+---------+--------------------------------+
| Answer  | ANSWER                         |
| Ask*    | Ship after the audit-log check.|
| Screen  | [Read full answer]             |
| Slide   +--------------------------------+
| Transcr | Ask Sanas                      |
| Context | [What should we verify?      ] |
|         | [                            ] |
|         | [thumb] Display 2 [Replace] [×]|
|         | [Attach screen]         [Send] |
|         | [Ask the audience]             |
+---------+-------------------------------◢+
```

**Capture**

```text
+------------------------------------------+
| SANAS   Listening            [Ghost] [⋯] |
| Screen captured: Display 2 - analyzing   |
+---------+--------------------------------+
| Answer  | SCREEN ANSWER                  |
| Ask     | Reading the visible error...   |
| Screen* +--------------------------------+
| Slide   | Screen                         |
| Transcr | Captures the display under     |
| Context | this overlay.                  |
|         | [Capture screen]               |
|         | To add a question: [Open Ask]  |
|         | Screenshot is not saved.       |
+---------+-------------------------------◢+
```

Failure replaces the status with a readable explanation and an explicit retry action. Immediate capture has no invented persisted thumbnail.

**Presentation / slide**

```text
+------------------------------------------+
| SANAS   Listening            [Ghost] [⋯] |
+---------+--------------------------------+
| Answer  | NEXT POINT                     |
| Ask     | Explain how rollout is checked.|
| Screen  +--------------------------------+
| Slide*  | Slide 3/8       [Prev] [Next]   |
| Transcr | Rollout checkpoints            |
| Context | Main talking point             |
|         | Prepared script scrolls here...|
|         | [Key facts]                    |
|         | [Ask the audience]             |
+---------+-------------------------------◢+
```

**Transcript**

```text
+------------------------------------------+
| SANAS   Listening            [Ghost] [⋯] |
+---------+--------------------------------+
| Answer  | ANSWER / selected headline     |
| Ask     | [New answer]                   |
| Screen  +--------------------------------+
| Slide   | Transcript                     |
| Transcr*| Dana  What blocks the pilot?   |
| Context | Me    The audit check...       |
|         | Dana  Can we finish today?     |
|         | Interim text appears muted.    |
+---------+-------------------------------◢+
```

**Context**

```text
+------------------------------------------+
| SANAS   Listening            [Ghost] [⋯] |
+---------+--------------------------------+
| Answer  | ANSWER / selected headline     |
| Ask     | Based on earlier context       |
| Screen  +--------------------------------+
| Slide   | Meeting context     Unsaved    |
| Transcr | [Client-specific background  ] |
| Context*| [                            ] |
|         | [Apply] [Reload saved]         |
|         | Slides: 8                      |
|         | Edit slides in Sanas's Live    |
|         | page. [Open Sanas]             |
+---------+-------------------------------◢+
```

### File responsibilities

Paths below are relative to the repository root. Grouped filenames are individual files, not proposed catch-all modules.

| New or changed files                                                                                                                                | Responsibility and placement                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/renderer/src/overlay-app/Overlay.tsx`                                                                                                          | Composition only: assemble lifecycle boundary and shell. No subscriptions, request handlers, drag calculations, or navigation effects. Target under 100 lines.                                                  |
| `overlay-app/shell/OverlaySession.tsx`                                                                                                              | Stable meeting-lifetime composition of domain hooks and explicit view-model props. No duplicated domain reducers or request policy. Target under 150 lines.                                                     |
| `overlay-app/shell/OverlayShell.tsx`, `OverlayHeader.tsx`, `OverlayStatus.tsx`, `OverlayPreferences.tsx`                                            | Window layout, header controls, persistent status, and preferences respectively. Extract markup from `Overlay.tsx`; keep responsibilities separate.                                                             |
| `overlay-app/shell/useOverlayWindowState.ts`                                                                                                        | Ghost subscription and configured shortcut/status presentation. Window-lifetime state belongs outside meeting-keyed drafts.                                                                                     |
| `overlay-app/navigation/overlay-navigation.ts`, `useOverlayNavigation.ts`, `OverlayNavigation.tsx`                                                  | Pure workspace transitions, React binding, and accessible rail respectively. Navigation owns neither assistance nor capture state.                                                                              |
| `overlay-app/navigation/overlay-shortcuts.ts`, `useComposerActivation.ts`                                                                           | Local shortcut definitions/dispatch and always-mounted compose readiness/focus handshake.                                                                                                                       |
| `overlay-app/suggestions/OverlaySuggestions.tsx`                                                                                                    | Move existing component; reduce it to selected-answer rendering, history controls, and card actions. Remove composer/capture ownership.                                                                         |
| `overlay-app/suggestions/useOverlaySuggestions.ts`, `useManualRequests.ts`                                                                          | Extract history/reading coordination and manual admission feedback separately. Reuse shared history reducer and renderer unchanged.                                                                             |
| `overlay-app/composer/OverlayComposer.tsx`, `composer-state.ts`, `useOverlayComposer.ts`                                                            | Move composer view; extract its existing pure helpers and submission/draft ownership. Keep capture attachment hook here, above conditional presentation of the view.                                            |
| `overlay-app/capture/OverlayCaptureAction.tsx`, `useCaptureStatus.ts`, `capture-status.ts`, `OverlayCapturePanel.tsx`                               | Keep capture action in its existing home; extract subscription/hydration and pure status helpers; add Screen workspace. Status remains mounted across navigation.                                               |
| `overlay-app/capture/useCaptureDraft.ts`                                                                                                            | Preserve attachment reducer; make meeting-lifetime/late-completion guards explicit where controller extraction requires them.                                                                                   |
| `overlay-app/presentation/SlidePanel.tsx`                                                                                                           | Move current panel; style controls and accept shared audience action/shortcut hints. Preserve cursor behavior.                                                                                                  |
| `overlay-app/transcript/OverlayTranscript.tsx`                                                                                                      | Extract transcript tail, speaker rendering, and its scroll behavior from `Overlay.tsx`.                                                                                                                         |
| `overlay-app/context/OverlayContext.tsx`                                                                                                            | Compact text-only context editor and main-window handoff. No slide editor import.                                                                                                                               |
| `overlay-app/shell/AnswerEveryQuestion.tsx`                                                                                                         | Move existing toggle into preferences; retain its authoritative snapshot/event behavior.                                                                                                                        |
| `overlay-app/controls/OverlayButton.tsx`, `OverlayTextArea.tsx`                                                                                     | Small semantic wrappers for repeated control variants, labels, and busy/disabled behavior. Navigation itself is the tab component; do not create a general component framework.                                 |
| `overlay-app/layout/useOverlaySettings.ts`                                                                                                          | Retain opacity load/save/sync; remove split-ratio ownership after navigation ships.                                                                                                                             |
| `overlay-app/layout/OverlayResizeHandles.tsx`                                                                                                       | Extract three grips from `Overlay.tsx`; reuse `useOverlayResize.ts` and validated IPC.                                                                                                                          |
| `overlay-app/layout/useSplitDrag.ts`, `overlay-split.ts`, `overlay-split.test.ts`                                                                   | Retire once the last splitter caller is removed. Do not retain unused layout machinery.                                                                                                                         |
| `src/renderer/src/lib/meeting/useMeetingContextDraft.ts`, `meeting-context-draft.ts`                                                                | Extract shared draft/apply/reload/conflict behavior from `MeetingContextEditor`; both full main editor and compact overlay editor use it. Text-only Apply omits deck changes.                                   |
| `src/renderer/src/lib/meeting/MeetingContextEditor.tsx`                                                                                             | Keep full deck UI for its existing `LiveMeetingPage` caller; delegate draft behavior to extracted hook.                                                                                                         |
| `src/renderer/src/app/styles/tokens.css`, `base.css`                                                                                                | Extract genuinely duplicated palette/type tokens; `base.css` imports them and retains library base rules.                                                                                                       |
| `src/renderer/src/app/styles/overlay-controls.css`, `overlay-shell.css`, `overlay-panels.css`, `overlay-suggestions.css`; `overlay-app/overlay.css` | Scoped control adaptations, geometry, workspace presentation, suggestion presentation; thin overlay import entry reuses shared tokens and existing `controls.css`. Keep each layer below roughly 300–400 lines. |
| `src/renderer/src/app/settings/HotkeysSection.tsx`                                                                                                  | Document local overlay shortcuts separately from registered global shortcuts. Import the pure local shortcut definitions rather than duplicate labels.                                                          |
| `src/main/windows/main-window.ts`                                                                                                                   | Make existing-window reveal restore if minimized, show, and focus without reload. Existing startup/second-instance callers retain the same public entry point.                                                  |
| `src/main/ipc/windows.ts`, `index.ts`, `live-controls.ts`                                                                                           | Extract window handlers from existing registrars into a window-specific registrar; add parameterless Open Sanas handler. Keep validation/delegation boundaries.                                                 |
| `src/shared/ipc.ts`, `src/preload/index.ts`                                                                                                         | Add explicit typed `MainWindowShow` channel and `app.showMain()` bridge method. No generic invoke surface.                                                                                                      |
| `src/renderer/src/dev/mock-api.ts`, `mock-live-controls.ts`, `mock-screen-capture.ts`, `mock-presentation.ts`; new `overlay-scenarios.ts`           | Wire the new bridge and deterministic preview states. Put new scenario data in its own file; `mock-api.ts` is already about 660 lines.                                                                          |

All shortened `overlay-app/…` paths above are under `src/renderer/src/`.

`src/main/windows/overlay-window.ts`, `overlay-bounds.ts`, shared hotkey contracts/registration, and capture services remain authoritative. Their existing window and service semantics need no redesign. Extend their relevant tests rather than rewriting those services.

No production file should approach 800 lines. Finish extraction before adding functionality to an already mixed-responsibility file.

## 3. Sequence

### Phase 1 — Consistent controls and stable state ownership

1. Extract shared style tokens and establish overlay control styling across the existing UI.
2. Move composer/history/capture state into the named domain hooks; retain the existing layout temporarily.
3. Lift compose activation/readiness above conditional views. Preserve meeting-keyed draft reset behavior and guard late async replies.
4. Extract window chrome and resize handles from `Overlay.tsx`.

**Callers changed:** overlay entry components and their tests; library `base.css` imports shared tokens. Shared suggestion renderers and backend APIs keep their contracts.

**Shippable acceptance:** the old layout still works, but every control is styled consistently. Drafts, attachment replacement, history reading, opacity, ghost restoration, and all three resize grips behave as before. Cold-start Ask still focuses its textarea.

Run the fast gate.

### Phase 2 — Answer-first shell and navigation

1. Introduce rail, navigation reducer, local shortcuts, and persistent answer/status regions.
2. Place Ask and Screen in dedicated workspaces; initially host existing Slide, Transcript, and Context views through the new shell.
3. Put opacity and Answer every question in preferences. Keep actionable audio warnings and capture progress outside workspaces.
4. Replace internal split/maximize behavior with Answer mode; remove splitter helpers and ratio persistence.
5. Preserve the six global shortcuts and distinguish local shortcuts in Settings/help.

**Callers changed:** shell consumes domain view models; `OverlaySuggestions` no longer mounts composer or capture controls. `HotkeysSection` gains local shortcut documentation.

**Shippable acceptance:** at 380×460, the suggestion appears before secondary tools. Every workspace is directly accessible. Switching Ask → Slide → Ask preserves text and screenshot; ambient arrivals preserve reading; requested answers select correctly without changing workspace or keyboard focus.

Run the fast gate.

### Phase 3 — Focused secondary workspaces and main-window handoff

1. Extract shared context-draft behavior, then replace overlay’s full editor with text-only Context.
2. Add Open Sanas through typed IPC and robust main-window reveal.
3. Refine Slide and Transcript views: explicit empty states, slide ordinal/title, scrolling script, current shortcut hints, and shared audience action.
4. Keep full deck editing in the existing main Live editor.
5. Complete Screen’s capture/error/attachment guidance without changing capture admission or persistence.

**Callers changed:** `MeetingContextEditor` and `OverlayContext` share draft logic; IPC registrars/preload/mock bridge gain main reveal; Slide and Ask share the same audience request handler.

**Shippable acceptance:** context edits apply explicitly and conflicts preserve unsaved text. Text-only Apply never changes slides. Open Sanas restores a minimized main window without reloading it. Full deck editing remains available in Live. Slide shortcuts work while paused, ghosted, and while another workspace is selected.

Open Sanas preserves the existing main page. Do not add route switching or remount `LiveMeetingPage`: it currently owns the microphone capture session.

Run the fast gate plus targeted window/IPC tests.

### Phase 4 — Compact-window and accessibility acceptance

1. Add deterministic preview scenarios for all illustrated states, long content, busy/rejected requests, warnings, paused meetings, and empty decks.
2. Finish responsive sizing, rail focus behavior, popover dismissal, reduced motion, and visible disabled/error states.
3. Complete native Windows checks for focus, protection, monitor geometry, and resize affordances.
4. Update living docs and close the folded extraction work only after its acceptance is verified.

**Callers changed:** preview scenario adapters and the scoped presentation layers; no new service behavior.

**Shippable acceptance:** default, minimum, and enlarged windows remain usable; controls do not overlap grips; secondary content scrolls; primary status remains visible. The owner can perform the task-switching benchmark during a realistic call.

Run the fast gate, build once, and perform the native checks below.

## 4. Tests

Use existing Vitest pure-state and static-render patterns. This redesign does not require introducing a broad browser-testing framework.

| Test file                                                    | Required coverage                                                                                                                                                                         |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `overlay-app/navigation/overlay-navigation.test.ts`          | Default workspace; initial deck selection only before user choice; meeting reset; no workspace changes from ambient/slide/context updates; Escape transitions.                            |
| `overlay-app/navigation/overlay-shortcuts.test.ts`           | Six local destinations; preferences; IME guard; deliberate modified chords in editors; ordinary typing/arrows untouched.                                                                  |
| `overlay-app/navigation/useComposerActivation.test.ts`       | Listener installed before readiness; pending activation delivered after workspace/input availability; cleanup/remount does not lose or duplicate intent. Use controlled bridge callbacks. |
| `overlay-app/composer/composer-state.test.ts`                | Move existing composer tests; retain Enter/Shift+Enter/IME/Escape, rejection/failure preservation, accepted clear, and attachment-expired behavior.                                       |
| `overlay-app/composer/useOverlayComposer.test.ts`            | Deferred admission and attachment replies cannot mutate another meeting; navigation does not reset draft ownership.                                                                       |
| `overlay-app/capture/capture-status.test.ts`                 | Move existing capture-status tests: sequence ordering, stale initial fetch, meeting filtering, capturing/analyzing/failure.                                                               |
| `overlay-app/capture/useCaptureDraft.test.ts`                | Preserve replacement/removal tests; extend for meeting change while attachment acquisition is pending.                                                                                    |
| `overlay-app/suggestions/useManualRequests.test.ts`          | Stored source ID, detail eligibility, existing child selection, rejected admission feedback, requested-versus-ambient busy distinction.                                                   |
| `overlay-app/shell/OverlayShell.test.tsx`                    | Static rendering of all workspaces: primary answer/status exists, selected navigation is named, hidden panels are not focusable, no full deck editor in overlay.                          |
| `src/renderer/src/lib/meeting/meeting-context-draft.test.ts` | Text-only payload omits deck; revision conflicts preserve draft; explicit Reload; full editor retains restore/clear/ordinal behavior.                                                     |
| `src/main/windows/main-window.test.ts`                       | Existing minimized/hidden window is restored/shown/focused without reload; creation still works.                                                                                          |
| `src/main/ipc/windows.test.ts`                               | Each window handler registered once; resize/click-through validation retained; parameterless main reveal delegates.                                                                       |
| `src/main/windows/overlay-window.test.ts`                    | Preserve protected construction, passive reveal without focus, cold compose delivery, unghosting, and focus release.                                                                      |

Retain existing opacity, CSP, shared suggestion rendering/history, meeting-state, context-state, presentation-state, and bounds tests.

Explicitly verify these behavioral combinations in the preview/native walkthrough:

- Older answer selected → ambient answer arrives → older answer stays; Latest resumes following.
- Scrolled answer → workspace switch → return → reading position and lock survive.
- Draft plus attachment → rejected Send → both remain.
- Failed attachment replacement → prior attachment remains.
- Capture preparation → competing requested answer → readable busy result.
- Slide/context change → coach cards clear; ordinary and streaming answers remain.
- Global Ask from hidden/ghosted overlay → Ask opens, unghosts, focuses.
- Global slide movement while ghosted → slide updates without focus.
- Screen/detail answer → complete prose remains accessible.

No builds or tests were run during planning.

## 5. Verification

Run after each phase:

- `npm run typecheck`
- `npm run lint`
- `npm test -- src/renderer/src/overlay-app src/renderer/src/lib/suggestions src/renderer/src/lib/meeting`

For the window/IPC phase, add:

- `npm test -- src/main/windows src/main/ipc/windows.test.ts src/main/ipc/validate.test.ts`

Run hotkey registration tests only if that implementation changes:

- `npm test -- src/main/services/hotkeys/registration.test.ts`

After the completed UI change, run `npm run build`. Use targeted formatting checks on changed files. Do not run the full test suite, packaging, native database suites, or release workflow for this redesign.

Use `npm run dev:web` and `overlay.html?demo=live` for visual iteration, with the new deterministic scenarios. Preview cannot establish native transparency, ghost behavior, or protection.

For native acceptance, use `npm run dev` in a real terminal. If launched noninteractively, follow GOTCHAS: build, then launch `./node_modules/electron/dist/electron.exe out/main/index.js`.

Confirm in the running Windows app:

1. Default 380×460, minimum 280×230, enlarged dimensions, and Windows display scaling produce readable content and reachable controls.
2. Right, bottom, and corner grips work; moving/resizing persists; workspace switches preserve native bounds.
3. Negative monitor coordinates, mixed scaling, and monitor removal retain the existing bounds-fitting behavior.
4. Overlay opacity remains synchronized with Settings. Text and focus indicators remain usable across the supported range.
5. Screen sharing/screenshots omit or obscure the overlay according to platform behavior; protection remains unconditional.
6. Passive answer/capture reveal does not steal focus. Explicit Ask does; Escape releases it.
7. Slide shortcuts continue while the presentation application has focus and while the overlay is hidden, paused, or ghosted.
8. Capture targets the display under the overlay, including hidden-overlay shortcut capture. Failures remain visible without disabling protection.
9. Opening Sanas does not reload its renderer, remount the current Live page, or interrupt capture.
10. The owner can read a suggestion at a glance, ask with an attachment, inspect a slide/transcript, and return to the answer without losing work.

## 6. Docs

- **`STRUCTURE.md`:** add enforced homes for overlay shell, navigation, suggestions, composer, controls, context, transcript, and presentation; document shared context-draft logic and CSS layers; remove retired split-hook descriptions.
- **`docs/ARCHITECTURE.md`:** describe stable overlay controllers versus conditional views, compose readiness ownership, local navigation, and explicit main-window reveal.
- **`docs/FEATURES.md`:** replace stacked-overlay descriptions with Answer plus workspaces; document local shortcuts, retained globals, compact context editing, and main-window deck editing.
- **`docs/GOTCHAS.md`:** record draft/subscription lifetime, focus rules, minimum-size behavior, retired splitter compatibility, and why Open Sanas does not reroute the main renderer.
- **`docs/DECISIONS.md`:** record answer-first navigation, one secondary workspace, main-window bulk editing, splitter removal, and unchanged ephemeral capture semantics.
- **`docs/plans/overlay-redesign.md`:** save this spec as the implementation reference.

Fold `dk-b7399dd8` into this work rather than creating a duplicate extraction task. Its requested layout hooks already exist; the remaining work is composition, state ownership, and navigation.

Before the implementer’s first item write, run `docket guide`, then inspect/claim through `dk` in the actual worktree. Reconcile item status after verification, release the claim when finished, and run `dk check` before pushing. Do not edit item Markdown directly or treat open notes as approved requirements.

## 7. Open questions / assumptions

| Product choice                                         | Recommendation and planning assumption                                                                                                                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Persistent answer versus full-screen task tabs         | Keep a readable answer preview in secondary workspaces; use Answer for full reading. This preserves the overlay’s purpose while making room for tasks.                                           |
| Retain arbitrary internal split sizing?                | Remove it. Keep native resizing and explicit Answer navigation. Accept the loss of custom pane proportions for a simpler layout.                                                                 |
| Default presentation workspace                         | Open Slide once for a meeting that starts with a deck; otherwise Answer. Never override a workspace the owner has already chosen.                                                                |
| Context editing during a call                          | Keep meeting-text edits in the overlay; move bulk deck operations to the existing main editor. Unsaved overlay text is not silently transferred or applied when opening main.                    |
| Add more global shortcuts?                             | Keep the six existing globals. Add local workspace shortcuts first; avoid additional registration collisions until there is demonstrated need.                                                   |
| Automatically leave Ask after Send?                    | Keep Ask open and show the response above it. Answer remains one click/chord away.                                                                                                               |
| Screenshot review before immediate capture submission? | Preserve current explicit Capture screen behavior. Use Attach screen for preview-plus-question workflows. No new confirmation step, capture picker, or persisted image history.                  |
| Main-window handoff                                    | Label it Open Sanas and preserve the current page. Context explains the existing Live-page destination. Deep linking would need separate attention to Live page/audio lifetime.                  |
| Job/client identity in overlay header                  | Keep this release tied to the current meeting without adding an asynchronous job lookup. A reliable client-name header needs an explicit data contract; do not infer it from stale UI selection. |

Repository evidence overrides older plan details:

- `live-controls.md` and the Docket item describe a larger `Overlay.tsx` and hooks that have already been extracted into `layout/`.
- Current history behavior locks on older selection or actual scrolling; older hover/grace proposals are not the implemented contract.
- `screen-capture.md`’s owner scope cut supersedes its earlier persistence design: no saved images, screenshot replay, schema migration, or capture-lane reservation.
- The Docket command reported `DOCKET_NOT_A_REPO` in this planning environment. No item was claimed or changed; verify authoritative item state in the implementation worktree.
- The supplied photo represents installed v0.1.4; the checked-in package uses the repository’s unstamped development version. It is visual evidence, not proof that every photographed behavior matches this source tree.

## 8. Owner decisions (2026-11-01) — these override section 7 where they differ

- Persistent answer preview above every secondary workspace: **yes** (as recommended).
- Internal divider: **KEEP a draggable divider** between the answer preview and the workspace below it (overrides "remove it"). Keep the ratio persisted; the Answer workspace still gives the answer the full pane. Reuse/adapt the existing `useSplitDrag`/`overlay-split` logic rather than retiring it.
- Deck meetings: **always open on Answer** (overrides "open Slide once"). No automatic workspace switch ever.
- Job/client header: **not in this redesign**; filed as a follow-up item.
- Accepted as recommended: text-only Context in overlay with full deck editing in main; no new global shortcuts (Ctrl+1–6 local only); Ask stays open after Send; Capture screen sends immediately, Attach screen for preview+question; "Open Sanas" restores main on its current page.
