# Hydra Ensemble — Frontend Architecture Refactor Proposal

**Scope**: `src/renderer/` only (Electron renderer — React 19, Vite, Tailwind v4,
Zustand 5). **Goal**: obvious feature boundaries, killed duplication, a small
shared UI primitives layer, and disciplined state — delivered as sequenced
≤500-line PRs. No big-bang rewrite.

---

## 1. Current State

Totals: **~45,000 LOC** across **140** `.ts`/`.tsx` files. **37** files clear 400 LOC.

| Directory | Files | Role today |
| --- | --- | --- |
| `src/renderer/` (root) | 3 | `App.tsx` (**941 LOC** god-component), `main.tsx`, `QuickTerminalApp.tsx` |
| `components/` | 29 (+4 subfolders) | Catch-all: classic UI, dead code, primitives, feature screens — flat |
| `components/chat/` | 7 | ChatView family + FileDropOverlay + TypingIndicator |
| `components/editor/` | 10 | CodeMirror stack (FileTree, GitChangesPanel **1221 LOC**, Diff*, Search*) |
| `components/Sidebar/` `Toolkit/` `Watchdog/` | 4 / 2 / 2 | PascalCase dirs (inconsistent naming) |
| `orchestra/` | 52 (+3 subfolders) | Parallel feature universe with its own `state/` + `lib/` |
| `orchestra/Inspector/` | 11 | 10 tabs + index |
| `orchestra/modals/` | 6 | AgentWizard (**1337 LOC**), NewTask/Team dialogs, ApiKey/DeleteTeam modals, NewAgentPopover |
| `orchestra/lib/` + `orchestra/state/` | 4 + 3 | budget/teamIO/templates/useSplitter + orchestra/discovery/notifications |
| `state/` | 14 | sessions/sessionsExtra/panels/projects/gh/toolkit/watchdog/transcripts/shells/editor/claudeCommands/keybinds/toasts/spawn |
| `lib/` + `tour/` + `styles/` | 5 + 4 + 1 | agent/keybind/platform/toolkit-icons/transcriptToMarkdown; TourPlayer + 263 LOC hardcoded `tours.ts`; `globals.css` with duplicated `.df-md` |

### Top split candidates (>500 LOC)

| LOC | Path | Verdict |
| --- | --- | --- |
| 1337 | `/home/gengar/Templates/workspace2/Hydra/src/renderer/orchestra/modals/AgentWizard.tsx` | Multi-step wizard → 1 file/step + state machine |
| 1221 | `/home/gengar/Templates/workspace2/Hydra/src/renderer/components/editor/GitChangesPanel.tsx` | Panel + list + diff header + actions — extract hooks + rows |
| 941 | `/home/gengar/Templates/workspace2/Hydra/src/renderer/App.tsx` | God-component — see §2 |
| 915 | `/home/gengar/Templates/workspace2/Hydra/src/renderer/orchestra/IssuesPanel.tsx` | Pull rows/empty state out |
| 851 | `/home/gengar/Templates/workspace2/Hydra/src/renderer/components/SpotlightSearch.tsx` | **Dead — not imported anywhere** |
| 812 | `/home/gengar/Templates/workspace2/Hydra/src/renderer/components/CodeEditor.tsx` | Split tab bar + inline vs overlay |
| 800 | `/home/gengar/Templates/workspace2/Hydra/src/renderer/components/ToolkitGrid.tsx` | Extract item + run popover + icon map |
| 698 | `/home/gengar/Templates/workspace2/Hydra/src/renderer/orchestra/TeamTemplatesDialog.tsx` | Catalog + preview + import form in one |
| 661 | `/home/gengar/Templates/workspace2/Hydra/src/renderer/orchestra/TeamHealthPanel.tsx` | Charts + buckets + KPIs inlined |
| 593 | `/home/gengar/Templates/workspace2/Hydra/src/renderer/components/TerminalsPanel.tsx` | Tabs + xterm + resize fused |
| 539 | `/home/gengar/Templates/workspace2/Hydra/src/renderer/components/Sidebar/index.tsx` | Not a barrel — 539 LOC of component hidden behind `index.tsx` |

---

## 2. Concrete Pain Points (15)

1. **`App.tsx` is a god-component** — 941 LOC, 20+ zustand selectors, hosts the global shortcut dispatcher (`/home/gengar/Templates/workspace2/Hydra/src/renderer/App.tsx:174-312`), three hand-rolled resize handles (lines 494–523, 620–656, 668–704), and inlines `EmptyMain` (763–873), `Step` (875–914), `HeaderButton` (925–941).

