## 1. Goal

Build and publish unsigned Windows x64 NSIS releases through a manually dispatched GitHub Actions workflow, then let installed Sanas check for and download updates automatically. Installation requires **Restart to update**, which main must refuse while a meeting, lifecycle operation, or background meeting write is active.

Preserve the existing `%APPDATA%\sanas` data directory, verify the packaged SQLite binding under Electron, and protect existing data before installation and schema upgrades.

## 2. Placement

Paths below are relative to the repository root.

| Files                                                                                             | Responsibility and placement                                                                                                                                  |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/release.yml`                                                                   | Manual release orchestration: version, verify, build, publish.                                                                                                |
| `.github/workflows/ci.yml`                                                                        | Existing fast gate; pin actions and declare minimal permissions. Pushes publish nothing.                                                                      |
| `.github/actions/node-setup/action.yml`                                                           | Shared Node/npm setup and optional Electron/electron-builder download caches.                                                                                 |
| `scripts/release/version.mjs`                                                                     | Published-version discovery, numeric allocation, and stamping the disposable build checkout. Adapt Command Deck without its platform/shared-counter coupling. |
| `scripts/release/assets.mjs`                                                                      | Candidate asset inventory, metadata validation, and local/remote digest comparison. Shared by package validation and publication.                             |
| `scripts/release/publish.mjs`                                                                     | Draft creation, upload, readback, final publication, and retry reconciliation.                                                                                |
| `scripts/release/package-check.mjs`                                                               | Inspect packaged resources, native-binding placement, application version, and updater configuration.                                                         |
| `scripts/release/smoke.ps1`                                                                       | Launch packaged executable, enforce timeout, and validate its diagnostic report and exit code.                                                                |
| `scripts/release/start.ps1`, `scripts/release/install-latest.ps1`                                 | Owner-facing dispatch and installation operations, following the required PowerShell conventions.                                                             |
| `scripts/owner/owner-run.ps1`                                                                     | Shared owner-run logging/error handling, adapted from the existing family-command-center helper.                                                              |
| `package.json`, `package-lock.json`, `electron-builder.yml`                                       | Updater dependency, verification commands, explicit GitHub publishing metadata, deterministic installer names, and unsigned configuration.                    |
| `.prettierignore`                                                                                 | Exclude generated `release/` and `.tmp/` artifacts from formatting checks.                                                                                    |
| `src/main/lifecycle/user-data.ts`                                                                 | Preserve normal application identity/path and select isolated diagnostic paths.                                                                               |
| `src/main/lifecycle/start.ts`                                                                     | Extract normal startup and lifecycle wiring from `main/index.ts`; await database initialization before enabling normal application features.                  |
| `src/main/index.ts`                                                                               | Small entry-point dispatcher selecting normal startup or smoke before loading normal application services.                                                    |
| `src/main/diagnostics/smoke.ts`                                                                   | Headless packaged diagnostic orchestration and machine-readable result.                                                                                       |
| `src/main/diagnostics/migration-checks.ts`                                                        | Disposable native migration acceptance checks, reachable only through diagnostic mode.                                                                        |
| `src/main/db/repos/diagnostics.ts`                                                                | Diagnostic SQL and synthetic migration fixtures. SQL remains in the repository layer.                                                                         |
| `src/main/db/backup.ts`                                                                           | Consistent SQLite backup before upgrades.                                                                                                                     |
| `src/main/db/index.ts`, `src/main/db/migrations.ts`                                               | Safe connection ownership, schema compatibility checks, migration initialization, and close/reset. Preserve existing migration ordering.                      |
| `src/main/services/updates/service.ts`                                                            | Sole runtime `electron-updater` import; checks, downloads, events, timers, and sanitized state.                                                               |
| `src/main/services/updates/restart.ts`                                                            | Authoritative restart eligibility and atomic installation admission.                                                                                          |
| `src/main/services/meetings/status/lifecycle.ts`                                                  | Extract the existing serialized lifecycle queue from `meetings/index.ts`; expose pending-operation state.                                                     |
| `src/main/services/meetings/status/admission.ts`                                                  | Small restart-admission latch shared by meeting lifecycle and background-work admission; no Electron dependency.                                              |
| `src/main/services/meetings/status/post-processing.ts`                                            | Preserve per-meeting counts; add aggregate busy state and restart-admission enforcement.                                                                      |
| `src/main/services/meetings/index.ts`                                                             | Use the extracted lifecycle queue without changing public meeting APIs.                                                                                       |
| `src/shared/updates/types.ts`, `src/shared/ipc.ts`                                                | Typed update snapshots and explicit get/check/restart/change channels.                                                                                        |
| `src/main/ipc/updates.ts`, `src/main/ipc/index.ts`                                                | Thin updater IPC delegation and registration.                                                                                                                 |
| `src/preload/index.ts`                                                                            | Explicit typed updater bridge. Its existing declaration file derives the API automatically.                                                                   |
| `src/renderer/src/app/settings/UpdatesSection.tsx`, `src/renderer/src/app/pages/SettingsPage.tsx` | Self-contained Updates section composed into Settings, independent of settings draft/save.                                                                    |
| `src/renderer/src/dev/mock-updates.ts`, `src/renderer/src/dev/mock-api.ts`                        | Typed browser-preview update behavior; keep it separate from the already substantial mock API.                                                                |

Tests belong beside their modules, as specified below. Update the living documentation listed in section 6.

Although `main/index.ts` is only 63 lines, it already combines several responsibilities. Extract normal startup to keep diagnostic isolation explicit. No changed code file should approach 800 lines.

## 3. Sequence

1. **Establish release identity and package configuration.**

   Preserve `com.dirtyredz.sanas`, product name `Sanas`, x64 NSIS one-click installation, native unpacking, `npmRebuild: true`, and `deleteAppDataOnUninstall: false`.

   Add `electron-updater` as a production dependency. Select and lock a version compatible with the existing electron-builder 26 toolchain; do not combine this work with a major packaging-tool upgrade. Configure the GitHub provider explicitly for `dirtyredz/Sanas`, subject to the visibility check below. Use a deterministic name such as `Sanas-${version}-x64-Setup.exe`.

   Make `npm run dist` explicitly pass `--publish never`. Require an installer, its `.exe.blockmap`, and `latest.yml`. Builder generates the packaged `resources/app-update.yml`; renderer code never supplies a feed URL. These are the documented NSIS updater integration points. [electron-builder v26 auto-update documentation](https://www.electron.build/v26/docs/features/auto-update/)

   Set the unsigned signature-verification policy explicitly through `win.verifyUpdateCodeSignature: false`; do not install an always-successful custom verifier. Confirm behavior against the locked updater version and generated configuration. Unsigned installation can trigger SmartScreen, and update hashes provide integrity without Authenticode publisher identity. [Windows configuration](https://www.electron.build/v26/docs/win/)

2. **Protect database initialization and preserve the existing data path.**

   Dev and packaged builds already pin `%APPDATA%\sanas`; there is no directory migration. Extract that behavior unchanged.

   Existing protections are WAL mode, foreign keys, append-only migrations, and a transaction containing each migration plus its `user_version` advancement. Current schema is **v7**.

   Make `openDb()` asynchronous so it can await SQLite’s consistent backup API before upgrading an existing database. Keep the candidate handle local until initialization succeeds; only then expose it through synchronous `getDb()`. Its sole existing caller moves from `main/index.ts` into normal startup and awaits it.

   Before migrations:

   - Reject a schema newer than this application supports.
   - Back up an existing database requiring migration to a unique file under `userData/backups/`.
   - Abort without migrating if backup fails.
   - Preserve per-version transactional migration behavior.

   Close/reset the candidate on failure. Catch startup failure before IPC, windows, retention, or updater initialization; show a concise native error with the backup location when available. Never silently create a replacement database or restore over the owner’s data. Close the successful connection during final application shutdown.

   Tradeoff: migrations remain transactional per version. If a later migration fails, earlier completed versions remain committed; the pre-upgrade backup supports deliberate recovery.

3. **Add isolated packaged diagnostics.**

   Route `--smoke` before importing normal startup. The diagnostic creates a unique temporary directory and sets `userData` before readiness or database access. It must not acquire the normal instance lock, read normal settings, create windows, initialize providers, register audio/hotkeys/IPC, run retention/recovery, or initialize updates.

   Open the database through production initialization, perform a small repository-owned write/read probe, check schema/integrity, close it, and exit. Emit a report containing packaged status, application version, architecture, Electron version, module ABI, loaded binding path, schema version, and result. Include no user content or secrets.

   `package-check.mjs` must find `better_sqlite3.node` beneath `resources/app.asar.unpacked`, validate its packaged dependency placement, and check updater metadata. The real packaged executable must then load that binding successfully: file presence alone does not establish Electron ABI compatibility.

   `smoke.ps1` runs `release/win-unpacked/Sanas.exe`, waits with a hard timeout, and requires both a successful exit and a valid report. A missing report must fail even when another process exits successfully. Capture output/report paths explicitly because Windows GUI executables cannot be assumed to forward stdout reliably. Terminate only the process it started on timeout.

   Add an explicit diagnostic option for disposable native migration cases. Both diagnostic paths own and clean up only their temporary directories.

4. **Implement the meeting-safe updater.**

   After successful normal packaged startup, check once and then every six hours. Automatically download stable updates. Deduplicate checks, handle network errors without interrupting meetings, and disable downgrades/prereleases. Development and smoke initialize no updater.

   Keep `autoInstallOnAppQuit = false` permanently. Download completion and becoming idle never trigger installation. Ordinary quit installs nothing; **Restart to update** is the sole installation action.

   Extract the existing lifecycle queue, counting pending work immediately upon enqueue and decrementing in `finally`. Preserve ordering and recovery after rejected operations. Its existing callers remain start, pause, resume, stop, context update, manual assistance, answer-policy changes, and slide movement.

   Restart is allowed only when:

   - An update is downloaded.
   - `liveMeetingId()` is null, including paused meetings.
   - No lifecycle operation is queued or running.
   - No meeting has post-processing work.

   Check these conditions and acquire the admission latch synchronously, with no intervening await. Subsequent lifecycle operations and post-processing claims must reject before starting work. Then call the updater’s restart/install operation once. If installation fails while the process remains alive, release admission and expose a recoverable error.

   Existing post-processing producers are meeting stop, `assist/live-session.ts`, and `summary/summarize.ts`; preserve their APIs and balanced count semantics. Existing delete/merge readers remain unchanged. Keep database close in final shutdown, not before the updater’s deferred installation handling.

   Tradeoff: updates download automatically but installation waits for an explicit owner action. This avoids extending the current abrupt ordinary-quit behavior into a graceful-shutdown project.

5. **Expose minimal Settings state.**

   Provide parameterless get/check/restart IPC calls and a change subscription. Main returns current version, update phase, available version, progress, sanitized error, and restart eligibility/block reason. Never expose tokens, raw provider errors, arbitrary download URLs, or filesystem paths.

   The Updates section shows installed version, status, **Check for updates**, and **Restart to update**. Disable restart while blocked and explain briefly. Main always rechecks on click. Subscribe before fetching the initial snapshot, handle ordering so stale snapshots cannot overwrite newer events, and unsubscribe on unmount.

   Keep update state outside persisted Settings. Add a typed preview mock with no external traffic.

6. **Build the manual release workflow.**

   Use `workflow_dispatch` only, workflow-level `permissions: {}`, and concurrency group `release` with `cancel-in-progress: false`. Restrict releases to main and pin every external action to a verified full commit SHA. Check out the dispatch SHA consistently with persisted credentials disabled.

   Job graph:

   - **version:** discover the next version using read-only GitHub access.
   - **verify:** run independently alongside version/build preparation using Ubuntu and `npm ci --ignore-scripts`; execute typecheck, Vitest, lint, and format checks.
   - **build:** needs version; runs on hosted `windows-latest`, installs with lifecycle scripts enabled, stamps the allocated version, builds without publishing, validates the package, and runs packaged smoke/native migration checks.
   - **publish:** needs version, verify, and build; alone receives `contents: write`.

   Allocate numerically from all published, non-draft releases using paginated discovery. Do not use only GitHub’s latest endpoint or lexicographic tag sorting. Fail on incomplete discovery. Use canonical `vMAJOR.MINOR.PATCH` tags, increment patch above the highest published version, and start at `0.1.1` when none exist. Include canonical published prereleases in the high-water calculation so their version numbers cannot collide.

   Stamp `package.json.version` and both corresponding lockfile version fields only in the disposable build checkout. Tag the tested source SHA; commit no release-version bump.

   Cache npm downloads and the Electron/electron-builder download directories using OS, architecture, and dependency/configuration hashes. Set `ELECTRON_CACHE` and `electron_config_cache` consistently. Never cache `node_modules`, packaged outputs, or smoke evidence.

   Transfer the exact candidate by workflow artifact identity. Include provenance linking version, source SHA, run, and asset hashes.

7. **Publish through a verified draft.**

   Before creating a draft, recheck published history and tag collisions. Never overwrite an existing published version or retarget an existing tag to another SHA.

   Create a draft for the candidate version/source SHA. Upload exactly the installer, blockmap, and `latest.yml`. Validate metadata version, installer filename, size, and SHA-512 against the candidate.

   Read every uploaded asset back and compare its bytes/digests with the build candidate. Recheck collision/history state immediately before changing the draft to a stable published release and making it latest. Publication is the final mutating step.

   On pre-publication failure, leave nothing public; clean up only a draft proven to belong to this attempt. Never delete published assets during cleanup. Retry logic must reconcile an ambiguous publish response before allocating or modifying anything.

   Keep a future signing seam between build and final asset validation. The family-command-center example is Android signing, so copy its separation of unsigned CI and local secret-backed signing, not its signing implementation. Future Authenticode signing must precede final blockmap/metadata generation and readback.

8. **Provide owner scripts and the first-install switchover.**

   Every owner-facing script supports `-DryRun`, resolves paths from its own location, records redacted logs under `.tmp/owner-runs/`, checks native exit codes, and ends with one `OK` or `FAILED` line. Dry-run may create its log but must not dispatch, install, or alter user data.

   `start.ps1` wraps dispatch to main, records the intended SHA, identifies the corresponding run, and reports its URL/result without confusing another dispatch with this one. It must not merge or push implicitly.

   `install-latest.ps1` selects the latest stable release and validates downloaded installer bytes against its metadata. Before installation, require dev Sanas and installed Sanas to be fully exited; detect relevant executable paths/command lines rather than killing arbitrary Electron processes.

   Cold-backup the entire `%APPDATA%\sanas` directory—including database/WAL/SHM, settings, and audio—to a unique destination outside the source directory. Verify the backup manifest/hashes before proceeding. Never print settings contents or upload the backup.

   Install and confirm the installed executable/version. First normal launch must show existing jobs, meetings, transcripts, and playable recordings from the same data directory. No import or data relocation is required.

## 4. Tests

- **Release tooling:** colocated `version.test.ts`, `assets.test.ts`, and `publish.test.ts` under `scripts/release/`, using mocked GitHub responses. Cover numeric ordering, pagination, empty history, draft exclusion, canonical-tag filtering, collisions, retry reconciliation, failed upload/readback, altered bytes, metadata mismatch, and publication being unreachable before all checks pass.
- **Database:** `src/main/db/index.test.ts` and `backup.test.ts` with mocked native dependencies. Cover backup-before-migration, backup failure, unsupported future schema, failed initialization cleanup, and publishing the global handle only after success.
- **Native migration acceptance:** diagnostic-mode checks using synthetic fixtures owned by `db/repos/diagnostics.ts`: fresh database, repeat open, representative v6→v7 data preservation, migration rollback/version behavior, future-schema rejection, and backup readability. Run under packaged Electron; Node Vitest cannot validate the Electron-built SQLite binding.
- **Diagnostic isolation:** `src/main/diagnostics/smoke.test.ts` and `src/main/lifecycle/user-data.test.ts`. Verify path isolation, production path preservation, failure exit/report handling, and no normal startup/window/audio/provider/updater initialization.
- **Updater:** `service.test.ts` and `restart.test.ts` beside their modules. Cover startup/periodic checks, deduplication, errors, downloads without installation, disabled contexts, permanent install-on-quit disabling, blocked meeting states, background writes, duplicate restart requests, and installation failure recovery.
- **Admission races:** `status/lifecycle.test.ts`, `status/admission.test.ts`, and extended `status/post-processing.test.ts`. Verify enqueue-time counting, failed-operation recovery, multiple background holds, start-before-restart and restart-before-start ordering, and rejected work after admission closes.
- **Integration:** update `services/meetings/index.test.ts` mocks/assertions for extracted queue behavior. Typecheck validates the preload/preview bridge. Exercise Settings state and disabled actions through the preview and packaged app.

## 5. Verification

The implementer must run these checks; this planner has not built or tested the application.

1. On Valhalla, run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run format:check`.
2. Run local `npm run dist`, followed by `node scripts/release/package-check.mjs` and `pwsh -NoProfile -File scripts/release/smoke.ps1`, including native migration acceptance.
3. Confirm smoke creates no visible window, audio activity, provider requests, normal data changes, or updater requests.
4. Verify packaged Settings states and restart gating for live, paused, starting/stopping, and post-processing conditions. Confirm ordinary quit never installs.
5. Execute owner scripts with `-DryRun`; verify their logs, exit codes, and absence of operational mutations.
6. After merge and push, run `dk check` as required by repository guidance and dispatch **one** real release through `start.ps1`. Confirm every gate, remote asset readback, published tag/SHA, and latest metadata.
7. Run `install-latest.ps1` for the backed-up dev-to-installed switchover and confirm existing data.
8. Validate a real installed-version upgrade using an older locally built installer in a disposable Windows profile against the single new published release. Confirm download, safe restart, version advancement, and retained fixture data. Do not lower the owner’s production database schema to perform this test.

