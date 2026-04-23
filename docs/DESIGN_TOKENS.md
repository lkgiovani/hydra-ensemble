# Hydra Renderer — Design Tokens Overview

Source of truth: `/home/gengar/Templates/workspace2/Hydra/src/renderer/styles/globals.css` (lines 9–60).
Tokens are declared inside a Tailwind v4 `@theme { ... }` block, which means every
`--color-*`, `--radius-*`, `--font-*`, `--shadow-*` custom property is auto-exposed
as a Tailwind utility (`bg-bg-2`, `text-text-1`, `rounded-sm`, `font-mono`, ...).
This audit covers every token, how it is used today, and where raw hex / rgba
literals are still leaking around the token system.

---

## 1. Token palette

### 1.1 Surfaces (`--color-bg-*`)

| Swatch | Name | Value | Intent |
| --- | --- | --- | --- |
| ▓ | `--color-bg-0` | `#0a0a0b` | App root background, furthest back |
| ▓ | `--color-bg-1` | `#0e0e10` | Primary surface (panes, terminal chrome) |
| ▓ | `--color-bg-2` | `#121214` | Secondary surface (cards, inputs, code inline) |
| ▓ | `--color-bg-3` | `#1a1a1d` | Raised/hover surface (buttons, active rows) |
| ░ | `--color-bg-4` | `#232327` | Pressed / strong hover |
| ░ | `--color-bg-5` | `#2e2e33` | Rare: disabled chip, deep pill |

Tailwind use: `bg-bg-0 .. bg-bg-5`. Most-used surface is `bg-bg-3` (384 refs),
followed by `bg-bg-1` (256) and `bg-bg-2` (221).

### 1.2 Borders (`--color-border-*`)

| Swatch | Name | Value | Intent |
| --- | --- | --- | --- |
| · | `--color-border-soft` | `rgba(255,255,255,0.07)` | Default 1px divider, card edge |
| – | `--color-border-mid`  | `rgba(255,255,255,0.13)` | Stronger separation, hover edge |
| ═ | `--color-border-hard` | `rgba(255,255,255,0.22)` | Focus / active outline only |

Tailwind use: `border-border-soft` (439), `border-border-mid` (233),
`border-border-hard` (2 — almost unused).

### 1.3 Text (`--color-text-*`)

| Swatch | Name | Value | Intent |
| --- | --- | --- | --- |
| █ | `--color-text-1` | `#f5f5f2` | Primary foreground |
| █ | `--color-text-2` | `#bfbfba` | Secondary (body copy, muted label) |
| ▒ | `--color-text-3` | `#888884` | Tertiary (help, breadcrumb) |
| ░ | `--color-text-4` | `#54544f` | Quaternary (bracket, prompt chrome, df-label) |

Tailwind use: `text-text-4` (565), `text-text-1` (469), `text-text-3` (398),
`text-text-2` (290). `text-text-4` being the highest is noteworthy — a lot of
UI leans on the quietest tone.

### 1.4 Accent (`--color-accent-*` — coral / Claude vibe)

| Swatch | Name | Value | Intent |
| --- | --- | --- | --- |
| █ | `--color-accent-50`  | `#fef4f0` | Cream, rarely used |
| █ | `--color-accent-200` | `#ffcab7` | Hover on links, soft pill |
| █ | `--color-accent-400` | `#ff9476` | Links, `.df-prompt-arrow` glyph |
| █ | `--color-accent-500` | `#ff6b4d` | Primary CTA, focus outline, cursor |
| █ | `--color-accent-600` | `#e5543a` | Pressed CTA |
| █ | `--color-accent-700` | `#b8402a` | Deep accent (rare) |

Tailwind counts: `text-accent-400` (130), `bg-accent-500` (129),
`border-accent-500` (50). `accent-50`, `accent-700`, `accent-100`, `accent-300`
appear in code despite *not* being defined in `globals.css` — Tailwind silently
produces `undefined` for those; see Gaps.

