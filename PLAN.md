# Build a Web Frontend at `frontend/` with Full Parity to the Old Flask App

## Progress Tracker

| # | Step | Status |
|---|---|---|
| 1 | Scaffold (package.json, tsconfig, index.html, design tokens, App skeleton) | ✅ Done |
| 2 | Auth + API client + Login page | ✅ Done |
| 3 | API modules + shared UI (Modal, Toast, Nav badge) | ✅ Done |
| 4 | Shifts page | ✅ Done |
| 5 | Staff page | ✅ Done |
| 6 | Profiles page | ✅ Done |
| 7 | Generate wizard | ✅ Done |
| 8 | Rosters page (list + RosterGrid + RosterSummary) | ✅ Done |
| 9 | Calendar + Day/Range timetable modals | ✅ Done |
| 10 | Tests + end-to-end smoke verification | ⏳ Next |

### Step 1 — Done
- `package.json` declares React 18, react-router-dom v6, @tanstack/react-query v5, axios, vitest + @testing-library
- `tsconfig.json` (strict, single config — no project references)
- `index.html` loads Inter / Source Serif 4 / JetBrains Mono from Google Fonts
- `.env.development` sets `VITE_PROXY_TARGET=http://localhost:8000` for local-only dev (Docker setups still work via the existing fallback in `vite.config.js`)
- `src/styles/global.css` carries all design tokens (palette, type scale, spacing, badges, buttons, modal/toast scaffolding)
- `src/main.tsx` wires `BrowserRouter` + `QueryClientProvider`
- `src/App.tsx` routes `/login`, `/rosters`, `/shifts`, `/staff`, `/profiles`, `/generate` with a top `Nav`
- Placeholder pages compile; `npm run build` produces zero TS errors and the dev server boots at `:5173`

### Step 2 — Done
- `src/api/client.ts` — axios instance at `baseURL: /api`, request interceptor injects `Authorization: Bearer <token>` from `localStorage`, response interceptor clears token + fires `on401` redirect, `errorMessage()` helper unpacks FastAPI `detail` strings (incl. validation arrays)
- `src/api/auth.ts` — typed wrappers for `POST /auth/login`, `GET /auth/me`, `POST /auth/change-password`
- `src/auth/AuthContext.tsx` — `AuthProvider` hydrates the user via `/auth/me` on mount when a token exists, exposes `login(username, password)` and `logout()`, wires the 401 redirect via `setOn401`
- `src/auth/RequireAuth.tsx` — route guard that redirects unauthenticated users to `/login` and preserves the intended URL in `location.state.from`
- `src/pages/LoginPage.tsx` — form, error inline alert, redirect-to-`from` on success
- `App.tsx` — wraps the tree in `<AuthProvider>` and guards `/rosters`, `/shifts`, `/staff`, `/profiles`, `/generate`
- `Nav.tsx` — shows username + "Sign out" button when authenticated; hides tabs on the login screen
- `vite.config.js` — switched to `loadEnv()` so `.env.development`'s `VITE_PROXY_TARGET` is honoured (previously `process.env` wasn't populated in the config context)

Verified end-to-end via Playwright: bad credentials surface the backend's `detail` string ("Invalid username or password."), and visiting `/rosters` while logged out redirects to `/login`.

### Step 3 — Done
- Typed API modules mirroring backend routers and schemas:
  - `src/api/shifts.ts` — shift groups + shifts CRUD
  - `src/api/staff.ts` — staff groups, staff, skills, permitted-shifts, leaves
  - `src/api/skills.ts` — skill types + values
  - `src/api/profiles.ts` — profiles, profile-staff (incl. bulk add-group), profile-shifts (incl. bulk add-group), `ProfileConfig` typed with solver weights + conditional-constraint shape
  - `src/api/demands.ts` — demand list/get/create
  - `src/api/rosters.ts` — list/get/create/approve/discard/delete, demands preview, leaves preview, plus a `RosterResult` shape that mirrors `_result_to_json`
