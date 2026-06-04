# Cadence — v2 Roadmap & Candidate Implementations

- **Status:** Exploration / not yet scoped
- **Baseline:** v1 shipped (see `superpowers/specs/2026-06-02-cadence-design.md`) — local-first IndexedDB (Dexie), Next.js static export, installable PWA, light/dark, Today/Tomorrow/This Week + auto-rollover, Projects + idea backlogs, Histórico, History.

## Guiding principles (don't break these without a deliberate decision)

1. **Local-first stays the default.** Data lives in IndexedDB; the app must keep working fully offline with no backend.
2. **Static export, near-zero Vercel compute.** Anything that needs a server is a conscious cost decision, not a default.
3. **Mobile-first, performance budget intact** (Lighthouse mobile ≥ 90, fast cold start).
4. **Minimalist & calm.** Add capability without adding clutter. YAGNI ruthlessly.

Effort key: **S** ≈ hours · **M** ≈ a day · **L** ≈ multi-day / architectural.

---

## Tier 1 — High value, stays fully local (do these first)

### 1.1 Faster capture
- **Natural-language quick-add** — parse `tomorrow` / `today` / `week` and `#project` (or `@project`) inline from the typed text, so adding is one line with no taps. **Effort: M.** Pure client. Extends `lib/links.ts`-style parsing.
- **PWA Share Target** — register `share_target` in the manifest so you can share a Jira/Spotify/YouTube link straight from any app into a new Cadence task. This is the *real* replacement for pasting into WhatsApp. **Effort: M.** Needs a small handler route + manifest entry; works on Android/installed PWAs (limited on iOS). Stays static.
- **App shortcuts** — manifest `shortcuts` for "Add task" / "Today" / long-press icon. **Effort: S.**

### 1.2 Task depth
- **Recurring tasks** — daily/weekly/weekday repeats. Store a `recurrence` rule on a template; the rollover engine materializes the next instance. **Effort: M.** Fits the existing rollover transaction cleanly.
- **Sub-tasks / checklist** — a lightweight `subtasks: {text, done}[]` on a task with a progress pill. **Effort: M.**
- **Due dates / scheduling** — optional date on a task; `week`/`tomorrow` could derive from it. **Effort: M.** Decide carefully — risks complicating the calm bucket model.

### 1.3 Organize & find
- **Search** — client-side fuzzy search across tasks, ideas, projects, backlog. **Effort: S–M.** A simple `includes`/token match over Dexie is enough at personal scale; no search index needed.
- **Filters & sort** on Today/Project views (by project, has-link, carried). **Effort: S.**
- **Archive a project / complete a project** (vs delete) so finished work leaves the grid without losing history. **Effort: S.**

### 1.4 Data ownership
- **Export / import JSON backup** — one-tap download of the whole DB and restore. **Effort: S.** Important safety net for a local-first app (clearing browser data = data loss today). **Strongly recommended early.**

### 1.5 Insight (gentle, not gamified)
- **Weekly review screen** — what got done this week, grouped by project; carried-over count. **Effort: M.** Reads existing archived tasks.
- **Lightweight streak / "shipped today" count** in the Today header. **Effort: S.**

### 1.6 Polish
- **Settings screen** — theme (system/light/dark explicit), export/import, seed reset, about. **Effort: S.**
- **Sheet & list animations** — spring open/close on sheets, smooth reorder/complete transitions. **Effort: S–M.** Consider a tiny animation lib or CSS only to protect the bundle.
- **Undo toast** on delete/complete. **Effort: S.**

---

## Tier 2 — Crosses the "no backend" line (deliberate cost decision)

These break principle #1/#2. Each needs an explicit yes, because it adds infra, cost, and (for sync/auth) complexity.

### 2.1 Multi-device sync — the big one
Today data is trapped in one browser. Options, lightest-touch first:

| Approach | How | Backend? | Notes |
|---|---|---|---|
| **Manual export/import** (Tier 1.4) | JSON file moved by hand | None | Zero-cost stopgap; covers backup + occasional device move. |
| **Dexie Cloud** | Drop-in sync layer for the existing Dexie schema | Managed service (paid tier) | Least code change — syncs the schema we already have. Eval free tier limits. |
| **Supabase** (Postgres + Auth + Realtime) | Mirror tables to Postgres, sync on change | Yes (generous free tier) | User already has Supabase CLI/org. Most control; most work (auth, RLS, conflict handling). |
| **Turso / libSQL** | Embedded-replica libSQL per device | Yes (free tier, user has CLI) | Local-first-friendly replication model; good fit philosophically. |

**Recommendation:** ship export/import first; if real multi-device need appears, prototype **Dexie Cloud** (least disruptive) and compare against **Supabase** (most owned). Either way, keep the app working offline-first — sync is additive, not a rewrite. **Effort: L.**

### 2.2 Reminders / notifications
- **Local notifications** (Notification API + service worker) fire only while the PWA can wake — unreliable, especially iOS. **Effort: M**, low reliability.
- **True push** (Web Push + VAPID) needs a server endpoint to send pushes and store subscriptions → leaves static export. **Effort: L.** Only worth it if reminders become essential.

### 2.3 WhatsApp/Telegram bridge (optional, revisit)
We intentionally dropped WhatsApp export. If you ever want the *outbound* habit back: a one-tap "share my Today list" using the Web Share API (no backend) is **Effort: S** and stays static. A real bot integration is Tier-2 backend work.

---

## Suggested sequence

1. **Export/import backup** (safety) + **Settings screen**.
2. **PWA Share Target** + **natural-language quick-add** (capture speed — the core daily win).
3. **Search** + **recurring tasks**.
4. **Weekly review** + polish (animations, undo).
5. Reassess: is multi-device **sync** actually needed? If yes, prototype Dexie Cloud vs Supabase.

## Explicitly still out of scope (unless asked)
Collaboration/sharing with other people, accounts beyond personal sync, calendar integrations, AI features. Keep Cadence personal, fast, and calm.
