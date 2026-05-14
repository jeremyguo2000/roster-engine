# Frontend Build Progress

Companion to [`PLAN.md`](PLAN.md). Tracks what has shipped, where we are now, and what comes next. Updated end-of-Phase 5.

---

## Approach

We're building a production-quality React frontend that drives every backend endpoint, with the **roster detail grid** (staff × days, color-coded, sticky headers, frozen first column, live polling) as the centerpiece.

The work happens **incrementally**, one commit per phase, all on the existing `claude-code` branch (already shipped to GitHub). Each phase is independently verifiable end-to-end before moving on — when a phase is committed, the app still runs and demonstrates that phase's deliverable.

**Stack:** React 18 + Vite + TypeScript (strict) · TanStack Query v5 · React Router v6 · shadcn/ui on Tailwind · Axios · Zod · react-hook-form · Vitest. Types are generated from the backend's `/openapi.json` via `openapi-typescript` and committed (`src/api/schema.gen.ts` — 3285 lines).

**Folder shape (feature-based):**

```
frontend/src/
  api/           axios client, generated types, query key factory
  features/      auth, dashboard, rosters, staff, profiles, shifts, skills, demands, users
  components/
    ui/          shadcn primitives
    layout/      AppShell, Sidebar, Header, ThemeToggle, UserMenu, ThemeProvider
    shared/      PageHeader, ComingSoon (more later)
  lib/           cn(), time helpers
  routes.tsx     central route table
  main.tsx       bootstrap
```

**Docker integration:** the frontend runs as a `frontend` service in `docker-compose.dev.yml` on port 5173 with hot reload. Vite proxies `/api` → `http://backend:8000`. The Dockerfile runs as the host user (USER_ID/GROUP_ID build args) so files generated inside the container (like `schema.gen.ts`) keep host ownership.

**Theme:** light by default with localStorage-persisted dark mode toggle. Custom Tailwind tokens — deep blue primary (`#1B4F8C`), red destructive reserved for delete/discard only (`#E63946`), warm stone-based neutrals, DM Sans / DM Serif Display / DM Mono fonts from Google Fonts.

---

## Phase status

| Phase | Description | Status |
|---|---|---|
| 1 | Foundation: scaffold, Tailwind/shadcn, theme, fonts, Docker, OpenAPI types | **Shipped** — commit `3bf54b3` |
| 2 | Auth, ProtectedRoute, app shell with sidebar/header, placeholder pages, route table | **Shipped** — commit `ecba583` |
| 3 | Rosters list + detail with grid + polling (centerpiece) | **Shipped** |
| 4 | 5-step generate wizard | **Shipped** |
| 5 | Admin pages (dashboard cards, staff, profiles + CC editor, shifts, skills, demands, users) | **Shipped** |
| 6 | Polish (toasts, confirm modals, Cmd+K, skeletons, Vitest tests) | Pending |

---

## Phase 1 — Foundation (shipped, `3bf54b3`)

Scaffolded the entire frontend infrastructure so subsequent phases never have to retool the foundation.

**Delivered:**
- `frontend/package.json` with React 18, TanStack Query, React Router, Axios, Zod, react-hook-form, all Radix primitives, lucide-react, sonner, next-themes, openapi-typescript, Vitest. All versions pinned.
- `tsconfig.json` (strict, `@/*` path alias) + `tsconfig.node.json` (composite, for `vite.config.ts`)
- `vite.config.ts` — `host: 0.0.0.0`, proxy `/api` → `http://backend:8000` (overridable via `VITE_PROXY_TARGET`), Vitest config inline with `/// <reference types="vitest" />`
- `tailwind.config.ts` — extended theme with HSL CSS variables, custom font families, animation plugin
- `postcss.config.js`, `.env.example`, `.gitignore` (later amended to exclude `*.tsbuildinfo`, `vite.config.js`, `vite.config.d.ts`)
- `index.html` with Google Fonts preconnect for DM Sans / DM Serif Display / DM Mono
- `src/index.css` — light + dark mode CSS variable palettes (deep blue primary, warm stone neutrals, red destructive)
- `src/main.tsx` — bootstrap (QueryClient with 30s staleTime, BrowserRouter, ThemeProvider)
- `src/App.tsx` — initial placeholder page (later replaced in Phase 2)
- `src/lib/utils.ts` — `cn()` helper, `minToTime()`, `minToDuration()`
- `src/components/layout/ThemeProvider.tsx` + `ThemeToggle.tsx` (next-themes, localStorage key `roster-engine-theme`)
- `src/components/ui/button.tsx` — first shadcn primitive (default, destructive, outline, secondary, ghost, link variants)
- `src/test/setup.ts` — `@testing-library/jest-dom`
- `src/api/schema.gen.ts` — generated from `http://backend:8000/openapi.json` (3285 lines)
- `frontend/Dockerfile.dev` — `FROM node:20-alpine`, `npm install`, expose 5173
- `frontend/README.md` — stack, folder structure, dev workflow
- `frontend` service added to `docker-compose.dev.yml`
- Root `README.md` updated with frontend setup section and service table