### 1.5 Status semantics (`--color-status-*`)

| Swatch | Name | Value | Intent |
| --- | --- | --- | --- |
| █ | `--color-status-idle`       | `#5e6070` | Dormant agent, muted dot |
| █ | `--color-status-thinking`   | `#ffb829` | Thinking spinner (amber) |
| █ | `--color-status-generating` | `#2ecc71` | Streaming / success (green) |
| █ | `--color-status-input`      | `#4ea5ff` | Waiting for user, blue info |
| █ | `--color-status-attention`  | `#ff4d5d` | Error / needs attention (red) |
| █ | `--color-status-editing`    | `#c084fc` | Edit tool active (violet) |
| █ | `--color-status-reading`    | `#60a5fa` | Read tool active (sky) |
| █ | `--color-status-running`    | `#fbbf24` | Shell / bash active (gold) |

Most referenced: `status-attention` (110), `status-generating` (42),
`status-input` (19), `status-thinking` (14). `status-reading` (1) and
`status-editing` (2) are dramatically under-used — they exist but most tool
rows fall back to generic accent.

### 1.6 Non-color tokens

| Token | Value | Intent | Tailwind use |
| --- | --- | --- | --- |
| `--radius-sm` | `0.125rem` (2px) | Pills, inline code, focus ring | `rounded-sm` (26) |
| `--radius-md` | `0.25rem`  (4px) | Buttons, cards | `rounded-md` (11) |
| `--radius-lg` | `0.375rem` (6px) | Modals, drawer | `rounded-lg` (22) |
| `--shadow-soft` | `0 0 0 1px var(--color-border-soft) inset` | Flat card ring | `shadow-soft` (2) |
| `--shadow-card` | `0 0 0 1px var(--color-border-mid) inset` | Card w/ hover | `shadow-card` (4) |
| `--shadow-pop`  | `0 2px 0 0 rgba(0,0,0,0.6), 0 0 0 1px var(--color-border-hard) inset` | Brutalist raised block | `shadow-pop` (62) |
| `--font-sans`    | `Inter Variable, ...` | Rare, body sans | `font-sans` (1) |
| `--font-mono`    | `JetBrains Mono Variable, ...` | **Default** CLI-first chrome | `font-mono` (523) |
| `--font-display` | `Inter Variable, ...` | Hero h1, big numbers | `font-display` (6) |

---

## 2. Usage audit (frequency & dead weight)

Counted via `grep` over `src/renderer/**/*.{ts,tsx,css}` (158 files).

- **Surfaces**: `bg-bg-3` (384) > `bg-bg-1` (256) > `bg-bg-2` (221) > `bg-bg-4` (48) > `bg-bg-0` (29) > `bg-bg-5` (**4 — under-used**, candidate for deletion or repurpose).
- **Text**: `text-text-4` (565) > `text-text-1` (469) > `text-text-3` (398) > `text-text-2` (290). Healthy distribution.
- **Borders**: `border-border-soft` (439) vs `border-border-hard` (**2 — under-used**). Hard border is defined but nobody reaches for it; focus rings are built via `--color-accent-500` instead.
- **Accent**: `accent-400/500` dominate; `accent-50`/`accent-700` are 0 refs in components. Dead tokens.
- **Status**: `status-attention` (110) and `status-generating` (42) do the heavy lifting. `status-reading` (1), `status-editing` (2), `status-running` (3) are **under-used** — most tool-call UIs skip the fine-grained token and use the generic one.
- **Radii**: `rounded-md` (11) is the runt vs `rounded-sm` (26) and `rounded-lg` (22). Not a problem, but the distinction between `sm` and `md` (2px vs 4px) is subtle; could be merged.
- **Shadows**: `shadow-soft` (2) and `shadow-card` (4) are essentially unused — everyone jumps straight to `shadow-pop` (62). Candidates for consolidation.
- **Fonts**: `font-mono` is default via `body { font-family: var(--font-mono) }`, so the 523 explicit uses are mostly re-assertions inside scoped components.