- Shared UI:
  - `components/Modal.tsx` — keyboard `Escape` close, click-overlay close, `size` prop for `md` / `wide-md` / `wide`
  - `components/Toast.tsx` — `ToastProvider` + `useToast()` hook with `info` / `success` / `error` tones, auto-dismiss timer, sticky option (duration 0)
- Polling + nav badge:
  - `hooks/useRunningRosters.ts` — React Query poll of `GET /api/rosters?status=running` every 3 s while authenticated
  - `components/RosterJobWatcher.tsx` — diff-watches the running set, re-fetches each transitioned roster to learn its final status + name, toasts `${name} saved as draft ✓` / `Solver failed for ${name}`, invalidates the rosters cache
  - `Nav.tsx` — renders the spinner + "Solving…" pill in the right side of the nav when one or more rosters are running (uses the warm primary-soft tint from the design tokens)
- `App.tsx` — wrapped in `ToastProvider`, `RosterJobWatcher` mounted once

Build still passes (`npm run build` produces zero TS errors); the running poll is gated on `useAuth().user` so it doesn't fire on the login screen.

### Step 4 — Done
- `lib/time.ts` — `minToHHMM` / `hhmmToMin` / `durationMin` helpers (overnight-aware: end ≤ start adds 1440)
- `pages/ShiftsPage.tsx` — one card per shift group with:
  - WORK / NIGHT / NON-WORK badges driven by `is_work_shift` and `is_night_shift`
  - per-group `+ Shift` and `Delete` buttons (with `confirm()` on Delete)
  - tables of shifts showing code, name, start/end (with `+1d` annotation when `end_min <= start_min`), work hours (decimal), break minutes, plus per-row Edit / ✕
- Modals:
  - **Add Shift Group** — code + work/night checkboxes
  - **Add Shift / Edit Shift** (one component, two modes) — code, name, start/end as `HH:MM`, work hours (decimal), break minutes; live duration preview + "Overnight shift" hint when end ≤ start
- All mutations go through React Query with `invalidateQueries({ queryKey: ["shifts"] })` and toast feedback (success or backend `detail` string on error)

Verified end-to-end via Playwright against the live backend: DSG / ESG / Leaves / NSG groups render, overnight annotations show, and the Add Group modal opens with the correct styling.

### Step 5 — Done
- `pages/StaffPage.tsx`:
  - Filter bar: staff group dropdown + "Show deleted" toggle
  - Main staff table with employee_id, name, group, Active/Archived badge, and per-row Edit / Skills / Permitted / Archive (or Restore)
  - Three secondary buttons in the header: **Skill types** (manage `SkillType` + `SkillValue` CRUD), **Staff groups** (inline rename + delete), **+ Add Staff**
  - **Leaves** section at the bottom: staff/date-range filter, Add Leave modal, table with remove
- `components/staff/StaffSkillsModal.tsx` — pill view of current skills with ✕ to remove; below, each skill type's values render as toggle buttons (primary-blue when assigned)
- `components/staff/PermittedShiftsModal.tsx` — per-group cards with All/None bulk toggles, per-shift checkbox/pill toggles, banner explaining restricted vs unrestricted mode
- Builds cleanly; verified against the live backend showing 10 Ward A staff + one existing AL leave on 2026-05-07; Permitted Shifts modal renders shift groups with checked/unchecked states.