2. **Orchestra ↔ classic imports go both ways — no boundary.** Classic → orchestra: `/home/gengar/Templates/workspace2/Hydra/src/renderer/components/StatusBar.tsx:4`, `CommandPalette.tsx:26`, `WelcomeScreen.tsx:14`, `Sidebar/index.tsx:15`, `SpotlightSearch.tsx:47`. Orchestra → classic: `/home/gengar/Templates/workspace2/Hydra/src/renderer/orchestra/TeamRail.tsx:11` (`../components/ContextMenu`); `orchestra/modals/NewTeamDialog.tsx:23`, `NewTaskDialog.tsx:13`, `AgentWizard.tsx:32` all pull `../../state/toasts`.

3. **Relative-time formatter copy-pasted 9×**: `orchestra/ActivityFeed.tsx:69`, `TasksHistoryPanel.tsx:48`, `TaskRow.tsx:80`, `TaskKanban.tsx:79`, `NotificationsBell.tsx:65`, `IssuesPanel.tsx:143`, `Inspector/InboxTab.tsx:43`, `Inspector/OverviewTab.tsx:128`, `TeamChangesPanel.tsx:35`. Same shape, minor drift.

4. **~2,200 LOC of dead components** in the bundle — none imported anywhere: `/home/gengar/Templates/workspace2/Hydra/src/renderer/components/QuickBar.tsx` (280), `SpotlightSearch.tsx` (851), `KeyboardCheatsheet.tsx` (227), `UsageMeter.tsx` (176), `SessionsActivitySpark.tsx` (200), `SessionInsights.tsx` (463 — its own comment on line 56 says "not importing from UsageMeter").

5. **Inconsistent folder/file naming**: PascalCase dirs (`components/Sidebar/`, `Toolkit/`, `Watchdog/`) next to flat PascalCase files (`CodeEditor.tsx`) next to lowercase feature dirs (`chat/`, `editor/`). `components/Sidebar/index.tsx` is 539 LOC pretending to be a barrel — real filename is invisible in stack traces.

6. **Inline hex for tokens that already exist**: `/home/gengar/Templates/workspace2/Hydra/src/renderer/components/ToolkitGrid.tsx:792-798` hardcodes `#fbbf24` (=`--color-status-running`), `#2ecc71`, `#ff4d5d`, `#ff6b4d`. Same in `components/editor/diff-extension.ts:210-216`.

7. **`.df-md` CSS block declared twice** in `/home/gengar/Templates/workspace2/Hydra/src/renderer/styles/globals.css` — lines 214–305 and 334–383. Second wins; first partially dead.

8. **Stores mixing UI flags with IPC cache**: `state/sessionsExtra.ts` (UI + pin), `state/gh.ts` (panel flag + PR cache), `state/editor.ts` (243 LOC: files + diffs + tree root + dirty), `state/toolkit.ts` (items/runs + `openPopoverId`/`editorOpen`), `state/watchdog.ts` (rules/log + panelOpen/editingId).

9. **Bootstrapping fanned out from `App.tsx`**: one `useEffect` (`App.tsx:151-166`) fires `initSessions`, `initToolkit`, `initWatchdog`, `initProjects`, `initTranscripts`, `initOrchestra`, plus `claude.resolvePath`. No lifecycle owner, ordering implicit, errors swallowed locally.

10. **Two sources of truth for shortcuts.** `/home/gengar/Templates/workspace2/Hydra/src/renderer/App.tsx:174-312` hardcodes a `handlers` map; `state/keybinds.ts:20-39` has an `ACTIONS` registry. They drift.

11. **IPC cache re-invented per store.** `state/claudeCommands.ts` (`byCwd: Record<string,Entry>`), `state/transcripts.ts` (`byId: Record<string,Entry>`), `state/projects.ts`, `state/toolkit.ts`, `state/watchdog.ts` — each hand-rolls fetch → cache → SWR with its own loading shape.

12. **Tour selectors pinned to Tailwind classes.** `/home/gengar/Templates/workspace2/Hydra/src/renderer/tour/tours.ts` hardcodes selectors for every step. A primitive migration silently breaks the tour with no test.

