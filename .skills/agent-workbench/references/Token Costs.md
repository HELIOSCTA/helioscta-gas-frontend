# Token Cost Minimization Plan (v1)

## Scope
This plan covers token-cost control for the Helios shared analysis workspace, with focus on:

- Agent chat and drafting (`frontend/app/api/agents/[agentId]/chat/route.ts`)
- Analysis-pack runs that call LLMs for report narratives
- Context packaging from workspace files (`prompt.md`, `analysis.md`, SQL, reports)

This plan does not cover non-token cloud costs (compute, blob storage, DB query costs).

## Goals

1. Cut average token cost per completed analysis run by at least 50% from baseline.
2. Keep quality stable for analyst-assisted report drafting.
3. Add hard guardrails to prevent runaway spend from large context or long conversations.
4. Make token spend observable per user, conversation, workspace, and analysis run.

## Current Cost Risk Areas

1. Full message history is sent on each turn with limited compression.
2. System prompts may be large and repeated every request.
3. Workspace context (markdown/sql/report files) can grow without strict token budgets.
4. Output length is not consistently bounded by task type.
5. No explicit per-run or per-user budget enforcement.
6. Draft/report generation can re-request large context even when data is unchanged.

## Cost Strategy

Use a four-layer strategy:

1. Observe and measure first.
2. Shrink input tokens before model call.
3. Cap output tokens by workflow stage.
4. Route requests to the cheapest model that meets quality threshold.

## Phase 0 - Instrumentation Baseline (Required First)

### 0.1 Data Tracking
Extend token tracking beyond `messages.input_tokens/output_tokens`:

- `request_type` (`chat`, `draft_section`, `full_report`, `summarize_context`)
- `workspace_id`
- `run_id` (if analysis run)
- `model_name`
- `cache_hit` (for prompt/context cache)
- `estimated_cost_usd`

### 0.2 Reporting Dashboard
Create daily aggregates:

- Total input tokens
- Total output tokens
- Cost by model
- Cost by user
- Cost by workspace
- Cost by analysis run
- Top expensive prompts/contexts

### 0.3 Baseline Window
Collect 7 days baseline before strict tuning:

- p50/p90 tokens per chat turn
- tokens per finalized report
- cost per analyst per day

## Phase 1 - Input Token Reduction

### 1.1 Conversation Windowing
For chat requests:

- Include last 6-10 messages max
- Keep a rolling conversation summary for older context
- Replace old raw messages with compact summary once threshold is exceeded

Default thresholds:

- `MAX_RAW_HISTORY_MESSAGES = 10`
- `MAX_CONTEXT_TOKENS_HISTORY = 3000`

### 1.2 System Prompt Hygiene
Split system prompt into:

- Stable core prompt (small)
- Task-specific addendum (small)
- Runtime context block (bounded and structured)

Hard limits:

- `MAX_SYSTEM_PROMPT_TOKENS = 800`
- Reject updates that exceed this unless explicitly approved by admin.

### 1.3 Workspace Context Budgeting
When sending file context (`workspaceContext.fileIds`):

- Only include selected sections, not full files by default
- Chunk and rank context by relevance
- Deduplicate repeated paragraphs/snippets
- Drop binary-like or low-signal text blocks

Hard limits:

- `MAX_WORKSPACE_CONTEXT_TOKENS = 2500`
- `MAX_SINGLE_FILE_CONTEXT_TOKENS = 900`
- `MAX_FILES_PER_REQUEST = 5`

### 1.4 SQL Result Compression Before LLM
Never pass raw large SQL results to model.

Pass:

- Row count
- Column schema
- Top N rows sample (N <= 20)
- Pre-computed summary stats
- Key deltas versus prior run

Hard limits:

- `MAX_SQL_ROWS_TO_MODEL = 20`
- `MAX_SQL_RESULT_TOKENS = 1200`

## Phase 2 - Output Token Controls

### 2.1 Max Output Tokens by Task
Set strict caps:

- `chat`: 350-600
- `draft_section`: 700-1200
- `full_report_draft`: 1800-2600
- `summary`: 250-400

### 2.2 Structured Output Format
Use section templates and compact JSON/markdown skeletons to reduce verbose free-form generation.

### 2.3 Stop Conditions
Use stop rules and prompt constraints:

- "Do not repeat input context"
- "No appendix unless requested"
- "Return only required sections"

## Phase 3 - Model Routing and Fallback

### 3.1 Tiered Routing
Implement router:

- Low-cost model for classification, summarization, small edits
- Mid-tier model for section drafting
- High-tier model only for full final narrative or difficult synthesis