**Notable decisions / fixes during the phase:**
- The `.env` file is at the project root (not `backend/`) — conftest had the same trap earlier; here we ensured Vite reads its own `frontend/.env` separately and the project root `.env` is for `docker-compose` substitution only.
- `npm run gen:types` originally used `http://localhost:8000` which fails from inside a container (resolves to the container itself). Changed to `${OPENAPI_URL:-http://backend:8000}/openapi.json` so it works in Docker by default and supports local override.
- `tsc -b --noEmit` errors when used with composite project references. Changed `lint` to `tsc -b` (main `tsconfig.json` already has `noEmit: true`).
- Initially committed `*.tsbuildinfo`, `vite.config.js`, `vite.config.d.ts` as build artifacts; amended the commit to gitignore them.

**Verification at end of phase:**
- `curl http://localhost:5173/` → HTTP 200 with Vite HMR HTML
- `curl http://localhost:8000/api/health` → HTTP 200 (backend untouched)
- `npm run lint` → clean

---

## Phase 2 — Auth + protected routing + app shell (shipped, `ecba583`)

After this commit, a user can sign in, get a JWT, navigate every route via the sidebar, and is automatically kicked back to `/login` on any 401 — even though most pages still show a placeholder.

**Delivered:**

**API layer:**
- `src/api/client.ts` — axios instance with:
  - `readToken()` / `writeToken(remember)` / `clearToken()` (localStorage if remember=true, sessionStorage otherwise)
  - Request interceptor that attaches `Authorization: Bearer …`
  - Response interceptor: on 401, clears both storages and triggers a registered handler
  - `setUnauthorizedHandler()` — wired in `App.tsx` to navigate to `/login`
  - `getApiErrorMessage()` — pulls the `detail` string from FastAPI error responses (handles both string and Pydantic validation list shapes)
- `src/api/queryKeys.ts` — centralised key factory for every endpoint group (`queryKeys.auth.me`, `queryKeys.rosters.detail(id)`, etc.)

**Auth feature:**
- `src/features/auth/useAuth.ts` — `useCurrentUser`, `useLogin`, `useLogout`, `isAuthenticated()`. Login on success caches token, invalidates `/me`, navigates to `/dashboard`. Logout clears token + entire query cache.
- `src/features/auth/ProtectedRoute.tsx` — `<Outlet />` guard; redirects to `/login` with `state.from` preserved
- `src/features/auth/LoginPage.tsx` — centred card with username/password/Remember-me, inline validation, loading state, FastAPI error surface. Redirects authenticated visitors to `/dashboard`.

**App shell:**
- `src/components/layout/Sidebar.tsx` — 8 NavLinks with active highlight (Dashboard, Rosters, Staff, Profiles, Shifts, Skills, Demands, Users)
- `src/components/layout/Header.tsx` — top bar with ThemeToggle + UserMenu
- `src/components/layout/UserMenu.tsx` — DropdownMenu with current user info + sign out
- `src/components/layout/AppShell.tsx` — flex layout, Outlet for nested routes
- `src/components/shared/PageHeader.tsx` — consistent page title + description + actions slot
- `src/components/shared/ComingSoon.tsx` — placeholder card for routes still being built

**More shadcn primitives:** `input.tsx`, `label.tsx`, `card.tsx`, `separator.tsx`, `dropdown-menu.tsx`

**Routing:**
- `src/routes.tsx` — single `<Routes>` tree, `/login` public, everything else nested under `<ProtectedRoute>` → `<AppShell>`. Index redirects to `/dashboard`, catch-all redirects to `/`.
- `src/App.tsx` rewritten to use the route table and wire `setUnauthorizedHandler`.

**Placeholder pages** for every route in the plan (Dashboard, RostersList, RosterDetail, GenerateRoster, StaffList, StaffDetail, StaffGroups, ProfilesList, ProfileDetail, Shifts, Skills, Demands, Users). Each shows a `PageHeader` + `ComingSoon` card.

**Dockerfile.dev** updated to run as host user (USER_ID/GROUP_ID build args) so files written by the container (e.g. regenerating `schema.gen.ts`) keep host ownership.

