# Cadence — Design Proposal (Phase 1)

- **Date:** 2026-06-02
- **Status:** Awaiting approval (Phase 1 gate)
- **Owner:** Samuel (single user)
- **One-liner:** A local-first, mobile-first PWA daily task tracker that replaces the habit of self-messaging tasks and project ideas on WhatsApp.

---

## 1. Product Brief

### Problem
Today I track work by sending myself WhatsApp messages: a daily list ("Por hacer hoy / mañana / general"), a long-lived backlog of future project ideas ("Histórico"), and per-project lists of improvement ideas (e.g. "Cambios en Dei Verbum"). It is unstructured, hard to check off, easy to lose, and incomplete items only "roll forward" because I manually retype them each day. Cadence replaces WhatsApp as the single source of truth.

### Target user
Just me. No accounts, no sharing, no multi-user. The app is private and lives on my device(s).

### Core entities (4)
| Entity | Purpose | Promotion |
|---|---|---|
| **Project** | An active dev project (HKN, Dei Verbum, Money Tracker…) **or** a life area (Daily routine, Uni, Work/Simetrik). Owns tasks + an idea backlog. | — |
| **Task** | One actionable line. Optional link(s) + optional Project. Lives in exactly one bucket. | — |
| **Idea** | An improvement note parked under a Project. | **Idea → Task** (lands in a bucket) |
| **Backlog item (Histórico)** | A parked *future-project* idea so I don't forget it. No tasks yet. | **Backlog → new Project** |

A task may belong to no project (e.g. "Ropa").

### Buckets (where/when a task sits)
- **Today** — the daily driver.
- **Tomorrow** — pre-planned for the next day.
- **This Week** — a *staging pool* of intentions; does **not** auto-move. I pull items into Today/Tomorrow manually.

### Rollover (the WhatsApp-killer)
On each app open, the app replays every day boundary crossed since it was last opened:
1. **Done "Today" tasks → archived** (retained with `completedAt`, visible in History).
2. **Open "Today" tasks → stay in Today**, flagged `carried` (shown with a "↻ carried" pill).
3. **"Tomorrow" tasks → promoted to Today.**
4. **"This Week" → untouched.**

Missing several days collapses cleanly: Tomorrow still lands in Today, all open items remain in Today. Fully client-side and instant.

### Completion
Checking a task off keeps it visible struck-through for the rest of the day (sense of progress), then it archives at the next rollover. A **History** view lists archived tasks grouped by date.

### Scope
**In (v1):**
- Projects (`active` / `area`), tasks with links + optional project, 3 buckets.
- Auto-rollover + carry-forward.
- Ideas per project + promote → task.
- Histórico backlog + promote → project.
- Done strike-through + midnight archive + History view.
- Manual drag-reorder within a bucket/list (lists are priority-ordered).
- Light **and** dark mode (system default + manual toggle, persisted).
- Installable PWA, fully offline.

**Deferred (v2):**
- Reminders / notifications.
- Multi-device sync.
- Full-text search.
- Recurring tasks, sub-tasks.
- WhatsApp export — **intentionally dropped**; the app replaces it.

---

## 2. Architecture

### Stack
- **Next.js (App Router), static export** (`output: 'export'`) — TypeScript.
- **Tailwind CSS** + **shadcn/ui** for primitives (button, dialog/sheet, input, tabs).
- **Dexie** (IndexedDB) for persistence; **dexie-react-hooks** (`useLiveQuery`) for reactive reads.
- **Serwist** (`@serwist/next`) for the service worker / offline precache.
- **pnpm** for all dependency + script management.

### Why static export
No SSR, no Server Functions, no middleware, no database service. Vercel serves pre-built static files from its CDN, so **no serverless compute is invoked** → near-zero Vercel resource usage and trivial cost. All logic and data live in the browser.

### Data flow
Components read IndexedDB reactively via `useLiveQuery`; writes go straight to Dexie and the UI updates automatically. **The database is the store** — no Redux/Zustand. Only ephemeral UI state (open sheet, active segment) uses local React state.

### Folder structure
```
app/
  layout.tsx            # theme provider, fonts, tab shell
  page.tsx              # Today (segmented: Today | Tomorrow | This Week)
  projects/page.tsx     # project grid; detail via ?p=<id> (static-friendly)
  historico/page.tsx    # backlog list
  history/page.tsx      # archived tasks by date
components/
  ui/                   # shadcn primitives
  task-row.tsx  quick-add-sheet.tsx  segmented-tabs.tsx
  project-card.tsx  idea-row.tsx  backlog-row.tsx
  bottom-nav.tsx  theme-toggle.tsx
lib/
  db/
    schema.ts           # Dexie tables + indexes
    queries.ts          # typed read/write helpers
    rollover.ts         # day-boundary engine
  types.ts  utils.ts  links.ts   # URL detection
public/
  manifest.webmanifest  icons/*  (generated)
```

### IndexedDB schema (Dexie v1)
```ts
db.version(1).stores({
  projects: '++id, kind, order, archivedAt',
  tasks:    '++id, bucket, status, projectId, dayKey, [bucket+order]',
  ideas:    '++id, projectId, status, [projectId+order]',
  backlog:  '++id, order',
  meta:     '&key',          // lastOpenedDay, theme, etc.
});
```
- **Project**: `{ id, name, kind:'active'|'area', color, order, createdAt, archivedAt? }`
- **Task**: `{ id, title, links:string[], projectId?:number, bucket:'today'|'tomorrow'|'week', status:'open'|'done', order, createdAt, completedAt?, carried?:boolean, dayKey?:string }`
- **Idea**: `{ id, projectId, text, status:'open'|'promoted', order, createdAt }`
- **Backlog**: `{ id, title, note?, order, createdAt, promotedProjectId?:number }`
- **Project colors** are assigned round-robin from a fixed pastel chip set on create.

