# Plan: Roster Engine Frontend

## Context
The backend exposes ~60 REST endpoints across 7 routers (auth, skills, shifts, staff, profiles, demands, rosters) but has no UI. We're building a production-quality React frontend that drives every endpoint, with the **roster detail grid** as the centerpiece — staff × days with color-coded shift assignments, sticky headers, frozen first column, and live polling while the solver runs.

The frontend will be added as a new `frontend/` service in `docker-compose.dev.yml` running Vite's dev server on port 5173 with hot reload. Work will land on the existing `claude-code` branch as incremental commits per phase.

---

## Stack & Architecture

| Concern | Choice |
|---|---|
| Framework | React 18 + Vite + TypeScript (strict) |
| Server state | TanStack Query v5 (caching, polling, mutations) |
| Routing | React Router v6 |
| Component library | shadcn/ui on Tailwind CSS |
| HTTP | Axios with request/response interceptors |
| API types | `openapi-typescript` from `http://backend:8000/openapi.json` |
| Runtime validation | Zod (only at API boundaries where guarantees matter — e.g. roster result shape) |
| Forms | react-hook-form + Zod resolver |
| Icons | lucide-react |
| Tests | Vitest + React Testing Library |
| Fonts | DM Sans (UI), DM Serif Display (headings), DM Mono (IDs/codes) |

### Folder structure (feature-based)
```
frontend/
├── public/
├── src/
│   ├── api/
│   │   ├── client.ts          # axios instance + interceptors
│   │   ├── schema.gen.ts      # generated from /openapi.json
│   │   └── queryKeys.ts       # TanStack Query key factory
│   ├── features/
│   │   ├── auth/              # login page, useAuth hook, ProtectedRoute
│   │   ├── dashboard/         # summary cards
│   │   ├── rosters/           # list, detail (grid), generate wizard, hooks
│   │   ├── staff/             # list, edit, skills/permitted-shifts, leaves
│   │   ├── profiles/          # list, edit, weights/CC editor
│   │   ├── shifts/            # shift groups + shifts
│   │   ├── skills/            # skill types + values
│   │   ├── demands/           # list + create
│   │   └── users/             # admin user management
│   ├── components/
│   │   ├── ui/                # shadcn primitives (button, input, …)
│   │   ├── layout/            # AppShell, Sidebar, Header, ThemeToggle
│   │   └── shared/            # EmptyState, ConfirmDialog, DataTable, Skeleton
│   ├── hooks/                 # useTheme, useDebounce, useKeyboardShortcut
│   ├── lib/                   # cn(), formatters, time helpers (min↔HH:MM)
│   ├── routes.tsx             # central route table
│   ├── main.tsx               # bootstrap (QueryClient, Router, Theme)
│   └── App.tsx
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── .env.example               # VITE_API_URL=/api
├── Dockerfile.dev
└── README.md
```

### Routing map
```
/login                       (public)
/                            → redirect to /dashboard
/dashboard                   (protected)
/rosters                     list
/rosters/new                 wizard
/rosters/:id                 detail + grid
/staff                       list
/staff/:id                   edit (skills, permitted shifts, leaves)
/staff/groups                groups
/profiles                    list
/profiles/:id                edit (config, staff, shifts)
/shifts                      shifts + groups (tabbed)
/skills                      types + values
/demands                     list + create
/users                       admin user management
```
Layout: persistent left sidebar with feature nav + top header (app name, user menu, theme toggle, optional Cmd+K).

