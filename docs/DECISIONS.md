# Sanas — Decisions

_Design/architecture decisions, newest first. Why we chose what we chose, and what we rejected._

## 2026-11-04 — Answers anchor on the current question; earlier talk is background

A real interview review found about a quarter of the technical-section answers dragged an
earlier topic's technology or project story into a new question ("broken record"). Causes: the
newest-6,000-char window was mostly the previous topic and nothing labelled it background;
Answer now carried no focus turn at all; the anti-repeat list was 3 headlines (the stories sat
in body lines) and absent on Answer now. Now every answer request carries the question it
answers (Answer now: the latest substantial other-speaker turn, `turns/latest-question.ts`),
the prompt shows "Earlier conversation (background only)" (2,500 chars) then "Current
exchange" (question onward, 4,000 chars), the system prompt gains a current-question rule, and
told stories (last 6, headline + first prose line) replace the headline list in automatic and
Answer now prompts. Next points follow the same shape and may not introduce a technology,
employer or project Me has not mentioned. Typed, capture, audience and More-detail prompts are
unchanged (an explicit ask outranks dedupe). Rejected: shrinking the window (loses follow-up
context); dropping earlier transcript (follow-ups like "a service like that" need it); deduping
by headline only (already failed). Checked by the paid `scripts/eval/topic-switch.ps1`
(invented fixture, old vs new prompts).

_Follow-up, same day:_ the first eval showed Node-services questions still reaching for the
federation story and factual checks running past 40 words. The system rule now says: when the
asked technology is in several resume roles, pick the best match that is not already told (even
if older; "recently" is not a reason to go back), and if the only match was told, answer at the
level of the technology; a back-reference ("like that") means the immediately preceding
exchange. Factual/inventory checks are capped at 40 words in the system prompt and the
initial-answer-depth rule. The eval scorer counts a bare employer name only in a strict tally;
the corrected tally ignores it and ignores terms from the exchange a question refers back to.

## 2026-11-04 — One slow classifier check must not blank automatic answers

Owner report (v0.1.15): a single 2.5 s Haiku timeout suspended all automatic answers for 30 s and showed the unavailable banner. A failed or slow check now fails closed for its own turn only; suspension (30 s, banner) needs 3 consecutive failures, and any success resets the count. Deadline stays 2.5 s. Rejected: raising the deadline (adds latency to every answer).

## 2026-11-04 — The resume lives on the job (owner reversal)

Owner ruling: one job per interview, so the resume belongs to the job, not to each Start.
Supersedes the ownership part of 2026-11-03 "Immutable per-meeting candidate facts" (a draft
attached at every Start, including Unsorted). Plan: `docs/plans/job-resume.md`.

- **Saved per job.** Schema v11 `job_resumes` (one optional row per job: display name + extracted
  text, never the binary or path). Edited on the job's own **Resume** tab with an explicit
  **Save resume**, like Presentation; the header Save does not cover it. No row = no resume.
- **Snapshotted at Start.** Main reads the selected job's saved resume inside serialized Start
  (`context/start-grounding.ts`) and copies it onto the meeting through the unchanged v9 columns
  and immutability trigger. Editing or removing the job's resume affects only later meetings;
  live, paused and past meetings keep theirs. Live and Mock share this path; neither Start
  accepts an attachment any more.
- **Unsorted gets none.** Starting with no job resolves the resume to null before the fallback
  bucket job is supplied. (Explicitly choosing a stored job named "Unsorted" is ordinary job
  selection; the Live picker hides that row.)
- **Interview default.** Live's checkbox defaults on when the selected job has a saved resume;
  an explicit choice wins and is sent; an untouched box sends nothing and main decides from what
  is saved at Start. Mock always applies the profile. Precedence (resume, then profile) unchanged.
- **Assumed defaults (plan §7):** no backfill from past meetings into jobs; Mock uses the saved job
  resume with no per-session override.
- Kept from 2026-11-03: immutable meeting snapshots, merge refusal, untrusted-data framing,
  local-only privacy, deterministic STT hints, offline PDF/DOCX import (now a draft on the Resume
  tab).
- Rejected: reading the job's resume live during a meeting (history and grounding would change
  under the user); a reusable resume library (one job per interview makes it unnecessary);
  auto-saving on import (an import is a draft until saved).

## 2026-11-04 — The mock interviewer waits for the candidate's answer

Owner report (v0.1.13): "the mock interview is moving too fast". Silence was measured from the end
of the question, so reading a suggestion or thinking got cut off.

- **Silence counts only after the candidate has spoken** (user-role interim or final text; raw mic
  VAD only extends an answer, never starts one; interviewer speech never counts). Then 4000 ms of
  candidate silence (`silenceMs` in both live plans, was 2500) advances.