**Notable issues encountered:**
- `lucide-react` doesn't export `ShieldUser` — replaced with `UserCog` in `Sidebar.tsx`.
- The Docker container ran as root in Phase 1, so `npm run gen:types` created `src/api/` owned by root. Required `sudo chown -R` once before writing new files into `src/api/`. Fixed for the future by adding USER_ID/GROUP_ID args to `Dockerfile.dev`.

**Verification at end of phase:**
- `curl -X POST http://localhost:5173/api/auth/login` (with bad password) → returns FastAPI `{"detail":"Invalid username or password."}` with HTTP 401 — confirms Vite `/api` proxy AND auth chain work end-to-end
- `npm run lint` → clean

---

## Phase 3 — Rosters list + detail (shipped)

The centerpiece is live. The list page filters and sorts client-side; the detail page renders the staff × days grid with live polling while the solver runs.

**Delivered in this phase:**

shadcn primitives (carried over from the mid-phase pause, now wired up):
- `src/components/ui/badge.tsx` · `tooltip.tsx` · `alert.tsx` · `select.tsx` · `table.tsx` · `skeleton.tsx` · `alert-dialog.tsx`

Roster feature code:
- `src/features/rosters/hooks.ts` — TanStack Query hooks: `useRosters(filters)`, `useRoster(id)` with `refetchInterval: 2000` while `status === 'running'` (returns `false` otherwise to stop polling), `useRosterDemands(id)`, `useProfiles()` for the filter dropdown, plus mutations `useApproveRoster`, `useDiscardRoster`, `useDeleteRoster`, `useCreateRoster` (last one anticipating Phase 4)
- `src/features/rosters/rosterResult.ts` — Zod schemas (`rosterResultSchema`, `rosterErrorResultSchema`) and a `parseRosterResult()` helper that returns a discriminated union (`{kind:'ok'|'error'|'invalid'}`). Mirrors the JSON shape produced by `_result_to_json()` in `backend/app/worker/tasks.py`
- `src/features/rosters/groupColors.ts` — FNV-1a hash → curated 12-hue palette → `{bg, fg, border}` HSL strings, dark-mode aware. Avoids the destructive red band reserved for delete/discard
- `src/features/rosters/statusBadge.tsx` — small `RosterStatusBadge` mapping each `RosterStatus` to a `Badge` variant
- `src/features/rosters/RostersListPage.tsx` — real implementation: status / profile selects + name search, sortable columns (name / status / profile / start / days), 20-per-page client-side pagination, click-row → navigate to detail, `Plus` "Generate roster" button linking to `/rosters/new`
- `src/features/rosters/RosterGrid.tsx` — staff × days table with `border-separate`/`border-spacing-0`, **sticky top header** (`sticky top-0 z-20`), **frozen left staff column** (`sticky left-0 z-10`, with the corner cell at `z-30`), color-coded cells driven by `groupColor()`, moon icon overlay on night shifts, amber styling for non-work shifts (leave), rest-day em-dash, weekend column tinting, per-row `Max consec` badge (turns destructive at threshold), per-day footer row with headcount / max demand / signed diff colour
- `src/features/rosters/RosterDetailPage.tsx` — real implementation: PageHeader with status badge + window summary, Approve (only on `draft`), Discard (everything except `approved`) and Delete actions each behind their own `AlertDialog` confirm, mutation-error banner, "Solving… ({elapsed}s)" `Loader2` info banner that ticks every second while running, destructive banner showing `result.error` on `failed`, warning banner if Zod parsing fails

Other small touches:
- `src/components/shared/PageHeader.tsx` — widened `description` from `string` to `ReactNode` so the detail page can embed the status badge inline

**Notable decisions during the phase:**
- Polling lives entirely in `useRoster`'s `refetchInterval` callback; no manual `setInterval` is needed for refetching. The elapsed-seconds counter on the detail page is a separate `setInterval` driven by `roster.status === 'running'`.
- Headcount footer aggregates only `is_work_shift=true` assignments (matches what demand counts compare against).
- The grid stays read-only as called for in PLAN.md — no manual editing.
- Generated `RosterOut.result` is typed as `Record<string, never> | null` by openapi-typescript (because the backend declares it as `dict | None`); we cast through `unknown` via `parseRosterResult()` rather than fighting the type.

**Verification at end of phase:**
- `docker compose -f docker-compose.dev.yml exec frontend npm run lint` → clean
- `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/rosters` → `200`
- HMR cycled the new files without errors in the Vite logs

---

## Current state of the working tree

