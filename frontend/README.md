# Roster Engine Frontend

React 18 + Vite + TypeScript app for the Roster Engine scheduling backend.

## Running

The frontend is wired into the project's `docker-compose.dev.yml`. From the repo root:

```bash
docker compose -f docker-compose.dev.yml up -d frontend
```

Then open http://localhost:5173. Hot reload is on; edits under `frontend/src/` reload instantly.

To run outside Docker:

```bash
cd frontend
npm install
VITE_PROXY_TARGET=http://localhost:8000 npm run dev
```

## Stack

- **Vite** dev server + build
- **React 18** + TypeScript (strict mode, no `any`)
- **TanStack Query v5** — server state, caching, polling, mutations
- **React Router v6** — routing
- **shadcn/ui** on **Tailwind CSS** — components and design system
- **Axios** — HTTP client with auth + 401 interceptors
- **Zod** — runtime validation at API boundaries
- **react-hook-form** + Zod resolver — forms
- **Vitest** + Testing Library — tests
- **openapi-typescript** — generate types from the backend's `/openapi.json`

## Folder structure

```
src/
  api/            axios client, generated OpenAPI types, query key factory
  features/       feature-based folders (auth, rosters, staff, profiles, …)
  components/
    ui/           shadcn primitives
    layout/       AppShell, Sidebar, Header, ThemeToggle
    shared/       reusable EmptyState, ConfirmDialog, etc.
  hooks/          small reusable hooks (useTheme, useDebounce, …)
  lib/            cn(), formatters, time helpers
  routes.tsx      central route table
  main.tsx        bootstrap
```

## Theming

- Light mode by default, dark mode via a header toggle stored in localStorage
- Primary: deep blue `#1B4F8C` (HSL `213 67% 33%`)
- Destructive: red `#E63946` — reserved for delete/discard only
- Warm neutral palette (stone-based) instead of pure black/white
- Fonts: **DM Sans** for UI, **DM Serif Display** for major headings, **DM Mono** for IDs / timestamps / shift codes

## API types

Types live in `src/api/schema.gen.ts` and are generated from the running backend:

```bash
# from inside the running frontend container (or with the backend reachable at :8000):
npm run gen:types
```

Commit the regenerated file when the backend schema changes.

## Tests

```bash
npm test           # watch mode
npm run test:run   # CI mode
```

## Environment

Set in `frontend/.env` (gitignored). See `.env.example`:

```
VITE_API_URL=/api
```

The Vite dev server proxies `/api` → `http://backend:8000` inside docker-compose. Outside Docker, set `VITE_PROXY_TARGET=http://localhost:8000` when launching.