- **Safety net:** if the candidate never speaks, one gentle spoken prompt after 30 s ("Take your
  time — whenever you are ready."), not a transcript turn; Skip (Ctrl+Alt+Right) and the plan's
  duration limit still apply.
- Rejected: counting silence from the end of the question with a longer value (still cuts off
  thinkers); repeating the prompt (nagging).

## 2026-11-04 — Speculative answers and a 150 ms turn grace (answer latency)

The owner found automatic answers slow. The path was serial: endpoint + 350 ms grace + Haiku
verdict (warm median 697 ms) + Sonnet first token (warm median 1,182 ms). Plan:
`docs/plans/answer-latency-diagnosis.md`.

- **Speculate the answer alongside the classifier.** When classification starts on a free ambient
  lane, the `question me` answer starts too, unpublished, and is promoted only if the verdict's
  ordinary request is the identical prompt; anything else discards it silently and the ordinary
  path runs. Saves min(classifier, answer TTFT): ~0.7 s per accepted question. **Accepted cost:**
  one extra answer call per classified candidate the classifier rejects or retargets (none,
  other, request, room, failures), plus the ordinary call that replaces a mismatch. Counted in
  diagnostics and a Stop log line. Fail-closed visibility is kept: nothing is shown or stored
  before acceptance, and cooldown/ledger are consumed only on promotion.
- **Grace 350 → 150 ms**, endpointing (600 ms) and the 1.8 s fallback unchanged: ~0.2 s on every
  boundary-completed turn. Tradeoff: speech resuming 150–350 ms after a boundary's arrival now
  starts a new turn instead of continuing (a premature answer, then a superseded one). Live,
  Deepgram only endpoints after 600 ms of silence, so short pauses never reach the grace.
- Rejected: speculating every verdict type (silently changes addressee semantics); speculating on
  interims (unstable text, far more spend); a second automatic-answer pipeline; removing classifier
  spacing or cooldown (no measured cost); a shorter classifier prompt or endpointing change in the
  same step (one proven change at a time).
- Expected: first readable text ≈1.9 s after speech end, from ≈2.8 s.

## 2026-11-03 — One meeting-grounding read

Resume and Interview profile are two snapshots of the same idea: what the user can truthfully say about
themselves in this meeting. They are read together by `getMeetingGrounding(id)` (`{ resume, interviewProfile,
hasBiography }`) and every consumer (STT hints, candidate facts, re-diarize, merge guard, status cue, prompt
fallback) uses it, so "no biography" has one definition and the service holds no resume/profile caches.
Escaping/framing live in neutral `context/candidate-data.ts` so the two artifacts do not import each other.
Rejected: keeping per-artifact getters plus caches in `meetings/index.ts` (two sources of truth, drift risk).
A renderer-facing `StartRequest` is separate from the main-resolved `MeetingCreateInput`, so a renderer-supplied
profile is unrepresentable.

## 2026-11-03 — Permanent profile, scoped to interviews

Keep one plain-text Interview profile in the existing local Settings JSON, with the same
Save/Discard workflow as other settings. This is reusable biography, not job context or a
resume replacement; a separate profile database/editor would add needless machinery.
The profile has a 40,000-character limit and guidance for About me, Go-to stories,
Strengths and weaknesses, Why I'm looking, Rate and availability, and Anything else.

Only main's Start path selects the saved text. Mock always applies it. Live's Interview
checkbox defaults off, turns on when a resume is attached, and permits an explicit off
override. Editing an existing attachment preserves that override; a new import enables
it again. Successful Start resets the draft toggle. _(Since 2026-11-04 the default follows
the selected job's saved resume; see that entry.)_ Ordinary work meetings receive no
profile. An omitted service option defaults to resume presence for older Start callers.

Schema v10 stores the selected text with the meeting in the creation transaction and
rejects later changes with an immutability trigger. Settings edits and historical filing
never rewrite it. History exposes a profile-used flag rather than copying biography onto
every renderer meeting object. Profile-bearing merges are refused, as resume merges are,
until provenance-preserving merging exists.

Grounding precedence is per-meeting resume, then general profile stories, then plausible
marked filler. Both prompt bases and saved More detail grounding contain the escaped
snapshot. Profile markup uses the resume's escaping function and is framed as data, never
instructions. Summaries can use it as background, never evidence of speech. Employer/tech
hints use the existing heuristic through meetingKeyterms for streaming, resume and batch;
provider budgets stay behind SttProvider. No new endpoint: selected profile data leaves
only through the configured assistant and derived STT hints, with existing summary/email
behavior. The practice cue is now “No resume or profile” only when both are empty.
Model-backed quality and injection resistance are NOT VERIFIED by deterministic tests.

## 2026-11-03 — Always a usable answer: plausible filler, marked

Owner decision (chat, 2026-11-03), superseding the Nov 2/3 "never invent personal history"
policy and the "No resume attached" limitation notice: "even with no resume, it should still be
fabricating ambiguous answers, even with a resume it might not have the details to answer a
question thoroughly." Sanas always gives a speakable answer. Supplied candidate facts come first
and are never contradicted; with none, or thin ones, the model writes a plausible first-person
answer in general but concrete-sounding terms ("a payments integration where I owned the API
layer"), avoiding hard-to-defend specifics (exact metrics, named employers or clients, dates, team
sizes) and keeping uncertain numbers hedged. No stalling lines, no "Let me check the exact count",
no fill-in [placeholder] templates in live answers; More detail extends the same story the same way.
Only a garbled or cut-off ask still earns a short clarification.

Marker: anything not backed by supplied facts or the transcript is wrapped in `⟨…⟩` (U+27E8/27E9).
Chosen because it is a single pair of characters that never occurs in speech, code or Markdown, so
no escaping or parser change is needed; the safe renderers dim it (italic, reduced opacity) and
every plain-text surface (Markdown export, remembered headlines) strips it, leaving speakable prose.
Stray or unclosed markers (streaming prefixes) degrade safely. The practice-meeting "No resume"
status cue stays. Prompt tests establish instructions and wiring only; paid-model compliance
(marker use, restraint on specifics) is NOT VERIFIED.

(Superseded in part: the earlier entry below.)

## 2026-11-03 — Open experience answers need biography, not a stall

Refine the missing-fact policy: open behavioural asks are not short screening checks.
With supplied candidate facts, name one specific project or employer in the first speakable
sentence, then give problem → action → result in at most two supporting lines within the
80-word compact target. Omit unsupported details and preserve uncertainty in numbers.
Without biography or a resume, show “No resume attached — I can't draw on your experience
for this”, with at most one structure hint. A resume with no relevant facts gets an honest
missing-experience notice instead. Explicit biography in notes or speech still counts;
job descriptions and fictional practice plans do not. Factual verification keeps its short
clarification policy; More detail remains grounded to its saved source.

Mock setup reuses the existing per-meeting attachment and validation. The persistent
“No resume” cue is practice-only and depends on attachment absence, not inferred job intent:
there is no reliable resume-expected flag for ordinary jobs. Ordinary work meetings are not
nagged. The cue is independent of any biography supplied in notes and survives pause/resume.
Prompt tests establish instructions and wiring, not paid-model compliance.

## 2026-11-02 — Mock interview is a product flow with practice records

Owner request: use saved app keys, choose a plan/job and press Start in a Mock interview tab.
Promote the one engine into `services/mock-interview/`, bundle its plans/screens, and retire
the live script launcher. Scripted/audio tiers remain isolated automated harnesses. The app
uses the normal This PC capture helper and meeting service; both capture-owning pages remain
mounted across tabs. No provider keys, network access or suggestions enter the interviewer UI
or interviewer prompt. Keep the existing provider seam and deterministic planned fallback.

Use a schema flag, not a title prefix or isolated database, to distinguish practice. v8 defaults
old rows to normal; normal lists/search/history retrieval exclude practice centrally in repos.
Full records/results remain available in past practice sessions. Refuse practice merges and
skip automatic summary email; explicit single-session actions remain available. Retention and
startup recovery still manage all records, including practice storage.

Choose renderer speechSynthesis with an explicitly local Windows voice. This avoids spawning
PowerShell, supports cancellation/ACK from the visible window and uses default output for real
loopback. Reject unavailable local voices instead of silently using a remote service. A bounded
ACK timeout ends capture on output failure. Offline voice availability, actual Windows playback
and loopback are owner acceptance checks; stubbed tests cannot establish hardware behavior.
Keep first-visible as broadcast evidence and label it; do not claim compositor timing.

## 2026-11-02 — Live rehearsal counterpart uses the existing assistant transport

**Superseded by the product decision above; retained as history.**

Keep the guided interviewer under `rehearsal/live/` as a separate consumer of
`AssistantProvider`, using Claude through the existing main-only SDK implementation.
Its explicit input contains persona, current/next question and finals from both channels;
it never reads the suggestion store, assistant prompt or suggestion stream. Projecting those
fields at the provider boundary prevents accidental extra properties from leaking suggestions.
The engine enforces topic order, follow-up caps and total duration; model output only selects
a permitted follow-up or the next planned topic. Invalid/failed/timed-out generation falls
back to the next planned question. Reuse the transport/key rules rather than adding an SDK
client or allowing the model to control screens or meeting lifecycle.

Use the normal owner-started Live page capture, requiring This PC stereo, rather than an
injected microphone or another renderer audio implementation. Offline Windows speech goes
to the default device and only real loopback STT enters the meeting. The explicit rehearsal
gate remains the sole entry. Shares reuse fixtures but leave real screenshot acquisition
under owner control. Silence means a received owner final followed by no owner activity for
the configured interval, not a wall timer after the interviewer speaks. Skip/end are explicit
rehearsal global controls with fail-fast registration. Live content is reported, never graded
against a scripted rubric. First-visible retains the existing broadcast timing proxy.

## 2026-11-02 — Stacked questions get one combined suggestion

Diagnosis follow-up (owner ruling): keep the existing ledger clearing and fail-closed policy.
Five absent paid answers lack enough retained evidence to identify their suppression paths.
Add correlated outcomes before considering policy changes; canned success is not paid acceptance.
Initial answers must never invent the user's history. Revised November 3: live factual
verification uses a short clarification or "let me check" for missing specifics, never an
affirmation followed by blanks. Labelled fill-in templates are for explicit preparation or
More detail only. Notes hold verified biography even when a deck suppresses talking points.
Detail remains expanded and grounded to its original source.

Owner decision, from the rapid-qa rehearsal: with 8 back-to-back questions the ambient lane
answered only the last few, silently dropping the rest. Now a question overtaken before any
suggestion covered it is carried forward, and the single request for the newest question lists
all uncovered ones (`meetings/assist/question-ledger.ts`): **at most 3 questions** (the newest
plus two carried), only those asked **within 30 s**. A started request marks its questions
covered, so they are never re-asked; the user answering (>= 3 words), Answer now, and any
invalidation clear the ledger. The prompt asks Claude to address each question briefly, in
order, in one scannable suggestion. Explicit Answer now is untouched. Rejected: latest-only
(drops asks, the bug); one card per question (floods a whisper-quiet overlay, multiplies
cost and cooldown hits).

## 2026-11-02 — Product framing: meetings, Q&A and interviews

Owner decision, superseding the 2026-08-27 "not an interview tool" framing. Sanas is a live
copilot for the user's multi-job/client meetings _and_ for question-driven conversations —
Q&A sessions and interviews. The per-job context packs stay the grounding source; an interview
or Q&A is just another meeting with its own context. Consequences: the CLAUDE.md ground rule
and README framing are rewritten; the rehearsal harness ships mock-interview and rapid Q&A
scenarios as its main question → suggested-answer stress test. Rejected: keeping interviews
as test fixtures only — the owner wants interview use supported as a product purpose.

## 2026-11-01 — Main window without a native title bar; Settings paged, not scrolled

Owner feedback on the v0.1.6 face-lift: the default Windows title bar still sat above the new
header, and Settings "just scrolls to sections".

- **The app header is the title bar** (Command Deck's pattern, dk-2ed6dd39 there). The main
  window uses `titleBarStyle: 'hidden'` + `titleBarOverlay`: Windows still draws the real
  min/max/close buttons (so Snap Layouts on maximize keep working) at the right end of the
  header, in the header's own colour (`--panel`) and at its height (51 px, so the header's 1 px
  bottom border runs under them). `.app-header` is `-webkit-app-region: drag` (double-click
  maximizes, drag-to-edge snaps) and every control in it is `no-drag`; its right padding is
  computed from `env(titlebar-area-x/width)` rather than a measured constant, so it follows the
  real caption-button width at any DPI and gives no reserve in the browser preview.
  Colours/height have one source, `tokens.css`; `main/windows/window-chrome.ts` mirrors them for
  the BrowserWindow and a test fails when they drift. Rejected: `frame: false` with drawn
  buttons (loses Snap Layouts and native hover/accessibility); a separate 32 px strip above the
  header (exactly the extra band the owner objected to). The overlay window is unchanged.
- **Settings shows one section per page.** This supersedes "anchored groups on one page"
  below. The original worry — sub-pages hide unsaved edits in other sections — is answered by
  keeping the one page-wide draft (`useSettingsDraft`) above the pager, so edits survive page
  switches, and by keeping the Save/Discard bar under the pane on every page. The index selects
  a page (Up/Down move between them); each page scrolls on its own. The incoming page slides and
  fades in for 200 ms in the direction of travel (down the index = rises; back = drops; sideways
  in the narrow strip), only the entrance animates, and reduced motion gets a 120 ms cross-fade.
  The scroll-spy (`useSectionSpy`, `activeSectionId`) is gone: one navigation model. Trade-off:
  Ctrl+F no longer finds a setting on another page.

## 2026-11-01 — Shared controls layer, scoped library CSS, and who owns what Save sends

Follow-up to the main-window face-lift, from its structure review.

- **Layering.** `tokens.css` and `controls.css` are imported by both windows; the library-only
  rules in `controls.css` are class-scoped (`.field-row-*`, `.switch`, `.badge`) or `.app`-prefixed
  so they never restyle the overlay (GOTCHAS). The library's small shared components live in
  `app/controls/` (one component each, styled only from `controls.css`); the overlay keeps its own
  `overlay-app/controls/`. Rejected: one shared component package for both windows (the overlay's
  controls are deliberately different and tiny).
- **Save-patch ownership.** Settings is one page-wide draft, but some keys are written elsewhere
  (overlay bounds/split, meeting source) or travel as typed secrets. `settings-draft.ts` declares
  `PAGE_OWNED` and `NOT_PAGE_OWNED`; the types force them to cover `keyof Settings`, so a new setting
  must be classified before it builds, and Save sends only page-owned keys (a stale copy of a
  key another surface wrote can never overwrite it). Keys that change under the page while it is
  open (`overlayOpacity`) are named in `useSettingsDraft` and update draft and baseline together.
- **One set of limits.** The Save gate's checks (model required, cooldown range) read
  `src/shared/settings-limits.ts`, the same constants main's schema uses, so the page cannot
  accept what main would silently drop.

## 2026-11-01 — Library window: a top app bar and a two-pane Settings with one gated Save

The main window looked unfinished next to the redesigned overlay: a sidebar holding the nav,
a loose status line and the overlay hotkey at the bottom-left, and a Settings page that was
one long column of cards with raw checkboxes, unlabelled hotkey rows, a bare "idle" update
status and a Save button that never said whether anything was unsaved.

Benchmarked against VS Code, Linear and Raycast settings: all three keep a section index
always visible beside a scrolling list of rows (label and help left, control right), use
switches for booleans, and make unsaved/saved state obvious. Felt target: any setting one
click from the index, nothing browser-default, and the save state readable at a glance
without scrolling.

- **Top app bar replaces the sidebar** (`app/shell/AppHeader.tsx`): mark + name, page tabs,
  a meeting status pill that opens Live, and the Overlay toggle with its hotkey. It mirrors the
  overlay header and gives every page the full window width. Narrow windows drop tab labels to
  icons first. Rejected: keeping the sidebar and adding a header (two chrome surfaces, and a
  Settings index would be a third column).
- **Settings is anchored groups on one page, not sub-pages.** _(Superseded the same day: paged
  Settings, above.)_ Save is page-wide (one draft
  across all sections), so splitting sections into separate views would hide unsaved edits in
  other sections. A sticky index with scroll-spy gives sub-page navigation without that;
  Ctrl+F still finds any setting.
- **Save is gated, not best-effort.** The bar appears only when there is something to say:
  unsaved changes (with Discard), fields Save would refuse, saving, saved, or a failure. Values
  the main schema would silently drop (empty custom model, cooldown outside 0–60) block Save
  with the field marked, instead of saving the rest and reverting that field.
- **Controls are shared, small and library-scoped** (`app/controls/`: Switch, FieldRow,
  Badge), styled in `controls.css` next to `.btn`. The overlay keeps its own `ov-*`
  vocabulary for now; unifying its switch with `Switch` is follow-up work.
- **Settings layout gets its own layer** (`styles/settings.css`). This refines the 2026-09-09
  "no per-page stylesheets" rule: control vocabulary still lives in one shared place; a page
  whose layout alone is ~300 lines gets a layer rather than pushing `pages.css` past the size
  cap.

## 2026-11-01 — Answer-first overlay: a rail of workspaces, a kept divider, no auto-switching

The overlay had grown into a stack (status, toggle, tabs, transcript, splitter, answer bar,
composer, capture/audience/detail buttons) where the answer sat below everything and controls
rendered with browser defaults. It is now **answer-first**: the selected suggestion is always
visible, and one secondary workspace — **Answer · Ask · Screen · Slide · Transcript · Context** —
is chosen from a compact vertical rail (Ctrl+1–6 while the overlay is focused; Ctrl+, opens
preferences; Esc returns to Answer and releases focus). Opacity and Answer every question moved
into a preferences popover; the system-audio warning, meeting error and capture progress stay
in a persistent status region outside the workspaces.

Owner decisions (plan section 8): keep a **draggable divider** between the answer preview and
the workspace below, its ratio persisted in the existing `overlayWhisperRatio` setting (the
answer's share; Answer mode gives it the whole column). The planner's proposal to remove the
splitter was rejected. **Every meeting opens on Answer**, decks included; no slide, context,
transcript or answer event ever switches the workspace — the navigation reducer has no such
inputs. Requested answers select their card without changing workspace or focus.

Local shortcuts only: no new global registrations (collision risk), the six existing globals
are unchanged. Workspaces stay mounted and inactive ones are `inert`, so drafts, the screen
attachment, history selection and scroll survive switching. Rejected: full-screen task tabs
(the answer disappears while asking), remounting views per tab (lost drafts), and a
deck-opens-on-Slide default (surprising focus change mid-call).

## 2026-10-31 — Screen capture is an explicit, unsaved still sent once

During a client or team meeting the owner can press **Capture screen** (overlay button or
Ctrl+Shift+S) or **Attach screen** in the Ctrl+Shift+K composer. Each is one explicit still, never
continuous capture. The display is the one under the overlay (its bounds, even when hidden), or the
one under the cursor when there is no overlay window yet; identity is the display ID matched to the
capture source's `display_id`, never source order or names. A display that vanished is a retry
message, not a silent capture of another monitor. The image is bounded to a 1,568 px long edge and
1.15 MP, PNG first, JPEG 85/75 and a bounded downscale under 2 MiB, never upscaled, within a 5 s
acquisition deadline. The overlay keeps unconditional content protection.

**Owner scope cut:** images are **not persisted**. The bytes live in main memory for one provider
call (or as the one composer draft per meeting) and are discarded after; only the answer text is
saved. The provider gets one call per explicit action, with automatic retries off. More detail on a
screen answer works from the saved answer text only. Because the `suggestions` CHECK constraint has
no `capture` kind, a screen answer is stored as `typed` with a `[Screen capture]` request-text marker
that the repositories map back; there is no schema change. Admission is the existing requested-lane
check plus one "capture preparing" flag. Rejected for now: saved thumbnails and capture files,
schema v8, lane reservation across the asynchronous capture, image replay for More detail, window
or region pickers, OCR and multiple attachments (`docs/plans/screen-capture.md` §1–7 keep the full
design if they are wanted later).

## 2026-10-31 — Main-process output is kept in a local, redacted log file

The installed app has no console, so a failure left no trace. Normal startup now writes main-process
console output, uncaught exceptions and unhandled rejections to `sanas-main.log` under Electron's
logs directory (`%APPDATA%\sanas\logs`). The file rotates once at 5 MB, so at most two capped files
exist. It stays local like all other Sanas data and is never uploaded. Values with secret-like names,
provider-token-shaped strings and settings payloads are redacted before they are written: API keys
must never reach disk outside the settings store. `--smoke` runs never install the logger. Rejected:
a logging library, which is more dependency than a single-process, single-user app needs.

## 2026-10-30 — Overlay hidden from screen capture

The overlay is always excluded from screen capture because it carries the owner's private presenter
notes and suggestions for their own client work while they share a screen. This applies only to the
overlay window; the main window remains capturable. The trade-off is that the overlay is also blank
in the owner's own screenshots and recordings. There is no toggle, by owner choice. This privacy
boundary was originally noted as not shifting the product toward interview use; see the
2026-11-02 reframing, which now includes interviews.

## 2026-10-29 — A meeting summary is a knowledge extract, not a recap

Post-meeting output is meant to be useful weeks later, so the summary now preserves durable
knowledge in optional Markdown sections: overview, decisions, learned facts and process knowledge,
exact technical specifics, open or unverified questions, and people/roles. Action items remain in
their existing database column and outer model delimiter so existing meeting, export, and email
flows keep their contract. Rejected: a fixed 4–8 sentence recap, because meeting value does not
scale to a fixed paragraph count and long technical meetings lose the constraints and exact tokens
the owner needs later.

The transcript window grows from about 30k to 120k characters and the output ceiling scales from
1,500 to at most 8,000 tokens. This is a bounded ceiling, not a requested length: short meetings can
stay concise while long meetings have room. The meeting view and HTML email render only the small
Markdown subset the prompt requests (bold section labels, lists, emphasis, and inline code), keeping
model output as text rather than accepting arbitrary HTML.

## 2026-10-29 — Answer completed turns, not segments; coach the user's next point on request

Answering each final segment fired mid-sentence and on fragments. Sanas now assembles
**completed turns** (`services/turns/`) and answers those. A turn closes on an acoustic
boundary (Deepgram endpointing / UtteranceEnd) followed by a 350 ms continuation grace, with a
1,800 ms no-speech fallback. Rejected for now: semantic endpointing — an extra model in the
latency path before there is evidence the acoustic grace is not enough.

A loose local prefilter hands candidates to a Haiku **classifier** (question | request |
objection | none). It **fails closed**: on timeout, error or malformed output nothing fires.
Rejected: failing open (an outage or slow call would turn every turn into an answer — cost and
overlay churn at the worst moment). "Answer now" bypasses both, so the user always has a path.

**Next point** coaching, which suggests what the user could say while they are still talking,
is **opt-in** (`coachWhileTalking`, default off): it is unprompted help aimed at the person
speaking, which some will find distracting, and it costs real calls (~$0.11/hour). It shares
the **ambient lane** rather than adding a third, so one automatic thing streams at a time.
Delivery is **buffered**: nothing is published unless the whole result is complete and still
fresh, so a stale or cancelled next point never flashes in. Tradeoff: no token streaming for
next points. Coverage is bounded to recent context (a 2,500-char background transcript, the question being
answered and the current explanation; it was 6,000 chars of transcript before 2026-11-04) so the call stays fast and cheap.

A mic-only reading of a This-PC meeting labels every voice as the user (GOTCHAS.md), so a
**capture-health warning** appears when the loopback channel is digitally silent while the mic
is hearing speech. It is **advisory**. Rejected: auto-relabelling heard voices as others, or
silently switching to mono — either guesses at identity from a signal that ordinary remote
silence can also produce, and would rewrite what the user sees. Coaching continues because
ordinary remote silence can raise the advisory warning during a presentation or rehearsal.

## 2026-10-29 — Whisper modes share one compact, safe display contract

Ambient help now has three useful behaviors: **Smart** (the default) gives the actual answer
for concrete asks such as code, commands, numbers, definitions and formulas, but remains a
short line to say for everything else; **Full** answers every trigger; **Points** keeps ambient
coaching terse. “Answer now” is always Full. Smart preserves the old lightweight ambient
feel while fixing the real-world failure where a direct code request received only coaching.
Full/on-demand requests use the answer model and a larger token budget; Smart/Points ambient
requests keep the nudge model and tight budgets.

Every suggestion is shaped for the 380×460 overlay: one bold headline of roughly 20 words,
optionally one minimal runnable fenced code block capped at 25 lines, then at most two short
lines. A purpose-built renderer recognizes only that subset and inline code; model text is
always rendered as React text, never HTML. Rejected: general Markdown (extra bundle and a
wider parsing/XSS surface) and unrestricted chat prose (not glanceable during a meeting).

## 2026-10-29 — Separate configurable models for nudges and full answers

Ambient nudges optimize for latency and repeat throughout a meeting; requested answers,
summaries and Ask-your-history optimize for depth. They therefore have separate Settings:
nudges default to `claude-sonnet-5-5`, while full answers default to
`claude-opus-5-5`. The three current Opus/Sonnet/Haiku 5.5 IDs are convenient choices,
and a custom ID keeps a new model usable without an app release. The provider receives the
model per request and remains the only Anthropic SDK boundary. It sends effort only for
known Opus/Sonnet 5.x IDs because that parameter is not supported by every model.

The ambient question heuristic remains local and unchanged, but its former fixed 20-second
cost guard is now adjustable from 0–60 seconds and defaults to 5. The trigger reads the
current value for every candidate so a saved change applies without restarting a meeting.
(Superseded in part by “Answer completed turns, not segments”: the heuristic is now a loose
prefilter ahead of a classifier, and the cooldown gates automatic answers to completed turns.)

## 2026-09-09 — A meeting's clock is the audio it captured

Pause forced the question of what a meeting's timeline actually measures. Three candidates:
wall time (wrong — a 20-minute pause would push every later timestamp out of step with the
recording), the provider's last transcript time (wrong in a subtler way — it only advances
on a final result, so pausing mid-silence rewinds the clock and the resumed session
overwrites stored segments), and the audio actually captured. The last is the only one that
matches the recording: the WAV holds exactly that audio, so the clock, the recording and
every timestamp main stamps itself agree, and pausing simply stops the count. The
orchestrator owns it (`audioMsReceived`, counted in `sendAudioChunk`) rather than the STT
provider, which cannot see audio the socket dropped; the seam only takes a `startOffsetMs`
telling a new connection where its clock begins, and `sendAudioChunk` accepts nothing until
the session and the recording are both ready, so the count never starts ahead of either.

The agreement is exact for pause and resume, and for everything main timestamps. It is NOT
exact across the provider's own internal reconnect: that resumes from the last final word,
so speech after a network wobble is stamped earlier than its position in the WAV by the
length of the dropped audio. Buffering and replaying that audio is backlogged; until then,
re-diarization is what restores true times, and only when recording is on.

## 2026-09-09 — Pause keeps one meeting; a lost connection pauses rather than errors

Reported from a real call: the internet dropped mid-meeting, and the only way forward was
Stop then Start, which left two meeting rows for one conversation (plus a stray 14-second
one). Pause holds the meeting open — the row, the rolling transcript window, the pinned
speakers and the system prompt all stay — while the STT connection closes and audio stops
flowing. Resume opens a new connection whose clock continues where the last one stopped (the
orchestrator's own `audioMsReceived` into the next session's `startOffsetMs`), so the
transcript reads as one continuous recording with the paused stretch simply absent. That is
deliberate: timestamps are **audio time, not wall-clock time**, which keeps them aligned
with the WAV (paused audio is never written) and therefore with batch re-diarization.

The same mechanism handles the failure that prompted it: when the provider exhausts its
reconnect backoff it now pauses the meeting instead of setting an error state, so the user
resumes when the network returns rather than losing the record. A start that fails outright
now ends its meeting row instead of leaving one open forever.
Rejected: keeping the socket open through the outage (there is nothing to keep open once
the network is gone, and Deepgram closes idle sockets in ~10s anyway); silence-padding the
paused stretch so timestamps track wall clock (it would inflate the recording, cost STT
minutes, and desync nothing useful); merging two meetings after the fact (worth having, but
it fixes the symptom rather than the cause — see docs/BACKLOG.md).

## 2026-09-09 — Ask-your-history on FTS5 + grounded prompting, not embeddings

"What did we decide about X?" needs retrieval over every transcript. Chosen: SQLite FTS5
(compiled into better-sqlite3) as an external-content index over `segments.text` with
porter stemming, kept current by triggers; bm25 ranks; the top hits go to Claude with their
neighbouring lines and a system prompt that forbids answering beyond the excerpts and demands
[title, date] citations. The same index makes Search ranked and stemmed. Rejected: a vector
index (an embeddings vendor or a local model, plus a store, for a few hundred meetings that
keyword + stemming already covers); sending whole transcripts (cost, and the 30k-char window
already exists for a reason); LIKE search (unranked, no stemming). Revisit embeddings only if
questions start missing paraphrases that share no words with the transcript.

## 2026-09-09 — Visual identity: dark by design, teal for the room, sand for your voice

Sanas lives beside a call, so the library window commits to a single dark theme rather
than a light/dark pair (an Electron desktop tool; the overlay is translucent dark by
nature). One token set in `app/styles/base.css` replaces the hard-coded greys that had
accreted per page; one control vocabulary (`.btn` variants, `.field`, `.card`, `.chip`,
`.segmented`) replaces per-context button styles. The signature detail is the transcript
gutter — time · speaker · text — with the **misty-loch teal** kept for the app and other
voices and a **warm sand** reserved for the user's own lines, so who is speaking reads at a
glance everywhere a transcript appears (Live, meeting view, overlay). Type stays on the
Windows system stack (Segoe UI Variable, Cascadia for timestamps and hotkeys): the
renderer CSP blocks remote fonts and bundling one buys little on a Windows-only app.
Rejected: a light theme (no use case yet — P2 if a daytime user appears); an icon library
(six 16px glyphs are inline SVG in `lib/icons.tsx`); per-page stylesheets (the shared
vocabulary is the point).

## 2026-09-09 — Browser preview of the renderer with a typed mock of the bridge

Design work needs eyes on the UI, and the Electron app cannot render in a browser pane.
`npm run dev:web` runs plain Vite on the renderer (`vite.renderer.config.ts`) and
`src/renderer/src/dev/mock-api.ts` stands in for `window.sanas` with sample jobs,
meetings and a scripted live meeting (`overlay.html?demo=live` starts it). The mock is
typed as `Window['sanas']`, so it fails typecheck the moment the real API drifts; main.tsx
installs it only when the build-time `__SANAS_WEB_PREVIEW__` is true (defined by
`vite.renderer.config.ts`; the Electron build defines it false), so neither production nor
Electron dev carries it — a broken preload in Electron still fails loudly. Rejected: `electron-vite dev --rendererOnly` (it skips the main build
but still launches Electron); Storybook (a second build system for six pages).

## 2026-09-09 — Retention: two limits, recordings default to 90 days, meetings kept

Recordings are ~115 MB per mono hour and only exist to feed the batch re-diarization
pass at stop; the transcript + summary are the product and are tiny. So retention has
two independent age limits rather than one: **audio after N days (default 90)** and
**whole meetings after N days (default never)**. Enforced by a timer in the main process
(30 s after launch, then every 6 h) plus a "Clean up now" in Settings that previews what
is due first. Rejected: a single limit (throws away the record to save disk); size-based
quotas (unpredictable which meeting goes); purging on stop only (an app that is never
stopped never cleans up).

## 2026-09-09 — Meeting source is a per-meeting choice, not a global capture setting

Field report: a call held on another laptop, with the default "capture system audio" on,
labelled every participant as **Me**. Loopback is always available on Windows, so capture
went stereo and the stereo rule (mic channel = user) stamped the whole room as the user —
with no diarization index left to pin. The fact that decides identity ("does the other
side arrive through this PC's output, or through the mic?") is a property of the meeting,
so it is now asked on the Live page per meeting — **This PC** (stereo, channel = identity)
or **Elsewhere** (mono, diarized, "that's me" pinning) — and remembered as the default
for the next one. Default is Elsewhere: the failure mode of a wrong Elsewhere is jittery
labels, the failure mode of a wrong This PC is a silently useless transcript.
Alongside: batch re-diarization re-numbers voices, which used to discard pins and names;
they are now carried over by time overlap (`speaker-carryover.ts`), so mono meetings keep
their "Me" after the record heals.
Rejected: auto-detecting from "loopback channel is silent" (only knowable after the fact,
and a muted call looks the same); keeping the global toggle as a default (the user would
still have to remember it before each meeting).

## 2026-09-08 — Summary email via SMTP (nodemailer), summary-only body, recipient per job

The user wants a meeting summary delivered to a predefined address without touching a
mail client. The **recipient lives on the job** (`jobs.summary_email`), not in Settings —
each client/job has its own stakeholder, and a job with no address simply never emails.
Only the sending account (SMTP) is global. Chosen: direct SMTP from the main process (nodemailer) with host/login/
app-password in Settings — fully hands-off, works with any provider, and can auto-send on
stop. The email carries **summary + action items only**; the transcript stays local
(Export exists for that). This is the first outbound path besides the two API vendors —
recorded as an exception to "nothing else leaves the machine": only the summary leaves,
only to the address the user typed. SMTP password shares the API keys' storage model.
Rejected: `mailto:` draft (not hands-off; body length limits); Gmail API/OAuth (needs a
GCP client + browser flow for one recipient); Resend/SendGrid (a third vendor account).

## 2026-08-28 — Post-meeting batch re-diarization + speaker rename/merge

Streaming diarization drifts badly on real meetings (a speaker labeled S2 shifts to S7
mid-standup) — it labels voices incrementally with no lookahead, on conference-processed
audio. Two-part fix: (1) on meeting end, re-transcribe the recorded WAV through
Deepgram's batch API (whole-file lookahead → stable labels) and replace the live
segments; (2) per-meeting speaker rename ("Sarah") and merge (fold S7 into S2) in the
meeting view. Live view stays jittery by nature; the record heals. Requires
`recordAudio` (now default ON). AI assist was never affected — me/them comes from the
channel split in This-PC (stereo) mode; mono meetings rely on pinning (see 2026-09-09).

## 2026-08-28 — System-audio loopback capture (supersedes "microphone only")

Real-world finding: for meetings on the SAME PC, driver-level echo cancellation
subtracts speaker output from the mic signal — exactly erasing the other participants
while keeping the user. Speakers-at-full-volume doesn't help.
Fix: Electron `setDisplayMediaRequestHandler` with `audio: 'loopback'` (Windows) taps
the signal headed to the output device digitally — no AEC in the path, works with
headphones. Runs alongside the mic as a second channel; Deepgram `multichannel=true`
transcribes each independently, so **channel 0 = user, channel 1 = others by
construction** — me/them no longer depends on diarization. Mic-only mono remains the
fallback (loopback unavailable, or meeting on another device — since 2026-09-09 an
explicit per-meeting choice rather than a global setting).
Rejected: mixing loopback+mic into one mono stream (loses the free identity split).

## 2026-08-27 — Name: Sanas

Scottish Gaelic for "whisper / hint" **and** "glossary" — matches the two core mechanics
(whispered suggestions + per-job term glossary). Rejected: cueline, meeting-copilot, cagar, guth.

## 2026-08-27 — Product framing: meeting copilot, not interview tool _(superseded 2026-11-02)_

User explicitly does **not** want an interview cheater. Sanas is a live copilot for the
multiple real jobs/clients the user works — per-job project scope, company info, jargon,
talking points, persona. This framing drives the context-pack design.

## 2026-08-27 — Platform: Electron desktop (Windows), not PWA

Started as a PWA idea. Two findings flipped it:

1. Meetings often run on a _different_ laptop → room audio via mic is the capture path →
   no need for tab/system-audio capture, the PWA's one advantage zone.
2. User is single-device (personal laptop only) → no cross-device sync need → local
   SQLite + filesystem beat IndexedDB; Electron also gives always-on-top overlay +
   global hotkeys, which a PWA cannot do.
   Rejected: pure PWA (no overlay/hotkeys, fragile storage); hybrid local-first+sync
   (sync solves a problem the user doesn't have).

## 2026-08-27 — Audio capture: microphone only

Room audio through the laptop mic carries both sides of the conversation acoustically.
Rejected: system-audio loopback and `getDisplayMedia` tab capture — unnecessary
complexity for this usage pattern. Tradeoff accepted: mixed/noisy single-channel audio;
mitigated by choosing an STT strong on noisy audio with diarization.

## 2026-08-27 — STT: Deepgram streaming (swappable)

Chosen for: real-time streaming latency (~~300 ms), built-in diarization (who said what
from one mic), strong noise handling, keyterm boosting (glossary double-duty), low cost
(~~$0.005–0.01/min). Rejected: local Whisper (latency, weak diarization, heavy for a
laptop that's also running a meeting); OpenAI Realtime (less mature diarization).
STT sits behind an interface so the provider can be swapped later.

## 2026-08-27 — Assistant: Claude API, streaming (swappable)

User is in the Claude ecosystem; strong contextual coaching; streaming keeps perceived
latency low. Behind a provider interface like STT.

## 2026-08-27 — Assist UX: hybrid ambient + on-demand

Ambient short nudges on detected key moments (questions from others, silence after a
question), debounced; plus a global hotkey for a full "what do I say" answer.
Rejected: always-on streaming (distracting, costly); on-demand-only (user must remember
to trigger, loses the copilot feel).

## 2026-08-27 — Storage: local SQLite + local audio files

`better-sqlite3` in main process; audio under app data. Single-device by choice.
Rejected: cloud backend (D1/R2) — no multi-device need; can be revisited if that changes.

## 2026-10-30 ? Presentation teleprompter and independent assistance lanes

A nonempty job deck enables a manual teleprompter for new meetings, beside the owner's presentation app. Snapshot each deck at meeting creation: editing a job must never rewrite an active or historical presentation. Record navigation against captured audio time, including silence and paused revisits.

Owner ruling: answers remain whole-job/whole-deck and survive navigation. Only the Next point coach is slide-scoped and cancellable on a move. Give coaching a separate stable system context without the full deck to prevent cached later-slide leakage. Its evidence is confirmed-user speech from this visit, bounded to whole lines; incomplete evidence cannot prove omission. Scripts are prepared wording, never evidence of delivery.

Reject presentation merges until multi-deck remapping exists. Manual navigation never controls external slides; speech-driven advancement and external-app reconciliation are deferred.

## 2026-10-30 — Live meeting controls and immutable answer grounding

Use versioned meeting decks and explicit Apply so corrections can follow a live presentation without altering the job default or rewriting historical titles. Meeting text lives in the variable user prompt, preserving the stable job cache; deck edits replace only the independently cached deck block. Capture both job prompt variants at meeting start so adding/clearing slides does not reread edited job data.

More detail replays the source's immutable job/deck prompt, original request window and completed answer. The original answer is fallible context, not evidence. Store rendered grounding once per deck/prompt combination, accepting modest duplication with structured slides to make replay deterministic. Keep manual variants on the requested lane and existing answer purpose rather than rebuilding lane/purpose semantics.

Passive overlay reveal uses showInactive. Only explicit Ask activation takes focus, clears ghost mode and delivers a pending composer intent after renderer readiness. Escape blurs the overlay; restoring a particular external application is not promised.

The per-meeting Answer every question switch is initialized from a new setting, default OFF. When enabled, classifier verdicts addressed to another participant may produce reference answers for the owner. This supports group presentations where useful questions are directed to somebody else. It changes only addressee admission: prefilter, classifier, freshness, cooldown and spacing remain intact. Turning it off restores existing behavior and suppresses queued other-addressee generation. A meeting override does not change the saved default.

Contextual merges are deferred: silently dropping or combining incompatible revisions is worse than refusing the merge. Post-meeting follow-up generation and revision browsing remain phase 2.

## 2026-10-31 ? Manual unsigned releases and explicit update installation

A manual main-only workflow allocates the next numeric version from all published canonical
release tags (including releases marked prerelease), starting at 0.1.1. Only the disposable build
checkout is stamped; the tag targets the tested source commit. Verification and Windows packaging
precede a draft, three asset uploads, and stable publication. Failed uploads clean up only this
attempt?s still-unpublished draft; failed cleanup leaves it for owner inspection. Published versions are never reused; failed unpublished allocations may be.
Remote byte readback and ambiguous-publish reconciliation are deliberately out of scope: inspect
GitHub before retrying an uncertain publish response, and remove only an unpublished failed draft.

Use electron-updater with the public dirtyredz/Sanas GitHub provider, without client credentials.
Packaged launches and six-hour checks download stable updates automatically. Ordinary quit never
installs; Restart to update is the sole install action, synchronously checking a downloaded update,
no live/paused meeting, and zero aggregate background meeting writes. Per the owner scope cut,
there is no lifecycle queue guard or admission latch: a queued start or new background operation
can race the deferred restart. This is a conscious limitation, not atomic shutdown admission.

Releases are unsigned; SmartScreen warnings are expected. Hash verification detects altered bytes
but does not establish Authenticode publisher identity. Signature checking is explicitly disabled
in builder configuration; generated updater metadata omits publisherName. Future signing must happen before final blockmap/metadata
generation and validation; secrets do not belong in ordinary CI or the renderer.

Existing data stays in APPDATA/sanas. Before an existing older schema is upgraded, SQLite creates
a consistent unique backup; failure aborts startup. Future schemas are rejected. Migrations remain
transactional per version, so earlier completed migrations survive a later failure. Recovery is
manual from the pre-upgrade backup, never an automatic overwrite of owner data.

## 2026-11-02 ? Explicit rehearsal dispatch and main audio ingress

Choose an isolated main-process rehearsal runner behind `--rehearsal`, alongside `--smoke`,
with guarded composition setters for SttProvider, AssistantProvider and DesktopDeps. Normal
launch never imports scripted providers. Use the real orchestrator and repository APIs;
do not reproduce assistance policy or introduce rehearsal SQL.

Replay 16 kHz linear16 WAV through `sendAudioChunk`, the same ingress used by audio IPC.
This exercises accepted-audio timing, channel identity, health, recording and both Deepgram
passes without unreliable fake getUserMedia devices. It intentionally does not test microphone
drivers, browser permissions, echo cancellation or the AudioWorklet resampler. Offline Windows
speech builds stereo fixtures; clips that overrun their timing fail rather than truncate.

Scripted STT reset/reconnect is deterministic seam simulation. Audio faults close the actual
WebSocket with an abnormal code so production reconnect owns backoff. Real desktop checks
use a fixture window baseline and compare both fixture-content and protected-overlay-region pixels.
Canned image replies establish byte delivery, not vision competence; Claude is owner-selectable.
Profiles/reports remain under the worktree for inspection; provider output is suppressed and
keys are cleared on normal teardown. A hard kill can leave private credentials in that profile.

## 2026-11-03 ? Presentation is a per-meeting opt-in

Owner decision supersedes October 30 automatic activation: Use presentation deck defaults off at every Start, even for a remembered job with slides. Apply can deliberately add slides later. Selected presentation position is relevant only to deck discussion; off-topic coaching declines. Live and paused meetings cannot be filed under another job. Historical filing preserves saved answer grounding. Source-job provenance migration is deferred in dk-b7dedbdd.

## 2026-11-03 - Proportional initial answer depth

Ambient and hotkey initial answers share the screening/experience/rate/availability 15-40-word rule. Code is for requested implementation or essential exact artifacts. This refines the November 2 80-word ceiling; it is not a length target. More detail is unchanged.

## 2026-11-03 ? Immutable per-meeting candidate facts

_Ownership superseded 2026-11-04: the resume is saved on the job and snapshotted at Start;
Unsorted calls get none. The snapshot, privacy, framing and hint rules below still hold._

Resumes belong to individual applications/calls, including Unsorted meetings. Store text and a display name with the meeting, never a binary or source path. Validate a 40,000-character limit in main and reject empty text. Freeze the attachment at creation, with an append-only v9 migration and the existing backup-before-upgrade flow; reject merges containing resumes until a provenance-preserving design exists.

Treat the resume as untrusted candidate data in both prompt variants, escaping delimiter characters and explicitly rejecting embedded instructions. This protects delimiter structure, not a guarantee of LLM injection resistance. Persist rendered grounding so More detail uses the same facts.

Privacy: resume text stays local in SQLite and leaves only through existing assistant prompts and derived STT hints to the configured providers. Summary generation can use it as background; resulting summaries follow existing user-configured summary/email behavior. No resume uploads, OCR service or new outbound endpoint is introduced.

Use deterministic name/technology heuristics, not an LLM extraction call. [Deepgram's keyterm documentation](https://developers.deepgram.com/docs/keyterm) specifies a 500-token budget and up to 100 terms. Alternate resume/glossary terms with case-insensitive deduplication; cap at 100 terms, 100 characters each, and 500 UTF-8 bytes including separators as a deliberately conservative tokenizer-independent budget.

With owner download approval on November 3, pin `unpdf` 2.1.0 and `mammoth` 1.13.0 (latest stable at installation). The selected parsers are [unpdf](https://github.com/unjs/unpdf) (bundled serverless PDF.js, no native canvas needed for text) and [Mammoth](https://github.com/mwilliamson/mammoth.js) (raw DOCX text rather than HTML). Avoid custom PDF/ZIP/XML parsing and renderer-side document processing.

The native picker returns only validated text/name over typed IPC. Both runtime dependencies remain externalized by electron-vite; unpdf loads through native dynamic import to preserve its ESM package and bundled PDF.js assets. Release documents via `loadingTask.destroy()`. No OCR, HTML conversion, remote CMaps or native canvas is needed. unpdf declares Node >=24; synthetic extraction passes on this checkout's Node 22.20.0, but packaged Electron compatibility remains an async-pipeline acceptance check.