- Branch: `claude-code` (Phases 1 + 2 already pushed; Phase 3 commit lands locally next)
- Frontend container is up and serving at http://localhost:5173 with hot reload
- Backend, postgres, redis, celery_worker all running and healthy
- DB has an `admin` user

---

## Phase 4 — Generate wizard (shipped)

A 5-step stepper that drives `POST /api/rosters` and redirects into the detail page so polling kicks in immediately.

**Delivered:**

- `src/features/demands/hooks.ts` — `useDemands({ from, to, skillValueId })` hitting `GET /api/demands` (only fires when both `from` and `to` are present).
- `src/components/ui/checkbox.tsx` — shadcn checkbox primitive (the only new UI primitive Phase 4 needed).
- `src/features/rosters/GenerateWizard.tsx` — single-component wizard with internal step state and validation:
  1. **Profile** — `Select` populated from `useProfiles()`. Empty/error states surface inline.
  2. **Window** — name, start date (`<Input type="date" />`), days, target work minutes, with a live "≈ Nh over D days" helper.
  3. **Demands** — table of demands in the derived window (`from = roster_start`, `to = roster_start + num_days - 1`), checkbox-per-row, search filter on date/headcount, "Select all / Clear all" toggle, count badge.
  4. **Chain** — Select dropdown of recent rosters with usable results (`status ∈ {draft, approved}` AND `result != null`), filtered to the chosen profile; clears itself if you hop back to step 1 and pick a different profile.
  5. **Review** — definition list summary plus an info banner. The Generate button calls `useCreateRoster()` and on success navigates to `/rosters/{id}` where the polling hook from Phase 3 takes over.
- `src/features/rosters/GenerateRosterPage.tsx` — replaced the placeholder; renders `<GenerateWizard />` plus a back-to-rosters action.

**Notable details / decisions:**
- Validation is per-step via a `stepValid` map; the **Next** button is disabled until the current step is valid. Steps 3 (demands) and 4 (chain) are optional — backend treats `demand_ids: []` as no demand constraint and `previous_roster_id: null` as no chaining.
- Wizard state lives in a single `useState<WizardState>`; demand IDs are a `Set<number>` for O(1) toggle. Resetting on success is unnecessary since we navigate away.
- Chain candidates are filtered to the chosen profile because chaining across profiles rarely makes sense (different staff/shift universes); we cap at the 20 most recent.
- Date input uses the native HTML `<Input type="date" />`. shadcn's Calendar / Popover combo would be overkill here and adds three more primitives just for this one field.
- The `useCreateRoster` mutation already invalidates the rosters list query and seeds the detail cache, so the destination page renders immediately.

**Notable issues encountered:**
- Adding `@radix-ui/react-checkbox` triggered Vite's dep optimizer, which couldn't write to `/app/node_modules/.vite/` because that directory was created in Phase 1 when the container ran as root. Fixed once with `docker compose exec -u root frontend chown -R appuser:appuser /app/node_modules/.vite` and a frontend restart. Subsequent dep additions should "just work" now.

**Verification at end of phase:**
- `docker compose -f docker-compose.dev.yml exec frontend npm run lint` → clean
- Vite logs show all radix deps re-optimized cleanly (`✨ new dependencies optimized: ... @radix-ui/react-checkbox ...`)
- `curl http://localhost:5173/rosters/new` → `200`

---

---

## Phase 5 — Admin pages (shipped)

Every CRUD path the backend exposes now has a working UI. Each page invalidates the right TanStack Query keys so changes propagate without manual refresh.

**New shadcn primitives:** `dialog`, `tabs`, `switch`, `textarea` (in addition to the 8 already present).

**New shared components:**
- `components/shared/EmptyState.tsx` — icon + title + description + action card for empty lists.
- `components/shared/ConfirmDialog.tsx` — `AlertDialog` wrapper that takes a `trigger`, applies destructive styling on demand.
- `components/shared/MutationError.tsx` — destructive `Alert` that renders `getApiErrorMessage(err)` when truthy; collapses to nothing otherwise.

**Feature hooks (one `hooks.ts` per feature):**
- `features/skills/hooks.ts` — types CRUD + value add/delete.
- `features/shifts/hooks.ts` — shifts + groups CRUD.
- `features/staff/hooks.ts` — staff CRUD + soft-delete/restore + groups + skills + permitted shifts + leaves.
- `features/profiles/hooks.ts` — profile CRUD + staff/shift add+remove + bulk-add-group + excluded toggle.
- `features/users/hooks.ts` — users list/create/delete + change password.
- `features/demands/hooks.ts` — already had `useDemands`; added `useCreateDemand`.