### 3.2 Escalation Rules
Escalate model tier only when:

- analyst explicitly requests high-depth output
- quality check fails on lower tier
- confidence heuristics indicate low quality

### 3.3 Retry Policy
On failure:

- retry once on same model
- second retry only with next tier if necessary
- no unbounded retries

## Phase 4 - Caching and Reuse

### 4.1 Context Hash Cache
Cache model-ready context blocks by hash of:

- selected file IDs + file updated timestamps
- run date/trade date
- step name

### 4.2 Prompt Fragment Cache
Cache stable prompt fragments:

- core system prompt
- report section instructions
- formatting rules

### 4.3 Run Artifact Reuse
If same run inputs are unchanged:

- reuse prior computed summaries and chart-ready JSON
- avoid regenerating narrative unless analyst requests refresh

## Phase 5 - Budget Guardrails

### 5.1 Budget Levels
Define budgets:

- per request
- per conversation
- per analysis run
- per user per day

### 5.2 Enforcement
Implement soft and hard limits:

- Soft: warning in UI with estimated remaining budget
- Hard: block call and require explicit override permission

Example defaults (tune after baseline):

- `MAX_COST_PER_CHAT_TURN_USD = 0.03`
- `MAX_COST_PER_RUN_USD = 1.50`
- `MAX_COST_PER_USER_PER_DAY_USD = 10.00`

### 5.3 Pre-flight Cost Estimate
Estimate token usage before model call and block if projected cost exceeds configured cap.

## Phase 6 - UX Changes to Prevent Waste

1. Show estimated token/cost before sending large requests.
2. Add "Concise mode" toggle as default ON.
3. Require confirmation for:
- full-file context injection
- full-report regeneration
- high-tier model usage
4. Add "Regenerate section only" to avoid regenerating full report.

## Phase 7 - Governance and Operations

1. Weekly spend review with top 10 expensive runs.
2. Monthly prompt audit for bloat.
3. Alerting:
- sudden >30% day-over-day cost spike
- single run exceeding hard budget
4. Keep an admin policy file for live threshold tuning without code deploy.

## Implementation Checklist

### Backend/API

1. Add token/cost policy config module.
2. Add pre-flight token estimation utility.
3. Add context compaction utilities (history summarizer, workspace chunking).
4. Add SQL-result summarizer before LLM calls.
5. Add model router utility.
6. Add budget checks in chat + report-generation endpoints.
7. Persist enhanced telemetry fields.

### Frontend

1. Add estimated-cost indicator in chat composer and run toolbar.
2. Add concise mode toggle.
3. Add warnings/blocks for high-cost actions.
4. Add run-level token/cost panel in workbench.

### Data/DB

1. Extend message/run metadata tables for cost fields.
2. Add aggregates for daily cost reports.
3. Add indexed queries for top spend diagnostics.

## Success Criteria

1. 50%+ reduction in average cost per finalized report run.
2. 40%+ reduction in p90 tokens per chat turn.
3. <2% of requests hitting hard budget blocks after first tuning cycle.
4. No significant quality regression per analyst review.

## Risks and Mitigations

1. Risk: Over-aggressive truncation harms quality.
- Mitigation: rollout with conservative caps + quality sampling.
2. Risk: Routing sends hard tasks to cheap model.
- Mitigation: escalation heuristics + manual override.
3. Risk: Cache serves stale context.
- Mitigation: hash includes file timestamps and run parameters.
4. Risk: Analysts bypass constraints.
- Mitigation: enforce limits server-side, not only in UI.

## Rollout Plan

1. Week 1: Instrumentation and baseline only.
2. Week 2: Enable windowing, output caps, and SQL summarization.
3. Week 3: Enable model routing and caching.
4. Week 4: Turn on hard budget enforcement and alerts.

Use feature flags:

- `TOKEN_GUARDRAILS_ENABLED`
- `MODEL_ROUTER_ENABLED`
- `CONTEXT_CACHE_ENABLED`
- `COST_UI_ENABLED`

## Default Starting Thresholds

These are initial values and should be tuned after baseline:

- `MAX_SYSTEM_PROMPT_TOKENS = 800`
- `MAX_WORKSPACE_CONTEXT_TOKENS = 2500`
- `MAX_SQL_RESULT_TOKENS = 1200`
- `MAX_RAW_HISTORY_MESSAGES = 10`
- `MAX_OUTPUT_TOKENS_CHAT = 500`
- `MAX_OUTPUT_TOKENS_DRAFT_SECTION = 1000`
- `MAX_OUTPUT_TOKENS_FULL_REPORT = 2200`