13. **Inline primitives inside `App.tsx`**: `HeaderButton` (925–941), `Step` (875–914), `EmptyMain` (763–873). Each belongs in `ui/` or `features/classic/welcome/`.

14. **`orchestra/state/orchestra.ts` is a 404-line mega-slice**: settings + teams + agents + edges + tasks + routes + messageLog + selection + drawer + 25 IPC thunks + event fan-out (344–404). One file, every axis.

15. **xterm colour theme literal 3×**: `components/SessionPane.tsx:48-51`, `TerminalsPanel.tsx:518-520`, `QuickTerminalApp.tsx:27-30`. One `lib/xtermTheme.ts` kills all three.

---

## 3. Target Layout (feature-first)

```
src/renderer/
  app/                         # main.tsx, App.tsx (<200 LOC), Shell, Header, boot.ts, shortcuts.ts
  features/
    classic/
      welcome/                 # WelcomeScreen + WelcomeGate + EmptyMain + Step
      sessions/                # SessionPane, SessionCard, SessionTabs, ActiveAgentBar, StatePill, Dashboard
      chat/                    # ChatView family + FileDropOverlay + TypingIndicator
      editor/                  # CodeEditor, CodeMirrorView, FileTree, Diff*, Search*, diff-extension, languages
      sidebar/                 # Sidebar.tsx + ProjectItem + WorktreeItem + CreateWorktreeDialog
      terminals/               # TerminalsPanel + shells store
      toolkit/                 # ToolkitGrid + Bar + EditorDialog + icons + toolkit store
      watchdog/                # Panel + RuleDialog + store
      pr/                      # PRInspector + gh store (split UI vs cache)
    orchestra/
      view/ canvas/ agents/ teams/ tasks/ inspector/ notifications/ onboarding/ modals/ search/
      state/                   # orchestra-data, orchestra-view, orchestra-actions, events
      lib/
    workspace/                 # projects + worktrees (shared)
    tour/
    palette/                   # CommandPalette
  ui/                          # §4 primitives
  lib/                         # platform, keybind, agent, formatRelative (new), xtermTheme (new), transcriptToMarkdown, ipc-cache (new)
  state/                       # cross-feature: toasts, keybinds, dialogs, layout
  styles/                      # globals.css → tokens.css + base.css + utilities.css
  quick-terminal/              # QuickTerminalApp + its own main
```

Each feature folder has optional `components/`, `hooks/`, `state/`, `lib/`, `types/`. Example moves: `components/ChatView.tsx` → `features/classic/chat/components/ChatView.tsx`; `orchestra/Inspector/OverviewTab.tsx` → `features/orchestra/inspector/OverviewTab.tsx`; `components/Sidebar/index.tsx` → `features/classic/sidebar/Sidebar.tsx`; the 6 dead files get deleted.

Enforce with ESLint `no-restricted-imports`: `features/classic/*` must not import `features/orchestra/*` and vice-versa; both may import `ui/`, `lib/`, `state/`.

---

## 4. Shared Primitives (`src/renderer/ui/`)

Grep evidence: **327** `rounded-* border px-* text-xs` button motif usages, **30** hand-rolled modal overlays, **27** inline `<kbd>`. Ship these 14 first, one PR, no new deps (hand-rolled `clsx` helper):

| Primitive | Replaces |
| --- | --- |
| `Button` (ghost/outline/accent/danger; xs/sm/md) | Every `<button className="rounded-sm border …">`, `HeaderButton`, CTAs |
| `IconButton` | 6 header icons in `App.tsx:368-428` |
| `Kbd` | 27 inline `<kbd>` |
| `Shortcut` (combo → platform `Kbd`) | `fmtShortcut` string usage everywhere |
| `Card` (header/footer slots) | Session/team/task/toolkit cards |
| `Pill` (status/accent/neutral) | `SessionStatePill`, `TaskChip`, badges |
| `Modal` + `ModalHeader` + `ModalFooter` | 30 hand-rolled `fixed inset-0 z-*` overlays |
| `Popover` | Toolkit run popover, NewAgentPopover, menus |
| `Dropdown` | TeamSwitcher, SafeMode, session ctx menu |
| `ContextMenu` | Relocate `components/ContextMenu.tsx` → `ui/` |
| `ResizeHandle` (rAF + min/max) | 3 copies in `App.tsx` + `orchestra/lib/useSplitter.ts` |
| `Tabs` + `Tab` | Inspector, editor, SessionTabs, TeamTabsStrip |
| `EmptyState` | ~8 ad-hoc empty screens |
| `Tooltip` | Every `title={…}` that deserves one |

