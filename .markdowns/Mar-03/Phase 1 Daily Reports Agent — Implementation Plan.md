### examples 
- https://github.com/vercel/chatbot

#### Phase 1: Daily Reports Agent — Implementation Plan                                                                                                     

│ Context                                                                                                                                                │
│                                                                                                                                                        │
│ Build a new standalone /reports page where a user chats with an AI agent that queries the database via MCP tools and generates structured daily        │
│ reports with commentary. Manual trigger only — no scheduling in Phase 1. MCP is the sole DB access mechanism for the agent (the user will configure    │
│ MCP connections per the existing plan in .markdowns/Mar-03/postgres_mcp.md).                                                                           │
│                                                                                                                                                        │
│ What Already Exists (reuse these)                                                                                                                      │
│                                                                                                                                                        │
│ ┌──────────────────────────────────────────────────┬─────────────────────────────────────────┬────────────────────────────────────┐                    │
│ │                      Asset                       │                  Path                   │             Reuse How              │                    │
│ ├──────────────────────────────────────────────────┼─────────────────────────────────────────┼────────────────────────────────────┤                    │
│ │ Chat pattern (useChat + TextStreamChatTransport) │ components/ai/AgentsWorkspace.tsx       │ Follow same hook/transport pattern │                    │
│ ├──────────────────────────────────────────────────┼─────────────────────────────────────────┼────────────────────────────────────┤                    │
│ │ MessageBubble                                    │ components/ai/MessageBubble.tsx         │ Import directly                    │                    │
│ ├──────────────────────────────────────────────────┼─────────────────────────────────────────┼────────────────────────────────────┤                    │
│ │ Chat API route                                   │ app/api/agents/[agentId]/chat/route.ts  │ Copy & extend with MCP tools       │                    │
│ ├──────────────────────────────────────────────────┼─────────────────────────────────────────┼────────────────────────────────────┤                    │
│ │ Token budget & cost                              │ lib/token-budget.ts, lib/token-costs.ts │ Import directly                    │                    │
│ ├──────────────────────────────────────────────────┼─────────────────────────────────────────┼────────────────────────────────────┤                    │
│ │ Auth guard                                       │ lib/auth-guard.ts                       │ Import directly                    │                    │
│ ├──────────────────────────────────────────────────┼─────────────────────────────────────────┼────────────────────────────────────┤                    │
│ │ Feature flags                                    │ lib/feature-flags.ts                    │ Add new flag                       │                    │
│ ├──────────────────────────────────────────────────┼─────────────────────────────────────────┼────────────────────────────────────┤                    │
│ │ Sidebar nav                                      │ components/Sidebar.tsx                  │ Add nav item                       │                    │
│ ├──────────────────────────────────────────────────┼─────────────────────────────────────────┼────────────────────────────────────┤                    │
│ │ DB pool                                          │ lib/db.ts                               │ Import for report persistence      │                    │
│ ├──────────────────────────────────────────────────┼─────────────────────────────────────────┼────────────────────────────────────┤                    │
│ │ Recharts, react-markdown                         │ package.json                            │ Already installed                  │                    │
│ ├──────────────────────────────────────────────────┼─────────────────────────────────────────┼────────────────────────────────────┤                    │
│ │ MCP gateway plan                                 │ .markdowns/Mar-03/postgres_mcp.md       │ Align MCP config approach          │                    │
│ └──────────────────────────────────────────────────┴─────────────────────────────────────────┴────────────────────────────────────┘                    │
│                                                                                                                                                        │
│ Not yet built (despite CLAUDE.md references): StructuredReport types and ReportPreview component. These must be created.                               │
│                                                                                                                                                        │
│ ---                                                                                                                                                    │
│ New Dependency                                                                                                                                         │
│                                                                                                                                                        │
│ @ai-sdk/mcp   # MCP client for Vercel AI SDK — connects to MCP servers and exposes tools to streamText                                                 │
│                                                                                                                                                        │
│ ---                                                                                                                                                    │
│ Implementation Steps                                                                                                                                   │
│                                                                                                                                                        │
│ Step 1: Types & Feature Flag                                                                                                                           │
│                                                                                                                                                        │
│ Create frontend/lib/types/report.ts — StructuredReport types:                                                                                          │
│ - StructuredReport (version, title, summary, overall_signal, trade_date, sections[])                                                                   │
│ - Section union: NarrativeSection, MetricCardSection, TableSection, ChartSection, SignalSection                                                        │
│ - Each section type has the fields needed for rendering (markdown, metrics with deltas/trends, column defs, Recharts config, signal                    │
│ direction/confidence)                                                                                                                                 │
│                                                                                                                                                        │
│ Modify frontend/lib/feature-flags.ts:                                                                                                                  │
│ - Add DAILY_REPORTS_ENABLED = envBool("NEXT_PUBLIC_DAILY_REPORTS_ENABLED", true)                                                                       │
│                                                                                                                                                        │
│ Step 2: MCP Config Loader                                                                                                                              │
│                                                                                                                                                        │
│ Create frontend/lib/mcp-config.ts:                                                                                                                     │
│ - loadMcpServers() reads MCP_SERVERS env var (JSON array of server configs)                                                                            │
│ - Each config: { name, transport: "sse" | "http", url, headers? }                                                                                      │
│ - Aligns with the existing MCP gateway plan (sidecar at port 3101)                                                                                     │
│                                                                                                                                                        │
│ Step 3: MCP-Enabled Chat API Route                                                                                                                     │
│                                                                                                                                                        │
│ Create frontend/app/api/reports/chat/route.ts:                                                                                                         │
│ - Based on existing app/api/agents/[agentId]/chat/route.ts pattern                                                                                     │
│ - Key additions over existing chat route:                                                                                                              │
│   - Creates MCP client(s) via @ai-sdk/mcp createMCPClient, retrieves their tools                                                                       │
│   - Passes tools to streamText with maxSteps: 10 (agent can make multiple DB queries per turn)                                                         │
│   - Uses toDataStreamResponse() (not text stream) so tool call events flow to client                                                                   │
│   - Higher token budget per turn for report generation ($0.50 vs $0.05)                                                                                │
│   - System prompt includes: StructuredReport JSON schema, DB schema knowledge (gas_ebbs tables, 20 pipeline names), instructions to output report as   │
│ fenced ```json block                                                                                                                                   │
│ - Keeps: auth, conversation windowing, message persistence, cost tracking from existing route                                                          │
│                                                                                                                                                        │
│ Step 4: ReportPreview Component                                                                                                                        │
│                                                                                                                                                        │
│ Create frontend/components/reports/ReportPreview.tsx:                                                                                                  │
│ - Props: { report: StructuredReport }                                                                                                                  │
│ - Renders report header (title, summary, overall_signal badge, trade_date)                                                                             │
│ - Renders sections by type:                                                                                                                            │
│   - narrative — react-markdown with remark-gfm, dark prose styling                                                                                     │
│   - metric_card — Grid of cards with value, delta, trend arrow (↑↓→), signal color                                                                     │
│   - table — Styled data table with typed columns (string, number, currency, percent, date)                                                             │
│   - chart — Recharts (line/bar/area/composed) mapped from config                                                                                       │
│   - signal — Direction badge (bullish green / bearish red / neutral gray) with confidence                                                              │
│ - Dark theme: bg-[#0b0d14], border-gray-800, text-gray-100                                                                                             │
│                                                                                                                                                        │
│ Step 5: Reports Page (Route + Layout)                                                                                                                  │
│                                                                                                                                                        │
│ Create frontend/app/reports/page.tsx — server component entry:                                                                                         │
│ import ReportsClient from "./ReportsClient";                                                                                                           │
│ export const dynamic = "force-dynamic";                                                                                                                │
│ export default function ReportsPage() { return <ReportsClient />; }                                                                                    │
│                                                                                                                                                        │
│ Create frontend/app/reports/ReportsClient.tsx — two-panel layout:                                                                                      │
│ - Left panel (~40%): Chat interface                                                                                                                    │
│   - Agent selector dropdown (fetch from /api/agents)                                                                                                   │
│   - Conversation list (new/load conversations)                                                                                                         │
│   - Message stream (MessageBubble components)                                                                                                          │
│   - "Generate Daily Report" button (sends pre-formatted prompt)                                                                                        │
│   - Input area for freeform follow-up                                                                                                                  │
│ - Right panel (~60%): Report preview                                                                                                                   │
│   - Empty state when no report generated                                                                                                               │
│   - ReportPreview renders when agent produces StructuredReport JSON                                                                                    │
│   - "Save Report" button in header                                                                                                                     │
│ - State: selectedAgentId, conversationId, currentReport, savedReports[]                                                                                │
│ - Uses useChat with TextStreamChatTransport pointed at /api/reports/chat                                                                               │
│ - Report extraction: scans assistant messages for ```json blocks containing valid StructuredReport                                                     │
│                                                                                                                                                        │
│ Step 6: Navigation                                                                                                                                     │
│                                                                                                                                                        │
│ Modify frontend/components/Sidebar.tsx:                                                                                                                │
│ - Add "daily-reports" to ActiveSection type union                                                                                                      │
│ - Add nav item in a new "REPORTS" group or under existing section, gated by DAILY_REPORTS_ENABLED                                                      │
│                                                                                                                                                        │
│ Modify frontend/app/HomePageClient.tsx:                                                                                                                │
│ - Add "Daily Reports" card that navigates to /reports                                                                                                  │
│                                                                                                                                                        │
│ Step 7: Report Persistence                                                                                                                             │
│                                                                                                                                                        │
│ Create backend/migrations/011_daily_reports.sql:                                                                                                       │
│ CREATE TABLE helioscta_agents.daily_reports (                                                                                                          │
│     report_id       SERIAL PRIMARY KEY,                                                                                                                │
│     conversation_id INTEGER,                                                                                                                           │
│     agent_id        VARCHAR(64),                                                                                                                       │
│     title           VARCHAR(512) NOT NULL,                                                                                                             │
│     trade_date      DATE NOT NULL,                                                                                                                     │
│     report_json     JSONB NOT NULL,                                                                                                                    │
│     overall_signal  VARCHAR(32),                                                                                                                       │
│     created_by      VARCHAR(256),                                                                                                                      │
│     created_at      TIMESTAMPTZ DEFAULT NOW()                                                                                                          │
│ );                                                                                                                                                     │
│ CREATE INDEX idx_daily_reports_date ON helioscta_agents.daily_reports (trade_date DESC);                                                               │
│                                                                                                                                                        │
│ Create frontend/app/api/reports/route.ts:                                                                                                              │
│ - GET — list saved reports (id, title, trade_date, signal, created_at)                                                                                 │
│ - POST — save report JSON to DB                                                                                                                        │
│                                                                                                                                                        │
│ Create frontend/app/api/reports/[reportId]/route.ts:                                                                                                   │
│ - GET — fetch full report by ID                                                                                                                        │
│ - DELETE — remove a saved report                                                                                                                       │
│                                                                                                                                                        │
│ Create frontend/components/reports/ReportHistory.tsx:                                                                                                  │
│ - Dropdown/sidebar showing saved reports, clickable to load into preview                                                                               │
│                                                                                                                                                        │
│ Step 8: Seed Report Agent                                                                                                                              │
│                                                                                                                                                        │
│ Create backend/migrations/012_seed_report_agent.sql:                                                                                                   │
│ - Insert agt-daily-report agent with system prompt containing:                                                                                         │
│   - Role: senior gas market analyst                                                                                                                    │
│   - StructuredReport JSON schema                                                                                                                       │
│   - DB schema knowledge (all 20 pipeline tables, gas_ebbs schema)                                                                                      │
│   - Instructions for MCP tool usage and report output format                                                                                           │
│                                                                                                                                                        │
│ ---                                                                                                                                                    │
│ New Files Summary                                                                                                                                      │
│                                                                                                                                                        │
│ ┌─────┬───────────────────────────────────────────────┬───────────────────────────────────┐                                                            │
│ │  #  │                     File                      │              Purpose              │                                                            │
│ ├─────┼───────────────────────────────────────────────┼───────────────────────────────────┤                                                            │
│ │ 1   │ frontend/lib/types/report.ts                  │ StructuredReport type definitions │                                                            │
│ ├─────┼───────────────────────────────────────────────┼───────────────────────────────────┤                                                            │
│ │ 2   │ frontend/lib/mcp-config.ts                    │ MCP server config loader          │                                                            │
│ ├─────┼───────────────────────────────────────────────┼───────────────────────────────────┤                                                            │
│ │ 3   │ frontend/app/api/reports/chat/route.ts        │ Streaming chat API with MCP tools │                                                            │
│ ├─────┼───────────────────────────────────────────────┼───────────────────────────────────┤                                                            │
│ │ 4   │ frontend/components/reports/ReportPreview.tsx │ Render StructuredReport sections  │                                                            │
│ ├─────┼───────────────────────────────────────────────┼───────────────────────────────────┤                                                            │
│ │ 5   │ frontend/app/reports/page.tsx                 │ Server component entry            │                                                            │
│ ├─────┼───────────────────────────────────────────────┼───────────────────────────────────┤                                                            │
│ │ 6   │ frontend/app/reports/ReportsClient.tsx        │ Two-panel layout + state          │                                                            │
│ ├─────┼───────────────────────────────────────────────┼───────────────────────────────────┤                                                            │
│ │ 7   │ frontend/app/api/reports/route.ts             │ List/save reports API             │                                                            │
│ ├─────┼───────────────────────────────────────────────┼───────────────────────────────────┤                                                            │
│ │ 8   │ frontend/app/api/reports/[reportId]/route.ts  │ Single report CRUD                │                                                            │
│ ├─────┼───────────────────────────────────────────────┼───────────────────────────────────┤                                                            │
│ │ 9   │ frontend/components/reports/ReportHistory.tsx │ Saved reports list                │                                                            │
│ ├─────┼───────────────────────────────────────────────┼───────────────────────────────────┤                                                            │
│ │ 10  │ backend/migrations/011_daily_reports.sql      │ daily_reports table               │                                                            │
│ ├─────┼───────────────────────────────────────────────┼───────────────────────────────────┤                                                            │
│ │ 11  │ backend/migrations/012_seed_report_agent.sql  │ Seed report agent                 │                                                            │
│ └─────┴───────────────────────────────────────────────┴───────────────────────────────────┘                                                            │
│                                                                                                                                                        │
│ Modified Files                                                                                                                                         │
│                                                                                                                                                        │
│ ┌─────────────────────────────────┬───────────────────────────────────┐                                                                                │
│ │              File               │              Change               │                                                                                │
│ ├─────────────────────────────────┼───────────────────────────────────┤                                                                                │
│ │ frontend/lib/feature-flags.ts   │ Add DAILY_REPORTS_ENABLED         │                                                                                │
│ ├─────────────────────────────────┼───────────────────────────────────┤                                                                                │
│ │ frontend/components/Sidebar.tsx │ Add nav item + ActiveSection type │                                                                                │
│ ├─────────────────────────────────┼───────────────────────────────────┤                                                                                │
│ │ frontend/app/HomePageClient.tsx │ Add reports card                  │                                                                                │
│ ├─────────────────────────────────┼───────────────────────────────────┤                                                                                │
│ │ frontend/package.json           │ Add @ai-sdk/mcp                   │                                                                                │
│ └─────────────────────────────────┴───────────────────────────────────┘                                                                                │
│                                                                                                                                                        │
│ ---                                                                                                                                                    │
│ Relevant Open-Source References                                                                                                                        │
│                                                                                                                                                        │
│ - Vercel AI SDK MCP Tools: https://ai-sdk.dev/cookbook/next/mcp-tools — pattern for connecting MCP servers to streamText                               │
│ - Vercel Chatbot Template: https://github.com/vercel/chatbot — production chat UI patterns                                                             │
│ - AI SDK Natural Language Postgres: https://ai-sdk.dev/cookbook/guides/natural-language-postgres — querying Postgres via AI                            │
│ - Vanna AI: https://github.com/vanna-ai/vanna — text-to-SQL agent with retrieval (reference for query patterns)                                        │
│                                                                                                                                                        │
│ ---                                                                                                                                                    │
│ Env Vars (New)                                                                                                                                         │
│                                                                                                                                                        │
│ # MCP servers (JSON array) — aligns with existing MCP gateway plan                                                                                     │
│ MCP_SERVERS='[{"name":"postgres","transport":"sse","url":"http://localhost:3101/mcp"}]'                                                                │
│                                                                                                                                                        │
│ # Feature flag                                                                                                                                         │
│ NEXT_PUBLIC_DAILY_REPORTS_ENABLED=true                                                                                                                 │
│                                                                                                                                                        │
│ ---                                                                                                                                                    │
│ Verification                                                                                                                                           │
│                                                                                                                                                        │
│ 1. MCP connection: Start the MCP gateway sidecar, set MCP_SERVERS env var, confirm agent can list tables via tool call                                 │
│ 2. Chat flow: Open /reports, select agent, send "Generate a daily report" — verify streaming response with tool calls visible                          │
│ 3. Report rendering: Confirm StructuredReport JSON is extracted and renders all section types (narrative, metrics, table, chart, signal)               │
│ 4. Persistence: Save a report, refresh page, load it from history                                                                                      │
│ 5. Nav: Confirm sidebar link and home page card route to /reports                                                                                      │
│ 6. Build: cd frontend && npm run build passes with no type errors   