### Rollover algorithm (`lib/db/rollover.ts`)
```
onAppOpen():
  last = meta.lastOpenedDay   // 'YYYY-MM-DD' or null
  today = localDateKey(now)
  if last == today: return
  // collapse all missed days into one transition
  archive(tasks where bucket=='today' and status=='done')   // keep, mark archived
  mark(tasks where bucket=='today' and status=='open' as carried=true)
  promote(tasks where bucket=='tomorrow' -> bucket='today', dayKey=today)
  // 'week' untouched
  meta.lastOpenedDay = today
```
Runs inside one Dexie transaction. "Archive" = move to an archived state retained for History (not deleted).

### PWA / offline
Serwist precaches the app shell + fonts + icons; the app is fully usable with no network and installable to the home screen. Theme + data persist locally.

### Performance budget
- Static export, code-split routes, self-hosted **subset** fonts (`next/font`).
- Minimal JS (Dexie is small; no heavy state lib).
- Targets: Lighthouse mobile **Performance ≥ 90**, **PWA installable = pass**, no layout shift on theme load (inline no-flash theme script).

---

## 3. UI/UX Direction

### Information architecture
Bottom tab bar with 3 destinations: **Today · Projects · Histórico**. **History** is reached from a small clock icon in the Today header (secondary). A ⊕ FAB for quick-add is present on Today and Projects.

### Screens
- **Today (`/`)** — date header + clock→History; **segmented control** (Today | Tomorrow | This Week); ordered, drag-reorderable task list; ⊕ FAB. Carried items show a "↻ carried" pill; done items struck-through.
- **Projects (`/projects`)** — cards for active projects + areas. Tap → detail at `?p=<id>` (no dynamic SSG route needed): the project's open tasks + its **Idea backlog**, with *add idea* and *promote idea → task*.
- **Histórico (`/historico`)** — parked future-project ideas; *promote → Project*.
- **History (`/history`)** — archived done tasks grouped by date.
- **Quick-add sheet** — single text field (pasted URLs auto-captured as link chips), optional project picker, bucket pre-set to the current segment. Capture in ≤ 2 taps.

### Visual system
**Identity:** Sky & Mint. Primary `#A9C8EE`, done/accent `#9ED9C5` (constant across themes).

| Token | Light | Dark |
|---|---|---|
| bg | `#F5F8FC` | `#0F151C` |
| surface | `#FFFFFF` | `#18212B` |
| ink (text) | `#374049` | `#E6ECF2` |
| muted | `#9FA8B2` | `#8593A1` |
| border | `#E7EEF6` | `#263240` |
| tag bg / text | `#DCF1EA` / `#2F7A66` | `#1E3A33` / `#9ED9C5` |
| primary | `#A9C8EE` | `#A9C8EE` |
| accent (done) | `#9ED9C5` | `#9ED9C5` |

Implemented as CSS variables with Tailwind `dark:`; theme = system default, manual toggle, persisted in `meta`. Inline script sets the class before paint to avoid flash.

**Typography:** Plus Jakarta Sans (headings, 600/700) + Inter (body, 400/500/600), self-hosted & subset.

**Feel:** minimalist, generous spacing, cards rounded 11–18px, soft shadows, mobile-first verified at 375px first.

**App icon:** **Momentum** — two forward chevrons (the trailing one at ~55% opacity) in white on the `#A9C8EE → #9ED9C5` gradient squircle. Full maskable PNG set + favicon generated during Phase 2.

### Primary mobile layout (low-fi, 375px)
```
┌─────────────────────────────┐
│ Today              🕘  Mon 2 │   header
│ [ Today ][Tomorrow][ Week ]  │   segmented
├─────────────────────────────┤
│ ○ Actualizar el abrazo  ⟨HKN⟩│
│ ○ Ajustes Dei Verbum  ⟨DeiV⟩ │
│ ● R̶o̶p̶a̶                       │   done (struck)
│ ○ Terminar cosas Uni  ↻       │   carried
│                          ⊕   │   FAB
├─────────────────────────────┤
│   ◎ Today   ▦ Projects  ✦ Hist│  bottom tabs
└─────────────────────────────┘
```

---

## 4. Acceptance Criteria (verifiable)
1. A task can be created from Today in ≤ 2 taps; a pasted URL becomes a link chip on the task.
2. On a simulated new day: Tomorrow tasks appear in Today; open Today tasks remain flagged `carried`; done Today tasks move to History; This Week is unchanged.
3. Promote idea → task creates a task in the chosen bucket and marks the idea `promoted`.
4. Promote backlog → project creates a Project and links/clears the backlog item.
5. Theme respects system preference on first load, toggles manually, and persists across reload with no flash.
6. After one visit, the app loads and is fully usable offline and is installable (Lighthouse PWA pass).
7. Production build is a static export — **zero Vercel Functions invoked**.
8. Lighthouse mobile Performance ≥ 90.

## 5. Out of scope / explicitly not building (v1)
Notifications, sync, search, recurring/sub-tasks, WhatsApp export, authentication, any backend/database service.