Toasts: keep `state/toasts`; consolidate `components/Toasts.tsx` + `orchestra/OrchestraToasts.tsx` into one `ui/Toast.tsx`.

---

## 5. Token / Design-System Audit

Tokens are correctly declared in `/home/gengar/Templates/workspace2/Hydra/src/renderer/styles/globals.css:9-60` via Tailwind v4 `@theme` (`--color-bg-0..5`, `--color-text-1..4`, `--color-accent-*`, `--color-status-*`, `--radius-*`, `--shadow-*`). Keep. Problems:

1. **Duplicate `.df-md`** (`globals.css:214-305` and `334-383`) — merge.
2. **Status hex literals reintroduced** — `components/ToolkitGrid.tsx:792-798`, `components/editor/diff-extension.ts:210-216`. Replace with `var(--color-status-*)`.
3. **xterm theme duplicated 3×** — `SessionPane.tsx:48-51`, `TerminalsPanel.tsx:518-520`, `QuickTerminalApp.tsx:27-30`. One `lib/xtermTheme.ts` reading `getComputedStyle`.
4. **`main.tsx:31-100` error screen all inline hex** — can't follow a theme change; Tailwind is loaded before this renders.
5. **Canonical example already exists** — `SessionsActivitySpark.tsx:19-24` uses `var(--color-status-idle, #5e6070)`. Codify that pattern.

**Action**: split `globals.css` into `tokens.css` (`@theme`), `base.css` (html/body/scrollbars), `utilities.css` (`.df-*`, `.xterm`, `.df-md`). `globals.css` becomes 3 imports. Add an ESLint regex banning new inline hex in `*.tsx`.

---

## 6. State / Store Refactor

| Store | LOC | Verdict |
| --- | --- | --- |
| `state/sessions.ts` | 320 | Keep |
| `state/sessionsExtra.ts` | 81 | **Split** → `sessions/state/ui.ts` + `sessions/state/pin.ts` |
| `state/panels.ts` | 186 | **Split** → panels (kind) + layout (sizes) |
| `state/projects.ts` | 153 | Move to `features/workspace/state/`; extract worktrees slice |
| `state/gh.ts` | 65 | **Split** → pr panel (UI) + prCache (IPC-cache) |
| `state/toolkit.ts` | 127 | **Split** data (items/runs) vs UI (popover/editor) |
| `state/watchdog.ts` | 98 | **Split** data (rules/log) vs UI (panel/editing) |
| `state/transcripts.ts` | 124 | Keep; adopt `ipc-cache` helper |
| `state/claudeCommands.ts` | 42 | Adopt `ipc-cache` helper |
| `state/editor.ts` | 243 | **Split** files / diffs / tree-root / dirty |
| `state/shells.ts` | 77 | Move under `features/classic/terminals/` |
| `state/spawn.ts` | 25 | Merge into `state/dialogs.ts` |
| `state/keybinds.ts` / `toasts.ts` | 112 / 98 | Keep as renderer-root shared |
| `orchestra/state/orchestra.ts` | 404 | **Split** → data (mirror), view (selection/drawer), actions (25 IPC thunks), events (fan-out 344–404) |
| `orchestra/state/discovery.ts` / `notifications.ts` | 99 / 51 | Keep |

New helper `lib/ipc-cache.ts`: factory producing `{ byKey: Record<K,Entry<T>>, refresh(k), invalidate(k) }` with standard loading/error. Covers `claudeCommands`, `transcripts`, PR list, toolkit runs, watchdog log. **Rule**: never mix IPC cache and UI flags in the same store.

---

## 7. Testing Gaps

Today: **one** test file — `/home/gengar/Templates/workspace2/Hydra/src/renderer/state/__tests__/sessions-state-bleed.test.ts`. Vitest is wired (`"test": "vitest run"`). First tranche (pure logic, low setup cost):

1. `state/sessions.ts` — `createSession`, `destroySession`, high-water reducer, unread clearing on `setActive`.
2. `state/keybinds.ts` — `allBindings`/`resolveBind`/`isBoundEvent` with and without overrides.
3. `state/panels.ts` — slide-panel mutual exclusion; persisted shape unchanged (migration safety).
4. `state/transcripts.ts` — optimistic pending reconciliation (`transcripts.ts:30`).
5. `orchestra/state/orchestra.ts` — event fan-out switch (344–404), one test per `evt.kind`.
6. New `lib/formatRelative.ts` — boundaries + future-dated input.
7. New `ui/Modal` — focus trap + Esc + scroll lock.
8. `features/classic/welcome/WelcomeGate` — localStorage round-trip.

