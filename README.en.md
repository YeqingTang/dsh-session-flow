# dsh-session-flow

> **English** | [中文](README.md)

> A DSH plugin that redesigns the session information flow: turning raw session message streams into a **foldable information flow with session-level summaries** — a cross-session archive cabinet.

**In one sentence**: Too many sessions, too slow to review? This plugin turns every DSH session into an "archive card" — understand in seconds what a session did, where it got to, which tools it used, which files it touched — and track running sessions in real time.

[DeepSeek Harness (dsh)](https://github.com/deepseek-ai/dsh) is an AI agent workbench. Its built-in session views (Trajectory / Chat) excel at the microscopic inspection of *what is happening right now*; this plugin fills the missing layer of **post-hoc review / archival / insight**: a cross-session, cross-workspace historical perspective.

---

## What it does

| Feature | Description |
|---|---|
| 🗂️ **Session overview workbench** | All sessions as cards: title, workspace, status (running / ended / empty / subagent), error count, duration, created time; sortable and filterable — find the target session at a glance |
| 🔍 **Structured search** | `tool:pwsh` finds sessions that used a tool, `file:src/` finds sessions that touched a path, `err:` finds sessions with errors, or just free-text search (title / tool name / file path) |
| 📜 **Folded detail view** | Turns are collapsed by default into a two-line "user message + conclusion" summary; expand to view in **true chronological order**: thinking → tool calls → replies, exactly as they happened — never re-stacked by type |
| 🧭 **Four-tab navigation** | Right panel: user message outline / tool call list / error list / in-session full-text search — click any entry to auto-expand the turn, scroll to it, and flash-highlight it |
| 🌳 **Subagent lineage tree** | Tree view of parent-session → subagent relationships; subagent details reuse the folded rendering; one-click "view subagent" from tool rows |
| 📝 **Dual-mode summary** | Auto summary card per session: **rule mode** (zero cost, assembled live: task count / first task / latest conclusion / top tools) + **LLM mode** (one-click, uses the DSH model, summarizes task by task; cached on disk, prompts regeneration when new conversation arrives) |
| ⚡ **Live tracking** | Click "Live" on a running session: auto-refresh every 3 seconds, the active turn gets a breathing highlight + a "generating…" indicator — no page refresh needed |
| 📦 **ZIP chunked export** | One-click export of the full session as a readable Markdown report (`00-overview.md` + timeline chunks, ≤700KB each), packed as a ZIP — great for archival, sharing, or handoff |
| 🧹 **Cache management** | Visual view and scoped cleanup of index/timeline caches (only this plugin's caches; never touches DSH data) |

## Installation

### Option 1: Install from the plugin market (recommended)

Open "Plugin Market" in the DSH Web GUI sidebar, search for `dsh-session-flow`, and click install.

### Option 2: Install via npm

```sh
dsh plugin add dsh-session-flow
```

### Option 3: Install from GitHub

```sh
dsh plugin add github:YeqingTang/dsh-session-flow
```

### Option 4: Install from source (development)

```sh
git clone https://github.com/YeqingTang/dsh-session-flow.git
dsh plugin add link:/path/to/dsh-session-flow
```

### After installing

Whatever method you chose: **restart the DSH Web service**, then **hard-refresh the browser** (Ctrl+Shift+R / Ctrl+F5).
Installation succeeds when the "**Session Flow**" entry appears in the sidebar.

### Requirements

- DSH Web GUI (latest stable)
- Node.js ≥ 22.19 (uses built-in zstd decoding, zero third-party dependencies)

## Usage guide

### 1. Open the overview

Click "**Session Flow**" in the sidebar → all sessions are shown as cards. Supports:

- **Search**: the top search box mixes structured prefixes and free text:

  | Syntax | What it does | Example |
  |---|---|---|
  | `tool:xxx` | Sessions that used a tool | `tool:pwsh` |
  | `file:xxx` | Sessions that touched a path | `file:src/` |
  | `err:` | Sessions with errors | `err:` |
  | free text | Title / workspace / tool name / file path | `session flow` |

- **Workspace tabs**: filter by workspace; **sort**: recently run (default) / recently created / oldest first / most tools / longest
- **Stats bar**: tool usage Top 6 + one-click filter for problem sessions (with errors)

### 2. View a session

Click any session card:

- **Turns collapsed by default**: only "👤 user message + ✅ conclusion" summaries are shown; click a turn header to expand
- **Expanded**: view in true chronological order — thinking (🧠), tool calls (🛠️, with args / result / duration / error marks), assistant replies
- **Right navigation**: four tabs — user messages / tools / errors / search; click to locate in the content area (selected turn gets a blue highlight)
- **Summary card**: rule summary at top; click "Generate LLM summary" for an intelligent summary (model quota consumed on demand)

### 3. Track a live session

When a session is **running** (a "running" badge in the header):

1. Click the "**Live**" button in the top-right
2. The timeline auto-refreshes (every 3 s); the active turn gets a **green breathing highlight** + a "generating…" indicator at the bottom
3. Click "Exit live" to return to the archived view

### 4. Export a report

In the detail view, click "**Export report (ZIP)**" → download `session-report-<title>.zip`, unzip to get:

```
00-overview.md           # session metadata + summary + tool stats + artifact list + chunk guide
01-timeline-turn1-25.md  # per-turn timeline (chunked, ≤700KB each)
02-timeline-turn26-50.md # …
```

The Markdown report opens in any editor / VSCode / Typora.

### 5. Cache management

Overview → "Cache management": view cache sizes and clean selectively (timeline cache / all). Caches rebuild automatically on next access; session data is never affected.

## Acknowledgements

This plugin stands on the shoulders of the DSH community. Thanks to:

- **[DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness)** — the DSH agent workbench and plugin ecosystem this plugin runs on.
- **[@deepseek-ai/dsh-session-persistence-jsonl](https://github.com/deepseek-ai/deepseek-harness)** — the zstd multi-frame scanning algorithm for session archives (`scanZstdFrames` in `lib/archive.js` is adapted from this project, MIT licensed).
- **[dsh-web-ui (@linxin666 family)](https://github.com/zhu1090093659/dsh-web-ui)** — reference for the sidebar-entry and center-panel mounting pattern (DOM-level injection + panel mutual exclusion); no code copied; includes dsh-task-board / dsh-ssh etc.
- **[dsh-webui-market-plugin](https://www.npmjs.com/package/@sanqi-normal/dsh-webui-market-plugin)** — the plugin-market mechanism and a distribution channel for this plugin.

> Copyrights belong to their respective authors; this plugin is Apache-2.0 licensed and retains original license notices for third-party code (see comments in `lib/archive.js`).

## License

[Apache-2.0](LICENSE)