---

## 3. Gaps — hex / rgba literals that should be tokens

Search (excluding `globals.css` and `node_modules`) returned **96 hex-literal occurrences** plus 14 rgba literals that duplicate token values. Concrete examples:

1. `/home/gengar/Templates/workspace2/Hydra/src/renderer/QuickTerminalApp.tsx:27` — `background: '#0d0d0f'` duplicates `--color-bg-1 (#0e0e10)`.
2. `/home/gengar/Templates/workspace2/Hydra/src/renderer/QuickTerminalApp.tsx:77` — `bg-[#0d0d0f]`, same issue, arbitrary Tailwind.
3. `/home/gengar/Templates/workspace2/Hydra/src/renderer/QuickTerminalApp.tsx:79` — `bg-[#16161a]` (new shade, fits between bg-2 and bg-3).
4. `/home/gengar/Templates/workspace2/Hydra/src/renderer/tour/TourPlayer.tsx:213` — `bg-[#1a1d23]` duplicates `--color-bg-3` ish.
5. `/home/gengar/Templates/workspace2/Hydra/src/renderer/tour/TourPlayer.tsx:135` — `rgba(125,211,252,...)` introduces a sky-blue halo colour that exists nowhere in the token set.
6. `/home/gengar/Templates/workspace2/Hydra/src/renderer/components/editor/diff-extension.ts:192` — `rgba(46, 204, 113, 0.10)` hard-codes `--color-status-generating` at 10% alpha.
7. `/home/gengar/Templates/workspace2/Hydra/src/renderer/components/editor/diff-extension.ts:198` — `rgba(255, 77, 93, 0.55)` hard-codes `--color-status-attention` at 55%.
8. `/home/gengar/Templates/workspace2/Hydra/src/renderer/components/editor/diff-extension.ts:210` — `backgroundColor: '#2ecc71'` literal copy of `--color-status-generating`.
9. `/home/gengar/Templates/workspace2/Hydra/src/renderer/components/editor/diff-extension.ts:213` — `backgroundColor: '#ffb829'` literal copy of `--color-status-thinking`.
10. `/home/gengar/Templates/workspace2/Hydra/src/renderer/components/editor/diff-extension.ts:216` — `linear-gradient(... #ff4d5d ...)` literal copy of `--color-status-attention`.
11. `/home/gengar/Templates/workspace2/Hydra/src/renderer/components/editor/CodeMirrorView.tsx:131-138` — four rgba literals for `rgba(255, 184, 41, ...)` and `rgba(255, 107, 77, ...)` that duplicate `--color-status-thinking` and `--color-accent-500`.
12. `/home/gengar/Templates/workspace2/Hydra/src/renderer/components/ToolkitGrid.tsx:792-798` — returns literal hex strings `#fbbf24`, `#2ecc71`, `#ff4d5d`, `#ff6b4d` from a `statusAccent` helper (classic "tokens at the function boundary" smell).
13. `/home/gengar/Templates/workspace2/Hydra/src/renderer/components/chat/ChatView.tsx:68,128` + `ChatMessage.tsx:175` — default `session.accentColor ?? '#7aa2f7'` introduces a blue not present in tokens.
14. `/home/gengar/Templates/workspace2/Hydra/src/renderer/components/chat/ChatView.tsx:71-77` — literal `'#0b0b0d'` and `'#fff'` used for dynamic foreground picking against session accent.
15. `/home/gengar/Templates/workspace2/Hydra/src/renderer/main.tsx:31-97` — error-splash screen hard-codes `#0a0a0b`, `#f5f5f2`, `#ff4d5d`, `#c5c5c0`, `#888884`, `#54544f`, `#ff6b4d`, `#17171a` — almost every one already has a token equivalent.
16. `/home/gengar/Templates/workspace2/Hydra/src/renderer/components/SessionPane.tsx:48-51` + `TerminalsPanel.tsx:518-520` — xterm theme blocks duplicate `bg-1`, `text-1`, `accent-500` as strings (plus `#ff6b4d59` which is accent at 35%).
17. `/home/gengar/Templates/workspace2/Hydra/src/renderer/lib/agent.ts:14-17` — 16-colour palette for agent avatars uses raw hex; only one value (`#ff6b4d`) overlaps a token.

