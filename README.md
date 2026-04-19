<p align="center">
  <img src="resources/icon.png" width="128" alt="Hydra Ensemble icon">
</p>

<h1 align="center">Hydra Ensemble</h1>

<p align="center">
  <a href="https://github.com/javabetatester/hydra-ensemble/actions/workflows/ci.yml"><img src="https://github.com/javabetatester/hydra-ensemble/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
</p>

<p align="center">A cross-platform multi-session terminal for <a href="https://claude.ai/claude-code">Claude Code</a>. Run parallel Claude sessions with git worktree isolation, live status tracking, and a built-in toolkit. Linux, Windows, and macOS.</p>

<p align="center">Built by <a href="https://intuitivecompute.com">Intuitive Compute</a></p>

> **Status**: currently in **Phase 0** of the multi-OS rewrite. The macOS-only Swift baseline is being ported to Electron + TypeScript. See [PLAN.md](PLAN.md) for the migration plan and [docs/](docs/) for architecture and PRDs.

## Download

Grab the latest installer for your OS from [GitHub Releases](https://github.com/javabetatester/hydra-ensemble/releases/latest):

- Linux: `.deb` or `.AppImage`
- Windows: `.exe` (NSIS installer)
- macOS: `.dmg`

See [INSTALL.md](INSTALL.md) for per-OS install steps.

## Features

- **Multi-tab terminal** — `xterm.js`-based terminal with full ANSI color, true color, mouse, and resize support.
- **Parallel Claude sessions** — Run multiple Claude Code instances side by side.
- **Git worktree isolation** — Each session gets its own worktree branch.
- **Claude state isolation** — Each session runs against its own `CLAUDE_CONFIG_DIR` so JSONL, locks, and per-project state never collide. See [docs/isolation-strategy.md](docs/isolation-strategy.md).
- **Live session status** — Real-time detection of `thinking` / `generating` / `idle` / `needs-attention` via PTY stream analysis.
- **Cost tracking** — Reads Claude's JSONL session files for live token and cost data.
- **Project management** — Persistent project list with expandable worktree trees.
- **Watchdogs** — Configurable auto-responders that match PTY output regex and react.
- **Code editor** — Built-in `CodeMirror 6` editor with syntax highlighting (Cmd/Ctrl+E).
- **Configurable toolkit** — One-click commands (test, build, lint) with output popovers.
- **Voice transcription** — Web Speech API in v1; optional offline `whisper.cpp` in v2 (Cmd/Ctrl+Shift+V).
- **Floating quick terminal** — Always-on-top shell rooted in the project dir (Cmd/Ctrl+`).
- **Multi-OS notifications** — Native on Win/macOS/Linux, in-app fallback when no daemon is running.
- **Session persistence** — Restore sessions across app restarts.
- **PR Inspector** — List and diff open GitHub PRs via the `gh` CLI.

## Requirements

- A supported OS:
  - Linux: Ubuntu 22.04+, Debian 12+, Arch (current).
  - Windows 10 / 11.
  - macOS 13+.
- [Claude Code](https://claude.ai/claude-code) installed and on `PATH`.
- For PR Inspector: [`gh`](https://cli.github.com/) installed and authenticated.

For building from source: Node.js 20+, npm, git, and OS-specific native build tools — see [INSTALL.md](INSTALL.md#build-from-source).

## Build & Run

```bash
git clone https://github.com/javabetatester/hydra-ensemble.git
cd hydra-ensemble
npm install
npm run dev
```

Production build for the current OS:

```bash
npm run dist
```

Outputs land in `dist/`. See [DEVELOPMENT.md](DEVELOPMENT.md) for the full workflow.

## Keyboard Shortcuts

Modifier is **Cmd** on macOS and **Ctrl** on Linux/Windows.

| Shortcut | Action |
|----------|--------|
| Cmd/Ctrl + T | New session |
| Cmd/Ctrl + W | Close session |
| Cmd/Ctrl + 1–9 | Switch to session N |
| Cmd/Ctrl + D | Toggle dashboard |
| Cmd/Ctrl + E | Toggle code editor |
| Cmd/Ctrl + N | New session with worktree |
| Cmd/Ctrl + O | Open project |
| Cmd/Ctrl + Shift + V | Voice input |
| Cmd/Ctrl + ` | Toggle quick terminal |

## Architecture

Hydra Ensemble is an Electron application with a Node.js + TypeScript main process and a React + Vite + Tailwind renderer. The terminal is `xterm.js`, the editor is `CodeMirror 6`, and the PTY layer is `node-pty` (Microsoft, also used by VS Code).

See [docs/architecture.md](docs/architecture.md) for the process model, IPC contracts, data-flow diagrams, and security posture. See [docs/prd/](docs/prd/) for per-feature PRDs and [PLAN.md](PLAN.md) for the migration plan.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines and [DEVELOPMENT.md](DEVELOPMENT.md) for the dev workflow.

## License

[MIT](LICENSE)