### Step 6 — Done
- `pages/ProfilesPage.tsx` — list of profile cards (name + one-line summary of `time_limit`, key weights, rule count) with Edit / Delete actions; `+ New Profile` opens a small "name only" create modal that, on success, immediately opens the edit modal so the user can fill in the rest.
- Edit modal with five tabs:
  - **Basics** — rename (PATCH `/profiles/{id}` `{name}`)
  - **Shifts** (`components/profiles/ProfileShiftsTab.tsx`) — per-group cards listing shift codes as toggle buttons; "+ Bulk add" uses `POST /profiles/{id}/shifts/add-group/{group_id}`
  - **Staff** (`components/profiles/ProfileStaffTab.tsx`) — per-group tables with Add / Exclude / Re-include / Remove; "+ Bulk add" uses the staff-group bulk endpoint
  - **Solver** (`components/profiles/ProfileSolverTab.tsx`) — typed inputs for `weight_overstaff`, `weight_consec`, `weight_burden`, `weight_night`, `weight_weekend`, `time_limit`; dirty-tracking with a Save button that toggles its own label
  - **Rules** (`components/profiles/ProfileRulesTab.tsx`) — dynamic list of `{trigger, trigger_val, offset, enforce, enforce_val}` rows with `*` wildcard option, add/remove, batch Save; renders an example in the help text
- Tab active state uses the primary-blue button styling for clear feedback; modal is `size="wide"` (1200px) so the tables breathe.
- Build passes; live-tested against the seed "Ward A Weekly" profile (3 rules, weights pre-set).

### Step 7 — Done
- `pages/GeneratePage.tsx` — single-page 5-section wizard:
  1. **Profile & name** — dropdown of profiles + roster-name input
  2. **Date range & target hours** — `roster_start`, `num_days`, target hours per staff (converted to `target_work_min = hours × 60`), plus a "Chain from previous roster" dropdown of draft/approved rosters
  3. **Leaves preview** — auto-queries `GET /api/staff/leaves?from_date=&to_date=` over the chosen window, read-only table (or empty-state if none)
  4. **Demands** — one card per date in the window, each showing per-row `{start HH:MM, end HH:MM, headcount, skill}` editors with add/remove; "Copy day 1 to all days" shortcut duplicates the first day's demand list
  5. **Generate** — footer summary ("N demands across M days") + primary "Run Solver" button (disabled until profile + name + ≥ 1 demand are valid)
- Submit flow: POSTs every demand → collects IDs → POSTs `/api/rosters` with `{profile_id, name, roster_start, num_days, target_work_min, demand_ids, previous_roster_id?}` → toasts + navigates to `/rosters`
- React Query handles the leaves-preview refetch when the date window changes; the existing `RosterJobWatcher` picks up the new running roster and drives the nav badge + completion toast — no extra plumbing needed here.
- Live-rendered with the "Ward A Weekly" profile and the May 15 start; empty-state copy and disabled CTA copy both render as designed.

