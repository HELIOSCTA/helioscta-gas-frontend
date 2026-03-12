# Repository Guidelines

## Project Structure & Module Organization
- `frontend/`: Next.js 15 + TypeScript app. Main UI code is in `app/`, reusable UI in `components/`, and shared utilities in `lib/`.
- `frontend/app/api/**/route.ts`: App Router API handlers used by the UI.
- `backend/`: FastAPI service (`src/api.py`) plus DB and utility modules in `src/utils/`.
- `backend/migrations/`: SQL migration files (for example `010_watchlists.sql`).
- `scripts/`: Operational scripts (notably `setup-azure.sh` for Azure provisioning/deployment).
- `docker-compose.yml`: Local multi-service orchestration (frontend + backend).

## Build, Test, and Development Commands
- `docker compose up --build`: Run frontend and backend together (`:2222` and `:1111`).
- `cd frontend && npm install`: Install frontend dependencies.
- `cd frontend && npm run dev`: Start Next.js dev server.
- `cd frontend && npm run build && npm run start`: Build and run production frontend.
- `cd frontend && npm run lint` / `npm run lint:fix`: Lint and auto-fix frontend code.
- `cd backend && pip install -r requirements.txt`: Install backend dependencies.
- `cd backend && uvicorn src.api:app --reload --host 0.0.0.0 --port 1111`: Run backend locally.
- `cd backend && pytest`: Run backend tests (when `backend/tests` exists).

## Coding Style & Naming Conventions
- Frontend: follow ESLint config (`next/core-web-vitals`, `next/typescript`) and strict TypeScript settings.
- Use 2-space indentation and keep React components in `PascalCase` (e.g., `CashBalmoTable.tsx`).
- Keep route handlers named `route.ts` inside feature folders under `frontend/app/api/`.
- Backend Python should follow PEP 8: 4-space indentation, `snake_case` for functions/files, clear type hints where practical.

## Testing Guidelines
- Backend uses `pytest` (`pyproject.toml` points to `tests`).
- Name tests `test_*.py` and place them in `backend/tests/`.
- Prioritize API/data-path coverage for DB query and route behavior changes.
- Frontend currently has no committed test runner; at minimum run lint and perform manual UI + API smoke checks.

## Commit & Pull Request Guidelines
- Existing history uses short subjects (for example `Gas EBBs`, `Genscape Watchlists`); prefer clearer scoped summaries.
- Recommended commit format: `<area>: <imperative summary>` (e.g., `frontend: add watchlist filter chips`).
- PRs should include: purpose, affected paths, env/migration changes, validation steps, and screenshots for UI updates.

## Security & Configuration Tips
- Never commit secrets from `.env`, `frontend/.env.local`, `backend/src/.env`, or `scripts/.env*`.
- Keep credentials in local env files or CI/CD secrets; use placeholders in docs/scripts.

## Agent References
- Contributor preference notes: [`.SKILLS/todo-preferences.md`](./.SKILLS/todo-preferences.md).