**Pages:**
- **Dashboard** (`features/dashboard/DashboardPage.tsx`) — 4 summary cards (active staff, profiles, total rosters, currently solving) + recent rosters list. Each card links to its section.
- **Skills** (`features/skills/SkillsPage.tsx`) — one card per skill type; values rendered as badges with inline delete. Create/edit dialogs for the type, inline form for adding values.
- **Shifts** (`features/shifts/ShiftsPage.tsx`) — `Tabs` with **Shifts** + **Groups**. Shift dialog has all fields with live HH:MM helpers; group dialog uses `Switch` for `is_work_shift` and `is_night_shift`.
- **Demands** (`features/demands/DemandsPage.tsx`) — date-range + skill-value filters; create dialog with start/end-min inputs (live HH:MM helpers).
- **Staff list** (`features/staff/StaffListPage.tsx`) — group filter, name search, "Include deleted" toggle, soft-delete and restore actions.
- **Staff groups** (`features/staff/StaffGroupsPage.tsx`) — minimal CRUD.
- **Staff detail** (`features/staff/StaffDetailPage.tsx`) — top profile card with inline edit (Edit / Cancel / Save), then **Tabs** for Skills (badge picker), Permitted shifts (badge picker), Leaves (inline form + table).
- **Profiles list** (`features/profiles/ProfilesListPage.tsx`) — minimal table with create + delete.
- **Profile detail** (`features/profiles/ProfileDetailPage.tsx`) — **Tabs** for Staff / Shifts / Config.
  - Staff tab: pick-and-add + bulk-add-group, table with `Switch` for excluded flag, remove with confirm.
  - Shifts tab: same shape, no excluded flag.
  - Config tab: 6 weight/time-limit number inputs + the **Conditional Constraints editor** (`ConditionalConstraintsEditor.tsx`). Edits stay local until "Save config" — dirty banner included.
- **Users** (`features/users/UsersPage.tsx`) — list with "you" badge on the current user, delete (disabled on self), create dialog (≥3 char username, ≥6 char password), change-password dialog with confirm field and inline success.

**Conditional constraints model** (`features/profiles/profileConfig.ts`): a Zod schema for `Profile.config` (weights + `conditional_constraints[]`). `parseProfileConfig()` is forgiving — unknown keys are dropped, missing ones default. The editor renders one row per constraint with selects for trigger/enforce groups (enforce supports the `*` wildcard) and number inputs for the offset and values.

**Notable decisions / details:**
- All mutations use TanStack Query with focused invalidations (e.g. `queryKeys.staff.skills(id)` only). No global `invalidateAll`.
- Forms are plain `useState` — react-hook-form would be overkill for these shapes. Validation is simple "field non-empty / number ≥ 0" client-side.
- Toasts are not yet wired (Phase 6 territory). Error surfaces use the shared `MutationError` banner, success is silent (the data updates).
- The Profile config tab's `useEffect` reseeds local state when the upstream `initial` config changes (with `JSON.stringify` in deps + `eslint-disable-next-line` on the comparison) so a refetch overwrites uncommitted local edits — acceptable for this phase, will revisit if it bites.
- One Vite-cache permission tweak again before the lint pass: `chown -R appuser:appuser /app/node_modules/.vite` so the optimizer could write the new radix deps (`react-dialog`, `react-tabs`, `react-switch`).

**Verification at end of phase:**
- `npm run lint` → clean.
- All 10 routes (`/dashboard`, `/staff`, `/staff/groups`, `/profiles`, `/shifts`, `/skills`, `/demands`, `/users`, `/rosters`, `/rosters/new`) return HTTP 200.
- Vite log: `✨ new dependencies optimized: @radix-ui/react-switch, @radix-ui/react-tabs, @radix-ui/react-dialog`.

---

**Up next: Phase 6** — polish (toasts via sonner, Cmd+K command palette, broader skeletons, Vitest coverage on the highest-value pieces — `RosterGrid`, axios 401 interceptor, wizard validation, color-mapping helper).

---

## Verification commands

```bash
# Check services
docker compose -f docker-compose.dev.yml ps

# Type-check the frontend
docker compose -f docker-compose.dev.yml exec frontend npm run lint

# Regenerate OpenAPI types (after backend schema changes)
docker compose -f docker-compose.dev.yml exec frontend npm run gen:types

# Watch frontend logs
docker compose -f docker-compose.dev.yml logs -f frontend
```

Smoke-test login through the Vite proxy (returns FastAPI's detail string on 401):

```bash
curl -s -X POST http://localhost:5173/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"wrongpass"}'
```