Skip Playwright/Electron e2e until the split lands.

---

## 8. Migration Plan (6 PRs, each ≤500 LOC, app green after each)

Every PR must end on `typecheck && test && build` green, no behavioural change.

1. **PR 1 — Dead code + `formatRelative`.** Delete 6 unused components (~2,200 LOC). Add `lib/formatRelative.ts`, swap 9 call sites. Drop duplicate `.df-md` block. Net: ~350 added / ~2,300 removed.
2. **PR 2 — `ui/` primitives.** Ship all 14 primitives + tests for `Modal` and `ResizeHandle`. No callers migrated. ~450 LOC.
3. **PR 3 — Extract shell.** Move `HeaderButton`, `EmptyMain`, `Step` out of `App.tsx`. Extract shortcut dispatcher → `app/shortcuts.ts`, boot pipeline → `app/boot.ts`. Replace 3 inline resize handles with `ui/ResizeHandle`. `App.tsx` lands under 200 LOC. ~450 LOC.
4. **PR 4 — Feature move: classic.** Relocate `chat/`, `editor/`, `Sidebar/`, `Toolkit/`, `Watchdog/` + flat classic files under `features/classic/<feature>/`. Keep barrel shims at old paths for one release. No logic changes. ~500 LOC of moves.
5. **PR 5 — Feature move: orchestra.** Split `orchestra/` into `features/orchestra/{view,canvas,agents,teams,tasks,inspector,notifications,onboarding,modals,search,state,lib}/`. Split `orchestra/state/orchestra.ts` into data/view/actions/events slices. ~500 LOC.
6. **PR 6 — Store surgery.** Introduce `lib/ipc-cache.ts`. Migrate `claudeCommands`, `transcripts`, gh PR cache, toolkit runs. Split `sessionsExtra`, `gh`, `editor`, `toolkit`, `watchdog`. Consolidate one-flag dialogs into `state/dialogs.ts`. Add unit tests for new slices. ~500 LOC.

Optional follow-ups (each ≤500 LOC): split `AgentWizard` by step, split `GitChangesPanel`, extract `lib/xtermTheme.ts`, switch tour selectors to `data-tour-id`, add ESLint feature-boundary rule.

---

## 9. Non-Goals

- No framework swap — React 19 + Vite stays.
- No CSS library swap — Tailwind v4 + CSS vars stays.
- No state library swap — Zustand stays (no Redux Toolkit, no React Query).
- No routing library — two surfaces don't justify it.
- No new dep for primitives — hand-rolled Tailwind, no Radix/shadcn/Headless UI.
- No backend / preload changes — `preload/index.ts` contract frozen.
- No rename of `src/shared/types.ts` or `src/shared/orchestra.ts`.
- No TypeScript strictness bump in the same batch.
- No i18n infra.

---

## 10. Risks / Watch-Outs

1. **Electron preload IPC subscriptions** — listeners bound to `window.api.on*` can silently go quiet after a file move (no error). Smoke-test live PTY + live orchestra events before merging PR 4 and PR 5.
2. **xterm.js keeps state in the DOM.** `TerminalsPanel` is mounted once and portalled (`App.tsx:753`) precisely to preserve xterm buffers + PTY subs. Any refactor that wraps the mount in a conditional (lazy-loading) kills live terminals. Lock behaviour with a test.
3. **Zustand `persist` storage keys are user-visible.** `hydra.orchestra.view` (`orchestra/state/orchestra.ts:321`) and every other `persist` `name:` option must stay stable — renaming resets users' workspaces.
4. **Tailwind v4 content discovery.** `@theme` tokens only get emitted for classes Tailwind sees at build time. Feature moves must stay inside the v4 Vite plugin's scan (check `postcss.config.cjs` + `electron.vite.config.ts`) — a missed class silently disappears in prod only.
5. **Tour selectors.** `tour/tours.ts` pins DOM selectors to Tailwind class lists — PR 2 will invalidate them with no test failing. Switch to `data-tour-id="…"` attributes on primitives before PR 2 ships, otherwise PR 3 ships a broken tour.