Opacity-via-Tailwind leaks: **26 occurrences** of `bg-white/10`, `text-white/50`,
`border-white/10`, `bg-black/50`, etc. under `src/renderer/` (notable in
`tour/TourPlayer.tsx`, `orchestra/ShortcutHud.tsx`, `App.tsx:847`).
These bypass the `--color-border-*` tokens and should be normalised.

---

## 4. Proposed additions

| Proposed token | Value | Rationale |
| --- | --- | --- |
| `--color-accent-100` | `#ffddd0` | Already referenced as `text-accent-100` (4x) and `text-accent-300` (9x) — Tailwind resolves to `undefined`; fill the ramp. |
| `--color-accent-300` | `#ffb094` | idem. |
| `--color-accent-contrast-on` | `#0b0b0d` | The `ChatView`/`ChatMessage` readableText helper uses `#0b0b0d` vs `#fff`; token-ise the "on-light accent" shade. |
| `--color-info`     | `#7aa2f7` | Used as the neutral session accent fallback in chat; pick one value and reuse. Today it is a 3-way duplication with `status-input`. |
| `--color-surface-titlebar` | `#16161a` | The `QuickTerminalApp` title strip sits between bg-2 and bg-3; formalise it. |
| `--color-status-success`, `--color-status-warning`, `--color-status-danger` | aliases of `status-generating`, `status-thinking`, `status-attention` | The UI already says "success"/"warning"/"error" in code comments; semantic aliases let product code read naturally. |
| `--color-accent-alpha-35`, `--color-accent-alpha-50` | `rgba(255,107,77,0.35)` / `rgba(255,107,77,0.5)` | Already hardcoded 4x in `globals.css` (selection, glow) and in xterm theme strings. |
| `--shadow-drawer`  | `-12px 0 24px -8px rgba(0,0,0,0.6)` | Repeated in `TaskDrawer.tsx:223` and `TaskChat.tsx:209/243` via arbitrary `shadow-[-12px_0_24px_-8px_rgba(0,0,0,0.6)]`. |
| `--radius-pill`    | `9999px` | Currently spelled out as `rounded-full`; keeping a token keeps terminology consistent. |

Agent-palette (`lib/agent.ts`) should either: (a) graduate into 16 numbered
tokens (`--color-agent-1 … --color-agent-16`), or (b) be explicitly declared as
"out of token system" with a comment — today it is ambiguous.

---

## 5. Accessibility notes (rough WCAG AA)

Body text on app background:

| Foreground | Background | Approx. ratio | AA body (4.5) | AA large (3.0) |
| --- | --- | --- | --- | --- |
| `text-1 #f5f5f2` | `bg-0 #0a0a0b` | ~18:1 | pass | pass |
| `text-1` | `bg-3 #1a1a1d` | ~16:1 | pass | pass |
| `text-2 #bfbfba` | `bg-1 #0e0e10` | ~11:1 | pass | pass |
| `text-3 #888884` | `bg-1` | ~5.2:1 | pass | pass |
| `text-3` | `bg-3` | ~4.6:1 | pass (tight) | pass |
| `text-4 #54544f` | `bg-0` | ~2.9:1 | **fail body** | pass large only |
| `text-4` | `bg-2 #121214` | ~2.7:1 | **fail body** | fail |
| `text-4` | `bg-3` | ~2.5:1 | **fail** | fail (borderline) |