### Step 8 — Done
- **Corrected `RosterResult` typing** to match what the backend actually emits (the plan's earlier guess was wrong):
  - `staff: Array<{fullname, employee_id}>` (not `string[]`)
  - `assignments: Record<employee_id, Record<dayIdxString, shiftCode>>` (sparse — unassigned days are absent)
  - `staff_max_consec: Record<employee_id, number>` plus `consec_days` per day
  - `RosterShiftInfo` drops the spurious `code` (it's the map key) and adds optional `is_work_shift` / `is_night_shift`
- `lib/colours.ts` — single source of truth for the group colour palette (DSG / ESG / NSG / Off / Leaves)
- `components/RosterGrid.tsx` — staff × days table with:
  - Sticky-left Staff column showing fullname + employee_id underneath
  - Sticky weekday + DD/MM headers, weekends tinted with `--hover`
  - Colour-tinted cells using `groupColour(info.group) + "1A"` for a soft fill, full strength text colour, hover title with full shift name
  - Sparse-friendly: missing day index → "—"
- `components/RosterSummary.tsx` — work hrs, weekend days, night shifts, and `staff_max_consec` per staff
- `pages/RostersPage.tsx`:
  - Four sections: **Solving** (running rosters with inline spinner badge), **Failed** (with Discard), **Drafts** (View / Approve / Discard), **Approved** (▼ Show / ▲ Hide expand inline)
  - View modal embeds `RosterGrid` + `RosterSummary` + inline Approve / Discard buttons
  - Page-level `useQuery` uses `refetchInterval` (3 s) only while at least one roster is `running`, complementing the global `RosterJobWatcher`
- Verified end-to-end: opened a real draft → grid renders with 10 Ward A staff over 7 days, DSG/ESG/NSG colour tints applied, weekend columns shaded, the per-staff summary populates from `staff_max_consec`.

### Step 9 — Done
- `lib/calendar.ts` — `buildDayStatusMap` (sorts by status rank, derives per-date approved/draft/none), `monthMatrix`, `dateRange`, `addDaysIso`, and a new `pickRosterForDate` that returns the single **approved** roster covering a date (drafts are never displayed in timetables — they're hypothetical).
- `components/Calendar.tsx` — month grid with prev/next navigation, click-1/2/3 selection lifecycle, legend, action button bar that switches between **View day timetable** and **View range timetable** depending on selection. Cells colour-coded by status, with a ×N annotation when multiple rosters overlap.
- `lib/timetable.ts` — Gantt window math: `DAY_WIN_START=1080` (18:00 prev day), `DAY_WIN_END = 2*1440 + 540`, `rangeWindowDuration(n) = (n+1)*1440 + 9*60 - 1080`. `dayTimetableBars` and `rangeTimetableBars` collect bars from the approved roster only, with NSG-only filtering on prev/next boundary days for natural spillover. Bars are clipped to the window.
- `components/DayTimetable.tsx` — 39-hour ruler (18:00 → 09:00+2), hour ticks with bold 00:00/12:00, per-staff bars coloured by group.
- `components/RangeTimetable.tsx` — multi-day Gantt with one midnight separator per day, weekend separators emphasised, NSG spillover at both boundaries.
- Calendar + both modals wired into `RostersPage`. Selection clears itself after firing.
- **Bug found & fixed during smoke test**: `isoDate()` and `prevIso/nextIso` used `Date.toISOString().slice(0,10)`, which produces a UTC date string. In timezones east of UTC, midnight-local dates serialize to the previous day, so `addDays(iso, 1)` returned the same date — `dateRange()` then looped forever and hung the browser when clicking **View range timetable**. Replaced all three sites with local-component formatting (`getFullYear()/getMonth()/getDate()`).
- Verified end-to-end via Playwright: clicked May 04 → View day timetable (renders 7 staff with E135/D088/N2010/N2212 bars and NSG spillover from prev day); selected May 04 → May 05 → View range timetable (2-day Gantt with midnight separators, NSG bars crossing the day boundary).

## Context

The user previously built a Flask-rendered webapp (running at `http://127.0.0.1:5000`) that drives the roster engine via the **old** API surface (`/api/rosters/calendar`, `/api/jobs/status`, `/api/export/...`, etc.). The current backend in this repo is a different FastAPI service with a richer, JWT-protected API and **no** server-side templating. The `frontend/` directory has a stale Vite/React/TS scaffold (`vite.config.js` with `/api` → `http://backend:8000` proxy) but no `src/`, no `package.json`, and an empty `node_modules`.

Goal: build a React + Vite + TypeScript SPA that **reproduces the original UX in full**, but talks to the current FastAPI backend and uses the backend's domain terms ("Profile", "Staff", "Shift", "Demand", "Roster"). Excel export is out of scope (no backend endpoint).

## Source of UX Truth (Old Flask App)

Pages reverse-engineered from `http://127.0.0.1:5000`:

| Old path | Purpose | Maps to new backend resource |
|---|---|---|
| `/rosters` (and `/`) | Monthly calendar + approved list + drafts grid + day/range Gantt modals | `Roster` |
| `/shifts` | Shift groups + shifts CRUD | `ShiftGroup`, `Shift` |
| `/nurses` | Staff CRUD + skills + permitted shifts | `Staff`, `StaffSkill`, `StaffPermittedShift` |
| `/templates` | Profile config (shift groups, conditional-constraint rules, staff inclusion) | `Profile`, `ProfileStaff`, `ProfileShift` |
| `/generate` | 5-step wizard: template → date range/target hours → leaves → demands → run solver | `POST /api/rosters` |

Key behavioural details to preserve (visuals will be re-skinned — see Visual Design below):
- Calendar day states: `approved` (filled), `lookahead` (pale), `none` (empty); click 1 → start, click 2 → end, click 3 → reset
- Day timetable modal: 36-hour Gantt window 18:00 prev-day → 09:00 next-day; NSG shifts from `d-1` and `d+1` spill into view
- Range timetable modal: multi-day Gantt with one midnight separator per day and NSG spillover at both boundaries
- Roster grid: staff × days, shift code per cell tinted by group colour
- Per-staff summary: work hours, weekend days, night shifts, max consecutive working days (use `result.staff_max_consec` directly)
- Top-nav "Solving…" badge driven by polling; toast on completion / failure

## Visual Design

Clean and professional, no clutter — re-skinned from the original (do **not** carry over the old Flask app's red/blue/purple group palette into the chrome; reserve colours for data).

**Palette**
- **Primary**: deep blue `#1B4F8C` — nav, primary buttons, focused inputs, active calendar dates, links
- **Accent / Alert**: bright red `#E63946` — used **sparingly**, only for destructive actions (Delete, Discard), error toasts, validation errors, the "Failed" roster status badge
- **Warm grey scale** (not pure black/white):
  - `--bg`        `#FAF8F5` — page background (warm off-white)
  - `--surface`   `#FFFFFF` — cards, modals
  - `--border`    `#E7E2D9` — hairline dividers
  - `--muted`     `#8A8378` — secondary text, captions
  - `--ink`       `#2B2A28` — primary text (warm near-black, never `#000`)
  - `--ink-soft`  `#5A5650` — body copy on light surfaces
- **Status tints** (low-saturation, used as badge backgrounds only):
  - Approved: `#DCE9DA` bg / `#2F5E3A` text
  - Draft:    `#E6E0D2` bg / `#6B5A2B` text
  - Running:  `#DAE4EE` bg / `#1B4F8C` text
  - Failed:   `#F5D7D9` bg / `#9B2C32` text
- **Group colours for roster data** (cells, Gantt bars — kept distinct from chrome palette): `DSG #2B6CB0`, `ESG #6B46C1`, `NSG #C84B31`, `Off #4A5568`, `Leaves #2D6A4F`

**Typography**
- UI sans: **Inter** (or system stack fallback `-apple-system, "Segoe UI", Roboto, …`) — replaces DM Sans
- Display / page titles: **Source Serif 4** at 600 weight — replaces DM Serif Display, retains the editorial feel without being decorative
- Monospace (codes, times, IDs): **JetBrains Mono** — replaces DM Mono
- Type scale: 12 / 13 / 14 / 16 / 20 / 28 / 36 px; line-height 1.5 for body, 1.2 for headings
- Tabular numbers (`font-variant-numeric: tabular-nums`) on all tables and timetables so columns align

**Spacing & layout**
- 4-pt base grid; component padding scales 8 / 12 / 16 / 24 / 32 / 48
- Cards: 24px padding, 1px `--border` hairline, 8px radius, **no shadow** (depth via border + spacing, not drop-shadows)
- Page gutters: 32px on narrow, 48px on wide; max content width 1280px; full-width allowed only for the roster grid + Gantt views
- Generous vertical rhythm — at least 24px between sections, 32px between major blocks
- Sticky top nav: 56px tall, `--surface` background, 1px bottom border (no shadow)

**Component conventions**
- Buttons: 36px tall (32px for `.btn-sm`), 6px radius, 14px text. Primary = filled `#1B4F8C`/white. Secondary = white surface with `--border` outline. Danger = filled `#E63946`/white, **only** on destructive paths.
- Inputs: 36px tall, `--border` outline, focus ring `#1B4F8C` at 2px with 4px outer halo, no inner shadow.
- Tables: zebra disabled by default; row hover `#F5F1EB`; header row uppercase 11px tracked-out caption.
- Modals: white surface, 24px radius hairline border, page-level overlay at `rgba(43,42,40,0.32)` (warm scrim, not black).
- Toasts: bottom-right stack; success uses primary blue tint, error uses accent red tint, neutral uses warm-grey tint.
- Focus visible everywhere — keyboard accessibility is non-negotiable.

All tokens land in `src/styles/global.css` as CSS custom properties so the palette is single-source-of-truth and easy to retune.

## Tech Stack

- **Vite + React 18 + TypeScript** (matches existing `vite.config.js`)
- **react-router-dom v6** for routing
- **@tanstack/react-query** for server state, polling (`refetchInterval` while a roster is `running`), and cache invalidation after mutations
- **axios** with a request interceptor that injects `Authorization: Bearer <token>` from `localStorage`, and a 401 response interceptor that redirects to `/login`
- **react-hook-form + zod** for the Generate wizard and edit modals
- **Plain CSS** — keeps the design tokens single-source-of-truth in `src/styles/global.css`, no Tailwind/MUI dependency
- **vitest + @testing-library/react** for unit/component tests (already declared in the existing `vite.config.js`)

## Cross-Cutting Concerns

### Auth
- `POST /api/auth/login` → store `access_token` in `localStorage` + React context
- `AuthProvider` wraps the app; `RequireAuth` route guard redirects to `/login` when missing/invalid
- All other endpoints require the JWT — handled by axios interceptor

### Polling solver progress
The old app had a global `/api/jobs/status` poller. The new backend has none, so we replicate it via React Query:
- After `POST /api/rosters`, the returned roster has `status: "running"` and a `celery_task_id`
- A `useRunningRosters` hook does `GET /api/rosters?status=running` every 3 s; when the list becomes non-empty the nav shows the "Solving…" badge
- For an individual roster view, `useRoster(id)` uses `refetchInterval: (data) => data?.status === 'running' ? 3000 : false`
- On transition `running → draft` we toast "Saved as draft ✓" and invalidate the rosters list query
- On `running → failed` we toast the failure message

### Deriving the calendar and day views (no backend endpoint exists)
The old API had `/api/rosters/calendar?year&month` and `/api/rosters/day/{date}`. The new backend has neither, so we derive client-side from `GET /api/rosters` (all rosters, status filter optional) plus each roster's `result` payload:
- **Calendar**: for each approved roster, mark dates `[roster_start, roster_start + num_days - lookahead)` as `approved` and the lookahead tail as `lookahead`
- **Day timetable**: pull the three rosters covering `d-1`, `d`, `d+1` (often the same roster), then read `result.assignments[name][dayIndex]` and `result.shifts[code]` to build the Gantt
- `result.shifts[code]` already contains `start_time`, `end_time`, `group`, `work_time` (see [backend/app/worker/tasks.py](backend/app/worker/tasks.py) `_result_to_json`)

If derivation proves too slow at scale, we can later add `/api/rosters/calendar` and `/api/rosters/day/{date}` server-side, but it is unnecessary for v1.

## File Structure

```
frontend/
├── package.json                    # NEW — declare deps
├── index.html                      # NEW — Vite entry
├── vite.config.js                  # exists, keep as-is
├── tsconfig.json                   # NEW — strict TS
├── src/
│   ├── main.tsx                    # ReactDOM + QueryClient + Router
│   ├── App.tsx                     # routes
│   ├── api/
│   │   ├── client.ts               # axios instance + interceptors
│   │   ├── auth.ts                 # login, me, change-password
│   │   ├── rosters.ts              # list/get/create/approve/discard + result types
│   │   ├── profiles.ts             # profile + profile-staff + profile-shifts
│   │   ├── staff.ts                # staff + skills + permitted-shifts + leaves
│   │   ├── shifts.ts               # shift groups + shifts
│   │   ├── demands.ts              # demands CRUD
│   │   └── skills.ts               # skill types + values
│   ├── auth/
│   │   ├── AuthContext.tsx
│   │   └── RequireAuth.tsx
│   ├── components/
│   │   ├── Nav.tsx                 # top nav + Solving… badge
│   │   ├── Modal.tsx
│   │   ├── Toast.tsx + ToastProvider.tsx
│   │   ├── RosterGrid.tsx          # staff × days table
│   │   ├── RosterSummary.tsx       # per-staff stats table
│   │   ├── DayTimetable.tsx        # 36-hour Gantt
│   │   ├── RangeTimetable.tsx      # multi-day Gantt
│   │   └── Calendar.tsx            # month grid + selection state
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── RostersPage.tsx
│   │   ├── ShiftsPage.tsx
│   │   ├── StaffPage.tsx
│   │   ├── ProfilesPage.tsx
│   │   └── GeneratePage.tsx        # 5-step wizard
│   ├── hooks/
│   │   ├── useRosters.ts
│   │   ├── useRoster.ts            # polls while running
│   │   ├── useRunningRosters.ts    # drives nav badge
│   │   └── useToast.ts
│   ├── lib/
│   │   ├── timetable.ts            # window math: WIN_START/WIN_END, bar clipping
│   │   ├── calendar.ts             # roster-list → day-status map
│   │   ├── colours.ts              # groupColour map
│   │   └── time.ts                 # min-from-midnight ↔ HH:MM helpers
│   ├── styles/
│   │   └── global.css              # design tokens + utility classes
│   └── test/
│       ├── setup.ts
│       └── (per-component test files)
```

## Page Plan

### `/login` — `LoginPage.tsx`
- Form: username, password
- On submit: `POST /api/auth/login` → store token → navigate to `/rosters`

### `/rosters` — `RostersPage.tsx`
- **Calendar**: month nav + grid; `useRosters({status: 'approved'})` → derive day-status map via `lib/calendar.ts`. Click-1/2/3 selection state local. On range-confirm, open `DayTimetable` or `RangeTimetable` modal.
- **Approved list**: collapsible cards; each shows `RosterGrid` + `RosterSummary` on expand. Buttons: approve (n/a — already approved), delete (`POST /api/rosters/{id}/discard`).
- **Drafts list**: card grid; buttons: View (opens modal with `RosterGrid`), Approve (`POST /api/rosters/{id}/approve`), Delete.

### `/shifts` — `ShiftsPage.tsx`
- List shift groups (`GET /api/shifts/groups`); inside each, list shifts (`GET /api/shifts?group_id=`).
- Add Group modal, Add Shift modal, Edit Shift modal, Delete buttons. All CRUD endpoints in [backend/app/api/shifts.py](backend/app/api/shifts.py).

### `/staff` — `StaffPage.tsx` (path renamed from `/nurses`)
- List staff (`GET /api/staff`), filter by `staff_group_id`.
- Add Staff modal, Edit Staff (PATCH), Soft-delete (`POST /api/staff/{id}/delete`).
- "Skills" modal: add/remove `StaffSkill` via `/api/staff/{id}/skills`.
- "Permitted Shifts" modal: tree of shift groups → shifts with bulk-select; persist via `/api/staff/{id}/permitted-shifts`.
- Leaves: separate section (or sub-page) using `/api/staff/leaves` CRUD.

### `/profiles` — `ProfilesPage.tsx` (path renamed from `/templates`)
- List profiles (`GET /api/profiles`); each card shows config summary.
- Create/Edit modal with tabs:
  - **Basics**: name
  - **Shift groups & shifts**: bulk-add a `ShiftGroup` via `/api/profiles/{id}/shifts/add-group/{group_id}`; per-shift add/remove
  - **Staff inclusion**: bulk-add a `StaffGroup`; per-staff `excluded` toggle
  - **Solver config** (JSONB): inputs for `time_limit`, `weight_overstaff`, `weight_consec`, `weight_burden`, `weight_night`, `weight_weekend`
  - **Conditional constraints**: dynamic rule rows `{trigger, trigger_val, offset, enforce, enforce_val}` (matches CLAUDE.md schema)

### `/generate` — `GeneratePage.tsx`
- 5-step single-page wizard (same flow as the old `/generate`):
  1. **Profile** (dropdown from `GET /api/profiles`)
  2. **Date range & target hours** — `roster_start`, `num_days`, `target_work_min`, optional `previous_roster_id` for chaining
  3. **Leaves preview** — call `GET /api/rosters/{previous_id}/leaves` if chaining; otherwise show `GET /api/staff/leaves?from_date&to_date`. Rows are read-only previews (creation lives on Staff page).
  4. **Demands** — per-day list; `+ Demand` adds a row (`{start_min, end_min, headcount, skill_value_id?}`); `Copy day 1 to all days` shortcut. Submitting POSTs each demand to `/api/demands` and collects their IDs.
  5. **Generate** — `POST /api/rosters` with `{profile_id, name, roster_start, num_days, target_work_min, demand_ids, previous_roster_id?}`; redirect to `/rosters` and let the nav badge poll.

## Critical Files to Reuse / Reference

- [backend/app/api/rosters.py](backend/app/api/rosters.py) — request/response schemas for the Roster create + result polling flow
- [backend/app/worker/tasks.py](backend/app/worker/tasks.py) — `_result_to_json` defines the exact shape of `Roster.result` (`assignments`, `shifts`, `staff`, `staff_max_consec`, etc.) that `RosterGrid`, `DayTimetable`, `RangeTimetable` will read
- [backend/app/schemas/](backend/app/schemas/) — Pydantic models to mirror as TS types in `src/api/*.ts`
- The downloaded reference HTML at `/tmp/rosters-page.html`, `/tmp/staff.html`, `/tmp/shifts.html`, `/tmp/templates.html`, `/tmp/generate.html`, `/tmp/nurses.html` capture every JS function from the old app — port the calendar selection, Gantt window math, and roster-grid rendering logic from there

## Verification

End-to-end check before declaring done:

1. **Stand the stack up**:
   ```bash
   docker compose -f docker-compose.dev.yml up -d
   docker compose -f docker-compose.dev.yml exec backend alembic upgrade head
   docker compose -f docker-compose.dev.yml exec backend python -m app.scripts.create_user
   cd frontend && npm install && npm run dev   # serves at :5173, proxies /api
   ```
2. **Manual smoke (via Playwright MCP if browser available, else by hand)**:
   - Log in → land on `/rosters` empty state
   - Create a Shift Group + 3 shifts (DSG, ESG, NSG)
   - Create 3 Staff with skills + permitted shifts
   - Create a Profile that bundles them with default solver weights
   - On `/generate`: pick the profile → 7-day range, 2400 target_work_min, no leaves, add 1 demand per day → Run Solver
   - Nav badge shows "Solving…" → toast "Saved as draft ✓" within ≤ time_limit
   - Open the draft → `RosterGrid` renders staff × 7 days with coloured cells → `RosterSummary` shows non-zero hours
   - Approve → roster moves to Approved list → calendar highlights the date range
   - Click two calendar dates → Range Timetable modal renders Gantt with at least one bar per staff per day
3. **Automated**:
   - `cd frontend && npm test` — vitest suite for `lib/timetable.ts` (Gantt clipping math), `lib/calendar.ts` (day-status derivation), and `RosterGrid` snapshot
   - `cd backend && conda activate roster-engine && pytest` — backend regression suite still passes
4. **Type/lint**: `npm run build` produces zero TS errors

## Out of Scope (deferred)

- Excel / xlsx export (no backend endpoint; revisit once `/api/rosters/{id}/export` exists)
- Server-side calendar/day aggregation endpoints (current derivation is fast enough for v1)
- Mobile-responsive Gantt (original isn't either)
- User-management UI (`/api/auth/users` CRUD) — backend has it; UI can come later
