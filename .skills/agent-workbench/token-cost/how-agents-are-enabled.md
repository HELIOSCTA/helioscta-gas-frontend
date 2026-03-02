# How Agents Are Enabled for Analysis

## Context

This document describes the current architecture for how agents are provisioned, discovered, and used within the analysis workbench. No code changes are proposed — this is a reference document.

---

## Architecture Overview

Agents are **database-managed entities** that power the chat interface in the workbench. They are not directly tied to analysis packs — instead, packs provide data/steps while agents provide the conversational AI layer.

```
Agent (DB)  ←──  WorkbenchChat (auto-selects first active)
                      │
                      ├── creates Conversation (per session)
                      ├── sends messages to /api/agents/[agentId]/chat
                      └── receives streamed responses
                              │
                              └── context injected from:
                                    ├── workspace files (blob storage)
                                    └── SQL run results (from pack runs)
```

---

## Step-by-Step Flow

### 1. Seed an agent in the database

Agents are created via SQL migrations into `helioscta_agents.agents`:

| Column | Purpose |
|--------|---------|
| `agent_id` | Unique identifier (PK, VARCHAR 64) |
| `display_name` | Human-readable name |
| `system_prompt` | Claude system prompt defining agent behavior |
| `model` | Claude model to use (default: `claude-sonnet-4-6`) |
| `is_active` | Must be `TRUE` for the agent to appear |

**File:** `backend/migrations/009_seed_default_agent.sql`

There is **no REST API or UI** in the workbench to create agents. They must be seeded via database migrations.

### 2. Workbench auto-selects the first active agent

When the user sends a message in `WorkbenchChat`, it calls:

```
GET /api/agents → returns all agents WHERE is_active = TRUE ORDER BY display_name
```

It picks `data.agents[0]` — the first one alphabetically. If none exist, it shows "No agent configured. Please set up an agent first."

**Files:**
- `frontend/components/workbench/WorkbenchChat.tsx` (lines 42-50)
- `frontend/app/api/agents/route.ts`

### 3. A conversation is created per chat session

Each message creates a new conversation:

```
POST /api/agents/{agentId}/conversations → { conversation_id }
```

Stored in `helioscta_agents.conversations` with FK to `agents.agent_id`.

**File:** `frontend/app/api/agents/[agentId]/conversations/route.ts`

### 4. Message is sent to the agent chat endpoint

```
POST /api/agents/{agentId}/chat
Body: { messages, conversationId, workspaceContext: { workspaceId, fileIds, runId } }
```

**File:** `frontend/app/api/agents/[agentId]/chat/route.ts`

### 5. Chat route processes the request

The handler performs these steps in order:

1. **Auth check** — `requireAuth()`
2. **Validate conversation** — must belong to this agent and be active
3. **Load agent config** — fetches `system_prompt` and `model` from DB
4. **Persist user message** — saves to `helioscta_agents.messages`
5. **Inject workspace context** into system prompt:
   - Up to 5 files from blob storage (900 tokens each, 2500 total budget)
   - SQL results from completed runs (top 20 rows per query)
6. **Window messages** — keeps first + last 10 messages, summarizes dropped middle
7. **Budget check** — enforces per-user daily/monthly token limits
8. **Route model** — classifies request complexity, picks optimal Claude model
9. **Stream response** — calls Anthropic API, streams text back to client
10. **On finish** — saves assistant message with token counts/cost, auto-saves response to blob storage

### 6. Relationship between agents, workspaces, and packs

```
agents ──1:N──→ conversations ──1:N──→ messages
agents ──0:N──→ workspaces (optional agent_id FK)
workspaces ──1:N──→ analysis_packs ──1:N──→ pack_runs ──1:N──→ pack_run_steps
workspaces ──1:N──→ sql_runs (context injected into agent chat)
```

Key: **Analysis packs are workspace-bound, not agent-bound.** The agent provides chat; packs provide data and execution steps. They meet at the workspace level — SQL results from pack runs are injected as context into the agent's system prompt.

---

## What's Missing / Limitations

- **No agent selector in workbench** — always uses the first active agent. A separate `AgentsWorkspace` component (`frontend/components/ai/AgentsWorkspace.tsx`) has full agent CRUD UI but isn't wired into the workbench.
- **No pack-to-agent binding** — you can't assign a specific agent to a specific analysis pack.
- **Conversations are ephemeral** — a new one is created per message send (no persistent chat history in the workbench UI).
- **Agent creation is migration-only** — no API endpoint to create agents programmatically.
