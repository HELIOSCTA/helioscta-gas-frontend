# Repository Guidelines

## Project Structure & Module Organization
- `frontend/`: Next.js 15 + TypeScript app. Main UI code is in `app/`, reusable UI in `components/`, and shared utilities in `lib/`.
- `frontend/app/api/**/route.ts`: App Router API handlers used by the UI.
- `docker-compose.yml`: Local Docker orchestration (frontend only).

## Build, Test, and Development Commands
- `docker compose up --build`: Run frontend in Docker (`:2222`).
- `cd frontend && npm install`: Install frontend dependencies.
- `cd frontend && npm run dev`: Start Next.js dev server.
- `cd frontend && npm run build && npm run start`: Build and run production frontend.
- `cd frontend && npm run lint` / `npm run lint:fix`: Lint and auto-fix frontend code.

## Coding Style & Naming Conventions
- Frontend: follow ESLint config (`next/core-web-vitals`, `next/typescript`) and strict TypeScript settings.
- Use 2-space indentation and keep React components in `PascalCase` (e.g., `CashBalmoTable.tsx`).
- Keep route handlers named `route.ts` inside feature folders under `frontend/app/api/`.


## Testing Guidelines
- Frontend currently has no committed test runner; at minimum run lint and perform manual UI + API smoke checks.

## Commit & Pull Request Guidelines
- Existing history uses short subjects (for example `Gas EBBs`, `Genscape Watchlists`); prefer clearer scoped summaries.
- Recommended commit format: `<area>: <imperative summary>` (e.g., `frontend: add watchlist filter chips`).
- PRs should include: purpose, affected paths, env/migration changes, validation steps, and screenshots for UI updates.

## Security & Configuration Tips
- Never commit secrets from `.env` or `frontend/.env.local`.
- Keep credentials in local env files or CI/CD secrets; use placeholders in docs/scripts.

## Agent References
- Contributor preference notes: [`.SKILLS/todo-preferences.md`](./.SKILLS/todo-preferences.md).
- Frontend theme/style preferences: [`.SKILLS/frontend-styling.md`](./.SKILLS/frontend-styling.md).