Document a short manual checklist per release: overlay content protection during screen sharing, microphone and system-audio capture, and real Deepgram/Anthropic meeting calls. These remain outside CI.

## 6. Docs

- **`docs/DECISIONS.md`:** manual draft-first release model; published-version allocation; electron-updater over custom replacement; explicit idle restart; unsigned trust model and future signing seam.
- **`docs/FEATURES.md`:** automatic update checks/downloads and Settings controls; correct stale schema inventory.
- **`docs/GOTCHAS.md`:** Electron native ABI, packaged smoke, unsigned SmartScreen/signature behavior, background-work restart guards, shared dev/installed data, migration backup/recovery, and older-build incompatibility.
- **`STRUCTURE.md`:** add lifecycle/diagnostics/updates/shared-updates homes, queue extraction, release tooling, and colocated tests to enforced layout guidance.
- **`README.md`:** install, back up, dispatch, recover, and update using checked-in PowerShell scripts; include the manual release checklist.
- **`docs/ARCHITECTURE.md`:** add updater/main-process boundary and GitHub metadata/binary traffic; correct the storage summary that still calls v5 current despite later v6/v7 sections.

## 7. Open questions / assumptions

- **Repository visibility remains unknown.** Authenticated GitHub inspection failed because network access was unavailable; browser retrieval also failed. `package.json`’s `private: true` does not establish GitHub visibility. Plan assumes public `dirtyredz/Sanas` releases. Verify visibility before configuring publication.
- **If the repository is private:** propose a separate public binary-release repository while retaining private source. This needs owner approval because binaries become public, plus narrowly scoped cross-repository publishing credentials. The alternative requires a GitHub token on the owner’s machine; never embed a PAT in the installer or renderer. The GitHub provider’s private mode requires client authentication. [Private GitHub update documentation](https://www.electron.build/v26/docs/features/auto-update/)
- **“Never reused” means published versions.** This follows the selected Command Deck model: an unpublished failed attempt may reuse its allocation. Burning every allocated number would require a durable reservation ledger and a different allocation rule.
- **“Failed run publishes nothing” applies before publication commits.** A successful final publish request followed by a lost response can leave a complete public release despite a failed workflow result. Reconcile remote state; never erase that release or reuse its version.
- **Installation policy:** automatic download plus explicit safe restart is the planned minimum. Ordinary quit does not install. Automatic installation on quit would require additional graceful-shutdown work.
- **Data compatibility:** dev and installed builds share data. After a schema upgrade, avoid running an older dev checkout; newer-schema rejection must fail safely.
- **Output delivery:** dispatch metadata identifies `docs/plans/release-pipeline.md` on account `dirtyredz60`. This read-only planner returns the specification for the launcher to save there; it makes no repository writes.

## 8. Owner scope cut (2026-10-31) — overrides the sections above where they conflict

Owner chose the **trimmed** plan. Repo visibility checked: `dirtyredz/Sanas` is **PUBLIC** — use the plain GitHub provider, no token.

**Keep:** manual `release.yml` (version → verify ∥ build → publish, SHA-pinned actions, `permissions: {}`, `release` concurrency); version allocation from published tags (paginated, numeric, start 0.1.1, stamp only in the build checkout); npm/Electron download caches; `package-check.mjs` (binding under `app.asar.unpacked`, updater metadata present); `--smoke` diagnostic (isolated temp userData, opens DB via production init, write/read probe, report file, exit code) + `smoke.ps1`; draft release → upload installer + blockmap + `latest.yml` → publish; `electron-updater` service (check on launch + 6h, auto-download, `autoInstallOnAppQuit=false`, install only via **Restart to update**); Settings Updates section + typed IPC/preload + preview mock; async `openDb()` with backup-before-migration, future-schema rejection, abort on backup failure, clean startup-failure error; `start.ps1` + `install-latest.ps1` (full cold backup of `%APPDATA%\sanas` first) + shared owner-run helper; docs updates (section 6).

**Cut:**

- Publish readback/byte comparison, provenance file, ambiguous-publish retry reconciliation, pre-publish collision recheck beyond a single "tag/release already exists → fail" check. `assets.mjs` shrinks to asset inventory + `latest.yml` sanity check (or folds into package-check).
- Native migration acceptance diagnostics (`diagnostics/migration-checks.ts`, `db/repos/diagnostics.ts` fixtures). The smoke's single write/read probe stays (any probe SQL lives in `db/repos/`).
- Lifecycle queue extraction and the admission-latch machinery (`status/lifecycle.ts`, `status/admission.ts`, race tests). Instead `updates/restart.ts` checks synchronously at click time: update downloaded AND `liveMeetingId()` null (incl. paused) AND aggregate post-processing count is 0 (add one small aggregate accessor to post-processing.ts). Name this tradeoff in DECISIONS.
- Verification step 8 (disposable-profile installed-upgrade test). The first real update after the next release serves as that check.

Extracting normal startup out of `main/index.ts` into `lifecycle/start.ts` stays (it is what keeps `--smoke` isolated).
