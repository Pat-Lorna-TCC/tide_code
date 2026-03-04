# Tide IDE — Agentic Coding Environment
Spec v2.0 | 2026-03-04

## 1) Vision

Tide is a desktop IDE that makes AI coding agents **transparent, controllable, and orchestrated**. Built with Tauri (Rust) + React, it wraps the Pi coding agent as its core engine — then adds an orchestration layer on top: multi-step task planning, cost-aware model routing, persistent project memory, and safety-gated tool execution.

**Mission**: Create the best tool for agentic coding — where developers see exactly what the agent knows, control what it does, and benefit from intelligent multi-agent workflows that handle complex tasks end-to-end.

**Target user**: Professional developers who use AI coding agents daily and want more control, visibility, and intelligence than a CLI or editor plugin provides.

## 2) Why Tide

| Dimension | Claude Code CLI | Cursor | Copilot | **Tide** |
|-----------|----------------|--------|---------|----------|
| Context visibility | None (terminal) | Minimal | None | **Glass-box**: Context Dial, Inspector, budget breakdown |
| Multi-step orchestration | None | None | None | **Route → Plan → Build → Review** pipeline |
| Safety controls | y/n in terminal | Implicit | None | **Configurable policies**, diff preview, audit logs |
| Project memory | CLAUDE.md only | None | None | **Persistent .tide/**:  tags, plans, memory, sessions |
| Cost management | None | Hidden | Hidden | **Cost tracker**, model routing by task complexity |
| Extensibility | MCP servers | Extensions | Plugins | **Skills** (Pi extensions) + Command Palette |

**Tide's differentiators:**
- **Glass-box context**: See exactly what the agent sees — token budget, pinned regions, injected context
- **Orchestrated workflows**: Complex tasks get routed through Planner → Builder → Reviewer automatically
- **Persistent project memory**: .tide/ folder survives sessions — the agent learns your project over time
- **Cost-aware routing**: Simple edits use fast/cheap models; complex architecture uses powerful ones
- **Safety-first**: Approval dialogs with diff previews, configurable policies, command allowlists

## 3) Architecture

### 3.1 System Layers

```
Tauri (Rust)
├── Orchestrator: Idle → Routing → Planning → Building → Reviewing → Complete
├── Spawns: pi --mode rpc -e tide-safety.ts -e tide-project.ts -e tide-router.ts
├── stdin → JSON commands to Pi (prompt, abort, ui_response, set_model)
├── stdout → JSON events from Pi (text_delta, tool_execution_*, ui_request)
├── Native services: FS ops, Keychain, Git, cost tracking
└── Emits Tauri events to React

Pi (RPC mode)
├── Built-in tools: read, write, edit, bash, grep, find, ls
├── LLM providers: Anthropic, OpenAI, Google, etc. (15+)
├── Sessions: JSONL tree structure, auto-compaction, branching
└── Extensions:
    ├── tide-safety.ts     (tool_call → approval gate)
    ├── tide-project.ts    (.tide/ context injection, tide_tags tool, project memory)
    ├── tide-router.ts     (task classification → model selection)
    └── tide-planner.ts    (complex tasks → .tide/features/ plan generation)

React UI
├── Listens to "pi_event" Tauri events
├── Renders: streaming text, tool calls, approval dialogs, diffs
├── File tree / Monaco editor via Tauri native FS
├── Command Palette (Cmd+Shift+P), Settings, Terminal
└── Orchestration progress, plan viewer, cost indicator
```

### 3.2 Orchestration Flow

```
User Prompt
    │
    ▼
  Router (classify task difficulty)
    │
    ├─ quick ──────► Direct Pi prompt (fast model)
    │                    │
    │                    ▼
    │                 Response
    │
    ├─ standard ───► Direct Pi prompt (standard model)
    │                    │
    │                    ▼
    │                 Response
    │
    └─ complex ────► Planner (powerful model)
                         │
                         ▼
                     .tide/features/<slug>.json
                         │
                         ▼
                     Builder (step-by-step, per plan step)
                         │
                         ▼
                     Reviewer (check code, run tests)
                         │
                         ▼
                     Changeset summary + approval
```

The orchestration state machine lives in **Rust** — it manages the Pi process, spawns sequential prompts with different system prompts and models for each phase. This gives full control over multi-step workflows.

### 3.3 Authority Model

- **Pi** owns: tool execution, LLM interaction, session management, agent loop
- **Tide Rust** owns: orchestration state, Pi process lifecycle, native services (FS, Keychain, Git)
- **Tide extensions** own: safety policy, context injection, project memory, task routing
- **UI** owns: user intent, approvals/denials, file browsing/editing, settings

### 3.4 IPC

- **Tauri ↔ Pi**: JSON lines over stdin/stdout (Pi RPC protocol)
- **Tauri ↔ React**: Tauri events (`pi_event`, `pi_ui_request`) + invoke commands

## 4) The .tide/ Ecosystem

Durable project context lives in `.tide/` (repo-local, version-controllable):

```
.tide/
├── tags/tags.json           # Region tags — pinned code sections across sessions
├── features/                # Feature plans from Planner agent
│   └── <slug>.json          #   { slug, title, steps: [{ id, desc, status, files }] }
├── sessions/                # Session summaries
│   └── <timestamp>.md       #   What was accomplished, files changed, decisions made
├── memory.json              # Project memory — learned facts, conventions, decisions
├── repo-map.md              # Auto-generated project structure summary
├── skills/                  # Workspace-local skill extensions
├── phases/                  # Phase files tracking project milestones
└── tide.db                  # Legacy SQLite (to be removed)
```

**TIDE.md** (workspace root): Safety policy, command allowlist, test commands, project conventions.

## 5) Pi Extensions

### tide-safety.ts
- Intercepts `tool_call` events, classifies tools (read/write/command)
- Reads TIDE.md for safety config (approval policy, command allowlist)
- For write/edit tools: captures file content before change, includes in approval payload for diff preview
- Uses `ctx.ui.confirm()` for approval dialogs with diff data
- Returns `{ block: true, reason }` to deny

### tide-project.ts
- Ensures `.tide/` directory structure on session start
- Injects into system prompt via `before_agent_start`:
  - TIDE.md content (always)
  - Pinned region tags (always)
  - Repo map summary (if available)
  - Recent session summaries (if available)
  - Relevant project memory entries (if available)
- Registers custom tools: `tide_tags` (region tag CRUD), `tide_memory` (project memory read/write)

### tide-router.ts
- Intercepts `before_agent_start` hook
- Classifies task difficulty: `quick` (question, small edit), `standard` (feature implementation), `complex` (multi-file architecture)
- Sets model via Pi API: quick → fast model, standard → balanced model, complex → powerful model
- Emits `routing_decision` event to UI

### tide-planner.ts
- Activated for `complex` tasks by the orchestrator
- Generates structured plan: `.tide/features/<slug>.json`
- Plan format: steps with descriptions, target files, acceptance criteria
- Plan visible in UI via Plan Viewer tab

## 6) Tauri Commands (Rust)

### Current
| Command | Purpose |
|---------|---------|
| `send_prompt(text)` | Send prompt to Pi agent |
| `abort_agent()` | Abort current Pi operation |
| `get_pi_status()` | Check Pi connection status |
| `get_pi_state()` | Request Pi state (model, session) |
| `respond_ui_request(id, confirmed)` | Respond to extension approval dialog |
| `open_workspace(path)` | Set workspace root + list directory |
| `fs_list_dir(path)` | List directory (Rust native) |
| `fs_read_file(path)` | Read file + detect language (Rust native) |

### Planned
| Command | Purpose | Phase |
|---------|---------|-------|
| `keychain_set_key/get_key/delete_key` | macOS Keychain for API keys | 5 |
| `git_status/git_branch` | Git integration | 5 |
| `set_pi_model(model)` | Forward model switch to Pi | 6 |
| `orchestrate(prompt)` | Start orchestrated multi-agent flow | 8 |

## 7) Non-Negotiables

- **Pi as core engine**: All coding reasoning, tool calling, and LLM interaction goes through Pi in RPC mode
- **Safety via extensions**: Write/command operations require approval unless relaxed in TIDE.md
- **Durable context in `.tide/`**: Project memory, region tags, plans, and safety config live in `.tide/`
- **No Python required**: Everything in TypeScript (Pi extensions) + Rust (Tauri shell)
- **Artifacts over narration**: Truth = tool execution results, diffs, file changes, test results
- **Cost transparency**: Token usage and estimated cost visible at all times
- **User always in control**: No auto-approve; orchestration is opt-in; user can always send direct prompts
- **Glass-box context**: User can inspect exactly what context the agent sees

## 8) Tech Stack

- **Desktop**: Tauri v2 (Rust)
- **UI**: React 19 + Vite + Zustand 5 + Monaco Editor
- **Engine**: Pi coding agent (`@mariozechner/pi-coding-agent`) in RPC mode
- **Extensions**: TypeScript (Pi extension API)
- **Types**: Zod (shared), TypeBox (Pi tools)
- **Native**: `security-framework` (Keychain), `git2` (Git), `tokio` (async)

## 9) Phased Roadmap

### Completed
- **Phases 1-3**: Initial skeleton — Tauri app, React UI, file tree, Monaco editor, region tags (original custom engine, since archived)
- **Phase 4**: Pi integration pivot — replaced custom engine with Pi RPC, rewrote Rust IPC, rewired React, created safety and project extensions

### Phase 5: Pi-Independent IDE Polish (no Pi required)
Command Palette (Cmd+Shift+P), Settings panel + API key management (macOS Keychain), diff preview in approval dialogs, git status in status bar, markdown rendering in agent chat.

### Phase 6: Wire Pi Features (requires Pi available)
Connect ContextDial to Pi state, wire LogsTab to tool execution events, wire region tags to Pi tide_tags tool, model picker in status bar, wire diff preview to approval flow.

### Phase 7: Router + Task Classification
tide-router.ts extension for task difficulty classification and model selection, router status UI, feature plan generator (tide-planner.ts), plan viewer panel, cost tracker.

### Phase 8: Multi-Agent Orchestration
Rust orchestration state machine (Idle→Routing→Planning→Building→Reviewing→Complete), step-by-step builder execution, reviewer phase, orchestration progress UI, multi-file change viewer.

### Phase 9: Skills + Extensibility
Skill registration framework, built-in skills (test discovery, explain code, refactor), repo map generator, skill management UI.

### Phase 10: Session Intelligence + Project Memory
Session summary generation, project memory store (.tide/memory.json + tide_memory tool), smart context injection, session history UI, project dashboard.

## 10) Success Criteria

A developer opens Tide, types "Build a REST API for user management with auth, tests, and documentation." Tide:

1. **Routes** it as a complex task, selects a powerful model
2. **Plans** — generates a structured plan in `.tide/features/user-api.json` with steps
3. **Builds** — executes each step with approval gates, showing diffs before writes
4. **Reviews** — runs tests, checks compilation, reports issues
5. **Presents** — shows a changeset summary with per-file diffs for final approval

Throughout, the developer sees: the orchestration pipeline progress, the context budget, the cost so far, and every tool call with its result. They can pause, override the model, edit the plan, or take manual control at any point.

That's Tide — transparent, controllable, orchestrated agentic coding.