`text-4` is the most-used text token (565 refs) and it does NOT meet AA for
body copy on any current surface. It is intentionally a chrome-only tone
(labels, bracket glyphs, `df-label` at 10px), which WCAG treats leniently, but
the CSS should make that constraint explicit (e.g. only allow `text-4` where
`font-size >= 18px` or non-informative). Flag for review.

Accent-on-dark:

- `accent-500 #ff6b4d` on `bg-0`: ~5.1:1 — pass body.
- `accent-400 #ff9476` on `bg-0`: ~7.0:1 — pass body.
- `accent-200 #ffcab7` on `bg-0`: ~11.5:1 — pass body.
- `accent-500` on `accent-500` fill (white text via `#fff`, main.tsx:56): ~3.6:1 — **fail body**, pass large. Buttons must stay >= 14px bold.

Status colours on `bg-1`:

- `status-generating #2ecc71`: ~8.6:1 pass.
- `status-attention #ff4d5d`: ~4.8:1 pass body (tight).
- `status-thinking #ffb829`: ~10.5:1 pass.
- `status-idle #5e6070`: ~3.1:1 — **fail body**, pass large only. Acceptable for dots/pills but not for prose.

No obvious catastrophic failures; tighten `text-4` usage rules and document
minimum sizes for `status-idle` copy.

---

## 6. Migration plan

Phase 0 — **instrument** (no code change):

- Add an ESLint/stylelint rule that rejects arbitrary Tailwind values matching `bg-\[#`, `text-\[#`, `border-\[#` and bare hex literals inside `src/renderer/**/*.{ts,tsx}`, except on `styles/globals.css`. Start in warn mode.

Phase 1 — **complete the ramps** (additive, safe):

- Fill `--color-accent-100` and `--color-accent-300` so existing (broken) references start rendering.
- Add `--color-status-success|warning|danger` as aliases of existing status tokens.
- Add `--color-info` (replaces the ad-hoc `#7aa2f7`).

Phase 2 — **replace duplicates** (mechanical):

- `diff-extension.ts`, `CodeMirrorView.tsx`: switch rgba literals to `color-mix(in srgb, var(--color-status-*) 10%, transparent)` (supported by every Chromium Electron target ≥ 111).
- `main.tsx` splash: replace every hex with the matching token via inline `style={{ color: 'var(--color-text-1)' }}` — page is React, no Tailwind runtime issues.
- `QuickTerminalApp.tsx`, `TourPlayer.tsx:213`: swap arbitrary `bg-[#..]` for tokenised utilities.

Phase 3 — **normalise overlays**:

- Collapse the 26 `bg-white/*`, `border-white/*`, `bg-black/*` occurrences to `border-border-soft|mid|hard` (or new `--color-scrim`, `--color-veil` tokens for backdrops such as `bg-black/50`).

Phase 4 — **agent palette decision**: move `lib/agent.ts` palette into either (a) numbered agent tokens exposed in `@theme`, or (b) a dedicated non-theme constant file with a banner comment saying it is out of scope. Pick one, document.

Phase 5 — **retire dead tokens**: `--color-bg-5`, `--color-border-hard` (if still unused after migration), `--color-accent-50`, `--color-accent-700` — or find 3+ good homes for each.

Phase 6 — **flip lint to error** and land a follow-up commit enforcing the rule.

Each phase is a single PR; no phase touches runtime behaviour, only spelling.
Regression risk is limited to visual-regression tests (xterm theme, diff
gutter, tour halo) which should be snapshotted before Phase 2.

---

**Report**

- File written: `/home/gengar/Templates/workspace2/Hydra/docs/DESIGN_TOKENS.md`
- Total tokens indexed: 36 (6 surfaces + 3 borders + 4 text + 6 accent + 8 status + 3 radius + 3 shadow + 3 font).
- Hex-value gaps found outside `globals.css`: **96 hex occurrences + 14 duplicate rgba + 26 `white/` or `black/` opacity leaks** across ~20 files.