### Theme
Custom Tailwind theme extending shadcn defaults:
- `--primary: 213 67% 33%` (#1B4F8C deep blue)
- `--destructive: 354 76% 56%` (#E63946) — reserved for delete/discard
- Warm grey neutrals (Tailwind `stone` scale) instead of pure black/white
- Light mode default; dark mode via `class` strategy + `next-themes`-style toggle stored in localStorage
- Fonts loaded from Google Fonts in `index.html`, wired through Tailwind theme `fontFamily.sans / serif / mono`

### API client
- Single axios instance reads `import.meta.env.VITE_API_URL` (default `/api`)
- Request interceptor: pulls token from `localStorage` or `sessionStorage` (whichever has it), attaches `Authorization: Bearer …`
- Response interceptor: on 401, clears both storages and triggers a `window.location.assign("/login")` (a simple, reliable global logout)
- All hooks use TanStack Query; mutations invalidate the relevant key from `queryKeys.ts`

### Type generation
- `npm run gen:types` runs `openapi-typescript http://localhost:8000/openapi.json -o src/api/schema.gen.ts`
- Commit the generated file (so CI / fresh clones work without the backend running); regenerate after backend schema changes
- Use `paths` and `components["schemas"]` types throughout — **no `any`, no `@ts-ignore`**

---

## Docker integration

Append to `docker-compose.dev.yml`:
```yaml
frontend:
  build:
    context: ./frontend
    dockerfile: Dockerfile.dev
  ports:
    - "5173:5173"
  volumes:
    - ./frontend:/app
    - /app/node_modules    # avoid host-mount clobbering installed deps
  environment:
    - VITE_API_URL=/api
  depends_on:
    - backend
  command: npm run dev -- --host 0.0.0.0
```

`frontend/Dockerfile.dev`: `FROM node:20-alpine` → set workdir → `COPY package*.json ./` → `npm install` → expose 5173.

`vite.config.ts`: `server.host = '0.0.0.0'`, `server.port = 5173`, `server.proxy['/api'] = 'http://backend:8000'`. Backend's CORS is already configured for `http://localhost:5173` (unchanged).

---

## The centerpiece: roster detail grid

Component: `features/rosters/RosterGrid.tsx`. Layout:
- Header row: dates spanning `roster_start … roster_start + num_days - 1` (sticky top)
- First column: staff `fullname` + `employee_id` (sticky left, frozen via CSS `position: sticky; left: 0`)
- Cells: shift code from `result.assignments[employee_id][day]`, or "—" for unassigned
- Each cell is colored by its shift group (derived from `result.shifts[code].group`). Group → color mapping is generated deterministically from group code (hash → HSL) so colors stay stable
- **Night shifts**: cells with `is_night_shift=true` get a moon icon overlay
- **AL / leave shifts**: cells where `is_work_shift=false` rendered in muted yellow
- **Rest days**: empty cells rendered in light grey
- Per-row trailing column: `staff_max_consec[employee_id]` badge (red if > some threshold)
- Per-column footer: total headcount, total demand (from linked demands), overstaff diff

Interactions:
- Hover cell → tooltip with shift name + start–end time + work_min
- Click cell → side panel with full assignment details for that staff/day
- Grid is read-only (no manual editing; matches the backend's draft → approve flow)

Polling:
- While `status === 'running'`: TanStack Query `refetchInterval: 2000`
- Stop refetching on `draft`, `approved`, `failed`
- Status banner above grid: animated spinner + "Solving… ({elapsed}s)" counter; on `failed` show `result.error` in a destructive alert
- Approve / Discard / Delete actions in a right-aligned action bar; Approve only enabled when `status === 'draft'`

---

## Generate wizard (5 steps)

Component: `features/rosters/GenerateWizard.tsx` with shadcn `Tabs` or a custom stepper:
1. **Profile** — select dropdown of `GET /api/profiles`
2. **Window** — date picker for `roster_start`, number input for `num_days`, number input for `target_work_min` (with helper showing weekly hours)
3. **Demands** — multi-select table of `GET /api/demands?from_date&to_date` (default range = roster window). Search by date + headcount; show date/time/headcount/skill columns
4. **Chain (optional)** — dropdown of recent rosters with usable results (only those where `result?.assignments` exists, i.e. `status` ∈ {draft, approved})
5. **Review** — JSON-like summary card; "Generate" button calls `POST /api/rosters`, captures the returned `id`, and `navigate(`/rosters/${id}`)` where polling kicks in

Step navigation: validate each step before allowing "Next"; "Back" preserves state in form.

---

## Build phases (one commit per phase)

### Phase 1 — Foundation
- Scaffold `frontend/` with Vite + React + TS
- Tailwind + shadcn/ui init, theme tokens, fonts, dark mode
- `frontend/Dockerfile.dev`, `frontend/.env.example`, `frontend/README.md`
- Add `frontend` service to `docker-compose.dev.yml`
- Generate `src/api/schema.gen.ts`
- Update root `README.md` with frontend setup steps
- Verify: `docker compose up frontend` serves a placeholder home page at `http://localhost:5173`

### Phase 2 — Auth + protected routing + app shell
- Axios client with interceptors
- `useAuth` hook (login, logout, token storage with Remember-me)
- `/login` page with form validation
- `ProtectedRoute` wrapper + redirect logic
- `AppShell` (sidebar + header + theme toggle)
- Placeholder pages for every route in the routing map so navigation is wired
- Verify: log in with bootstrapped user, see dashboard placeholder, all nav links navigate, 401 triggers redirect

### Phase 3 — Rosters list + detail (the centerpiece)
- `/rosters` list page: TanStack Table with status/profile/date filters, sortable columns, paginated client-side
- `/rosters/:id` detail page with `RosterGrid`, polling, status banner, approve/discard/delete actions
- Zod schema validating `result` shape; surfaces a friendly error if backend returns something unexpected
- Verify: existing roster in DB renders correctly; create one via API and watch polling transition `running → draft`

### Phase 4 — Generate wizard
- 5-step wizard wired to `POST /api/rosters`
- Demands picker with the listed filters
- Submit → redirect to `/rosters/:id`
- Verify: complete wizard end-to-end on a fresh profile

### Phase 5 — Admin pages
- Dashboard (4 summary cards: staff count, profile count, recent rosters, rosters with `status=running`)
- Staff: list/create/edit, skills, permitted shifts, leaves calendar, soft delete/restore UI
- Profiles: list/create/edit, staff/shift management (with bulk-add-group), weights form, **conditional constraints editor** (table rows with selects for trigger/enforce groups, number inputs for offset/values)
- Shifts: tabbed page with shift groups + shifts CRUD
- Skills: skill types + values CRUD
- Demands: list with filters + create form
- Users: list/create/delete + change-password form
- Verify: every CRUD path round-trips correctly

### Phase 6 — Polish + tests
- Toast notifications on all mutations (shadcn `sonner`)
- Confirm dialogs on delete/discard
- Cmd+K command palette for global search/navigation; Esc closes modals
- Loading skeletons everywhere; empty states with CTAs
- Vitest tests for the highest-value pieces: `RosterGrid` rendering, axios interceptor (401 → redirect), wizard validation, color-mapping helper

---

## Critical files (high-impact)

| Path | Purpose |
|---|---|
| `frontend/vite.config.ts` | Proxy `/api` to `http://backend:8000`, `host: '0.0.0.0'` |
| `frontend/src/api/client.ts` | Axios instance + interceptors (token, 401-handling) |
| `frontend/src/api/schema.gen.ts` | Generated OpenAPI types — single source of truth |
| `frontend/src/features/auth/ProtectedRoute.tsx` | Auth gate |
| `frontend/src/features/rosters/RosterGrid.tsx` | The centerpiece |
| `frontend/src/features/rosters/hooks.ts` | TanStack Query hooks with polling logic |
| `frontend/src/features/rosters/GenerateWizard.tsx` | 5-step form |
| `frontend/src/features/profiles/ConditionalConstraintsEditor.tsx` | JSON-backed structured editor |
| `frontend/src/components/layout/AppShell.tsx` | Sidebar + header layout |
| `frontend/tailwind.config.ts` | Theme tokens + custom colors |
| `docker-compose.dev.yml` | Append `frontend` service |
| `README.md` | Frontend setup section |
| `frontend/README.md` | Folder structure + dev workflow |

---

## Verification

After Phase 1:
```bash
docker compose -f docker-compose.dev.yml up -d
# wait for backend healthy
# visit http://localhost:5173 → placeholder page renders
# visit http://localhost:8000/docs → still works
```

End-to-end smoke test after Phase 6:
1. Bootstrap user via `python -m app.scripts.create_user`
2. Log in via `/login`
3. Create skill type → skill value → staff group → staff (with skill)
4. Create shift group → shift; add to staff's permitted shifts
5. Create profile; add staff + shifts via group bulk-add; set weights
6. Create demands for next week
7. Run Generate wizard → watch grid populate via polling
8. Approve the roster → status changes; grid stays rendered
9. Toggle dark mode; verify all pages remain legible
10. Force a 401 (delete token from localStorage devtools, refresh) → redirected to `/login`

Run unit tests:
```bash
docker compose exec frontend npm test
```
