# MCGI Operators Board — Build Plan

Recreate the Miro "Operator Scheduling" board as a lightweight, mobile-first Vue app.
Reference screenshot: `tmp/operator-scheduling-board.png`.

## 1. Goals

- Same look and flow as the Miro board: a title, a "Month of" line, service group headers, 9 duty columns and an operators palette.
- **Mobile first.** It must work well on phones, including dragging name stickies with a finger.
- **The layout is locked.** Gathering types and schedules are configured in `schedule.json`, each with a permanent UUID, and nobody can edit them in the UI.
- **Config edits never lose notes.** Notes are tied to schedule UUIDs, so renaming or retiming a schedule keeps them. Notes are hidden only when the schedule or gathering type is completely removed.
- **Operator stickies are driven by a JSON file** (`operators.json`).
- **Anyone can move notes.** There are no accounts, and changes appear live for everyone.
- **First-time visitors enter a name or nickname**, which is saved on the device and shown as "moved by".
- **One operator can be placed in multiple columns.** The palette never runs out: dragging from it always creates a copy.

## 2. Non-goals (v1)

- No login, roles or passwords.
- No editing of gathering types, schedules or operators in the UI. That's done by editing the JSON and redeploying.
- No per-date rows. Columns are per duty for the whole month, the same as the Miro board.

## 3. Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Vue 3 + Vite + TypeScript | Small, fast and simple to build |
| Styling | Plain CSS with CSS variables (no UI kit) | Keeps the bundle tiny and matches the Miro look exactly |
| Drag & drop | `vue-draggable-plus` (SortableJS) | Touch support, long-press drag, and a "clone from palette" mode built in |
| State | `reactive` store (Pinia is optional) | The app is small |
| Hosting | **GitHub Pages** (static), deployed by `deploy.sh` | Free, with no server to run |
| Realtime + persistence | **Supabase** (free tier): one Postgres table plus Realtime | GitHub Pages can't run a server, so shared live state needs a hosted backend |
| Config | `operators.json` and `schedule.json` served as static files from `public/` | Matches the "JSON-driven" approach, changed by editing and redeploying |

**Why not a custom server:** GitHub Pages only serves static files, so a Node/WebSocket server isn't possible there. Firebase RTDB would also work in place of Supabase; only `src/api/` would change.

## 4. Data

### 4.1 `public/operators.json` (source of truth for the palette)

Every operator has a permanent **UUID**, so renaming an operator never loses their stickies. The same ID rules as in 4.2 apply: never change or reuse an `id`. Removing an operator hides their stickies, and restoring the UUID brings them back.

```json
{
  "operators": [
    { "id": "b7e3f0c1-2222-4b2b-9b2b-000000000001", "name": "Andrei Dacanay",      "color": "#FFF9B1" },
    { "id": "b7e3f0c1-2222-4b2b-9b2b-000000000002", "name": "Elij Cañaveral",      "color": "#D5F692" },
    { "id": "b7e3f0c1-2222-4b2b-9b2b-000000000003", "name": "Emmanuel Callo",      "color": "#A6CCF5" },
    { "id": "b7e3f0c1-2222-4b2b-9b2b-000000000004", "name": "Heinz Carl Rabanera", "color": "#FFCEE0" },
    { "id": "b7e3f0c1-2222-4b2b-9b2b-000000000005", "name": "Heinz Kyle Rabanera", "color": "#FF9D48" },
    { "id": "b7e3f0c1-2222-4b2b-9b2b-000000000006", "name": "John Lloyd Reyes",    "color": "#67C6C0" },
    { "id": "b7e3f0c1-2222-4b2b-9b2b-000000000007", "name": "Jonathan Cañaveral",  "color": "#F5D128" },
    { "id": "b7e3f0c1-2222-4b2b-9b2b-000000000008", "name": "Julienne Medina",     "color": "#C9DF56" },
    { "id": "b7e3f0c1-2222-4b2b-9b2b-000000000009", "name": "Michael Garcia",      "color": "#C6A2D2" },
    { "id": "b7e3f0c1-2222-4b2b-9b2b-000000000010", "name": "Rick Allan Raya",     "color": "#EA94BB" },
    { "id": "b7e3f0c1-2222-4b2b-9b2b-000000000011", "name": "Victor Toledo",       "color": "#F5F6F8" }
  ]
}
```

### 4.2 `public/schedule.json` (gathering types + schedules, the locked layout)

Gathering types and schedules can be changed **only in this file**. Every entry has a permanent **UUID** (v4). Notes are attached to a schedule's UUID, not to its name, day or time.

```json
{
  "title": "OPERATOR SCHEDULING",
  "month": "November",
  "instructions": "Put a sticky note with your name under the duty you will take.",
  "gatheringTypes": [
    { "id": "6f1c2a4e-8b1d-4c3e-9a51-1f0e7d2b3c01", "name": "PRAYER MEETING",  "color": "#5B3FA8", "order": 1 },
    { "id": "9d4b7e2a-3c5f-4a8b-b6d2-2e1f8c4a5d02", "name": "WORSHIP SERVICE", "color": "#1F3A93", "order": 2 },
    { "id": "c2e8f1a3-7d4b-4e9c-8f15-3a2b9d6e7f03", "name": "THANKSGIVING",    "color": "#1E7A4C", "order": 3 }
  ],
  "schedules": [
    { "id": "0a1b2c3d-1111-4a1a-8a1a-000000000001", "gatheringTypeId": "6f1c2a4e-8b1d-4c3e-9a51-1f0e7d2b3c01", "mode": "LIVE",     "day": "Wed", "time": "03:30", "order": 1 },
    { "id": "0a1b2c3d-1111-4a1a-8a1a-000000000002", "gatheringTypeId": "6f1c2a4e-8b1d-4c3e-9a51-1f0e7d2b3c01", "mode": "PLAYBACK", "day": "Wed", "time": "17:30", "order": 2 },
    { "id": "0a1b2c3d-1111-4a1a-8a1a-000000000003", "gatheringTypeId": "6f1c2a4e-8b1d-4c3e-9a51-1f0e7d2b3c01", "mode": "PLAYBACK", "day": "Thu", "time": "18:00", "order": 3 },
    { "id": "0a1b2c3d-1111-4a1a-8a1a-000000000004", "gatheringTypeId": "9d4b7e2a-3c5f-4a8b-b6d2-2e1f8c4a5d02", "mode": "LIVE",     "day": "Sat", "time": "03:30", "order": 1 },
    { "id": "0a1b2c3d-1111-4a1a-8a1a-000000000005", "gatheringTypeId": "9d4b7e2a-3c5f-4a8b-b6d2-2e1f8c4a5d02", "mode": "PLAYBACK", "day": "Sat", "time": "07:30", "order": 2 },
    { "id": "0a1b2c3d-1111-4a1a-8a1a-000000000006", "gatheringTypeId": "9d4b7e2a-3c5f-4a8b-b6d2-2e1f8c4a5d02", "mode": "PLAYBACK", "day": "Sat", "time": "11:30", "order": 3 },
    { "id": "0a1b2c3d-1111-4a1a-8a1a-000000000007", "gatheringTypeId": "9d4b7e2a-3c5f-4a8b-b6d2-2e1f8c4a5d02", "mode": "PLAYBACK", "day": "Sun", "time": "07:30", "order": 4 },
    { "id": "0a1b2c3d-1111-4a1a-8a1a-000000000008", "gatheringTypeId": "c2e8f1a3-7d4b-4e9c-8f15-3a2b9d6e7f03", "mode": "LIVE",     "day": "Sat", "time": "15:30", "order": 1 },
    { "id": "0a1b2c3d-1111-4a1a-8a1a-000000000009", "gatheringTypeId": "c2e8f1a3-7d4b-4e9c-8f15-3a2b9d6e7f03", "mode": "PLAYBACK", "day": "Sun", "time": "12:30", "order": 2 }
  ]
}
```

(The UUIDs above are placeholders. Generate real ones with `uuidgen` or `crypto.randomUUID()` when creating the file.)

**ID rules (these are what keep notes from getting lost):**
- **Never change an `id` once it's published.** Renaming a gathering type or changing its color, or changing a schedule's day, time, mode or order, keeps every note in place.
- **Moving a schedule to another gathering type** (by changing `gatheringTypeId`) also keeps its notes.
- **Notes disappear only when an `id` is removed:**
  - a schedule removed from `schedules[]` hides that schedule's notes;
  - a gathering type removed from `gatheringTypes[]` hides all of its schedules, and therefore all their notes.
- Hidden notes are **never deleted** from the database; they stay hidden indefinitely. If the same `id` is restored, they reappear.
- **To add** a gathering type or schedule, append a new entry with a new UUID. **Never reuse** an old UUID for a different schedule.
- Time is stored as 24-hour `HH:mm` and displayed as `3:30 AM`. Day is one of `Mon` to `Sun`. `order` sets the left-to-right (desktop) or top-to-bottom (mobile) order within a group.

**Validation on load (runs in the app, plus a `npm run validate:config` script that `deploy.sh` runs before building):**
- every `id` in `schedule.json` and `operators.json` is a valid UUID and unique;
- every `schedule.gatheringTypeId` points to an existing gathering type;
- `mode` is `LIVE` or `PLAYBACK`, and `day` and `time` are well-formed;
- if anything fails, the deploy aborts. In the browser, the app shows a clear error banner instead of a broken board.

### 4.3 `assignments` table (Supabase, changes at runtime)

```sql
create table assignments (
  id          uuid primary key default gen_random_uuid(),
  operator_id uuid not null,            -- operators[].id from operators.json
  schedule_id uuid not null,            -- schedules[].id from schedule.json
  moved_by    text not null,            -- nickname
  client_id   text not null,
  moved_at    timestamptz not null default now(),
  unique (operator_id, schedule_id)     -- once per schedule
);
alter publication supabase_realtime add table assignments;
alter table assignments enable row level security;
-- anyone (anon key) can read / insert / update / delete
create policy "public rw" on assignments for all to anon using (true) with check (true);
```

Rules:
- An operator can appear in **many** duties, but **only once per duty**. The unique constraint rejects duplicates.
- Removing an assignment never touches `operators.json`.
- There's no foreign key to the config, because the config lives in a static JSON file. The app shows only the assignments whose `schedule_id` and `operator_id` both exist in the current config (see the ID rules in 4.1 and 4.2).
- **There's no monthly reset.** It's one continuous board. `month` in `schedule.json` is only the "Month of" display label. To clear the board, operators drag stickies out. There's deliberately no "clear all" button, since anyone could press it.
- **There's no limit** on how many operators a schedule can have.
- The Supabase URL and anon key are public by design and go in `.env` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Access is limited by the RLS policy above.

## 5. UI / UX

### 5.1 Design tokens (taken from the Miro board)

- LIVE header `#E5484D`, PLAYBACK header `#3B82F6`, white text.
- Group headers use the colors in `schedule.json`, rounded, with bold uppercase text.
- Column body `#F7F7F9` with a `#C9CCD6` border. Operators panel `#FFF9DB` with a `#F5C518` header.
- Stickies: square-ish cards with a soft shadow, centered text and the operator's color.

### 5.2 Layouts

**Phone (< 768px, the default design):**
- A sticky top bar with the title, "Month of November" and the current user's nickname (tap to change).
- **Duty list:** groups stacked vertically, each with its own header. Each duty is a full-width card with a colored LIVE/PLAYBACK strip, the day and time, and a wrapping area of name chips.
- **Operators tray:** a bottom sheet pinned to the screen that scrolls horizontally through name stickies and can expand to show all of them.
- Dragging works by long-pressing a name (about 200ms, so normal scrolling still works) and dropping it on a duty card. The page auto-scrolls when you drag near the top or bottom edge.
- **Tap fallback**, for accessibility and less precise drags:
  - Tap an operator, then pick duties from a checklist sheet.
  - Tap a placed chip to get "Move to…" or "Remove".

**Tablet / desktop (≥ 768px):**
- The same layout as Miro: the operators panel on the left and a 9-column grid with group headers spanning their columns. The grid scrolls horizontally if the screen is too narrow.

### 5.3 Interactions

| Action | Result |
|---|---|
| Drag from the palette onto a column | Adds a **copy** (the palette stays intact) |
| Drag a chip between columns | Moves it |
| Drag a chip back to the palette, or onto the trash zone shown while dragging | Removes it |
| Drop on a column that already has that operator | Rejected with a short shake and a toast |

- Every change is optimistic: the UI updates at once, and rolls back with a toast if Supabase rejects it.
- A small "moved by X · 2m ago" tooltip or long-press info appears on each chip.

### 5.4 Copy as text (for Messenger)

A **"Copy schedule"** button in the top bar copies a plain-text summary to the clipboard. It uses `navigator.clipboard.writeText`, with a fallback to a selectable text box. Format:

```
OPERATOR SCHEDULING — Month of November

PRAYER MEETING
• LIVE Wed 3:30 AM: Elij Cañaveral, Victor Toledo
• PLAYBACK Wed 5:30 PM: —
...
```

The order follows gathering type and schedule `order`. Operators within a schedule are listed in the order they were placed. Empty schedules show "—".

### 5.5 First-visit name gate

- On first load, if `localStorage.nickname` isn't set, a full-screen modal asks: *"What's your name or nickname?"* It requires 2–30 characters and is trimmed.
- The same modal also requires a work email (`localStorage.email`, trimmed and lower-cased, basic `name@domain.tld` check). If either is missing — including people who set a name before email was required — the modal shows and blocks the board. The email is sent with every change (`moved_by_email` on the sticky, `actor_email` in the history log) and shown in the History detail view.
- The name is saved in `localStorage` together with a random `clientId`.
- The name is sent with every change as `movedBy`. It's an honor system, not authentication.
- The name and email can be changed at any time from the top bar.

## 6. Realtime sync (Supabase)

- **First load:** `select * from assignments`.
- **Subscribe:** a Supabase Realtime channel on `assignments` (INSERT/UPDATE/DELETE).
- **Changes:**
  - add: `insert { operator_id, schedule_id, moved_by, client_id }`
  - move: `update set schedule_id = :to, moved_by, moved_at = now() where id = :id`
  - remove: `delete where id = :id`
- Every change is optimistic: the UI updates first, then rolls back with a toast on error (for example a unique-constraint violation, which shows "already in this duty").
- When a client reconnects or the tab becomes visible again, it refetches the full list to resync.
- **Abuse guard:** a client-side throttle of about 5 changes per second. Optionally, a Postgres trigger that rejects more than N writes per `client_id` per minute.

## 7. Project structure

```
mcgi-operators-board/
├─ deploy.sh                 # build + publish to GitHub Pages
├─ docs/PLAN.md
├─ tmp/                      # reference screenshots
├─ scripts/
│  └─ validate-config.ts    # UUID + reference checks (used by deploy.sh)
├─ supabase/schema.sql       # table + RLS + realtime (section 4.3)
├─ index.html
├─ vite.config.ts            # base: '/mcgi-operators-board/'
├─ .env.example              # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
├─ public/
│  ├─ operators.json
│  └─ schedule.json
└─ src/
   ├─ main.ts
   ├─ App.vue
   ├─ api/supabase.ts        # client, fetch, subscribe, add/move/remove
   ├─ store/board.ts
   ├─ styles/tokens.css
   └─ components/
      ├─ NameGate.vue
      ├─ TopBar.vue            # title, month, nickname, Copy schedule
      ├─ GroupHeader.vue
      ├─ DutyColumn.vue
      ├─ NameSticky.vue
      ├─ OperatorsPalette.vue   # desktop side panel / mobile bottom tray
      ├─ AssignSheet.vue        # tap fallback
      └─ TrashZone.vue
```

## 8. Deploy to GitHub Pages: `deploy.sh`

Create a `deploy.sh` at the repo root that builds the app and publishes `dist/` to the `gh-pages` branch.

Requirements for the script:
1. Use `set -euo pipefail` and run from the repo root.
2. Run `npm run validate:config` (UUIDs valid and unique, references resolve) and abort on failure.
3. Check that `.env` (or `.env.production`) contains `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, and abort with a clear message if not.
4. Refuse to deploy with uncommitted changes, unless `--force` is passed.
5. Run `npm ci && npm run build`. Vite `base` must be `/<repo-name>/`, for example `/mcgi-operators-board/`.
6. Add `dist/.nojekyll`, and copy `dist/index.html` to `dist/404.html` as a safe SPA fallback.
7. Publish `dist/` to the `gh-pages` branch. Use `npx gh-pages -d dist -t` (the `-t` includes dotfiles), or a `git worktree` with a force-push if we want to avoid the dependency.
8. Print the live URL: `https://<github-user>.github.io/mcgi-operators-board/`.

Sketch:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

[[ "${1:-}" == "--force" ]] || git diff --quiet || { echo "Uncommitted changes. Commit or use --force."; exit 1; }
envs=$(cat .env .env.production 2>/dev/null || true)
grep -q VITE_SUPABASE_URL <<<"$envs" && grep -q VITE_SUPABASE_ANON_KEY <<<"$envs" \
  || { echo "Missing Supabase env vars in .env"; exit 1; }

npm ci
npm run validate:config
npm run build
touch dist/.nojekyll
cp dist/index.html dist/404.html

npx gh-pages -d dist -t -m "deploy: $(git rev-parse --short HEAD)"

repo=$(basename -s .git "$(git remote get-url origin)")
user=$(git remote get-url origin | sed -E 's#.*[:/]([^/]+)/[^/]+$#\1#')
echo "Deployed: https://${user}.github.io/${repo}/"
```

One-time setup: in the GitHub repo, go to **Settings → Pages → Source** and choose the `gh-pages` branch, `/ (root)` folder.

## 9. Milestones

1. **Scaffold:** Vite + Vue + TS, design tokens, config loading, and a static render of the locked layout (desktop + mobile).
2. **Local drag & drop:** clone from the palette, move, remove and the duplicate guard, using in-memory state. Test on real iOS Safari and Android Chrome.
3. **Name gate**, plus `moved_by` / `client_id` metadata.
4. **Supabase:** schema, RLS, and the fetch, subscribe and change calls.
5. **Realtime wiring:** optimistic updates, rollback and resync.
6. **Copy as text** export.
7. **Mobile polish:** long-press timing, auto-scroll, haptics (`navigator.vibrate`), tap fallback sheet and safe-area insets.
8. **Deploy:** `deploy.sh`, GitHub Pages setup and a short README.

## 10. Acceptance criteria

- On a 375px-wide phone, a user can long-press a name, drag it into any duty and see it appear on a second device within about 1 second.
- The same operator can be placed in 3 different duties. A second drop into the same duty is rejected.
- Nobody can move, rename or delete headers or columns.
- Renaming a gathering type, or changing a schedule's day, time, mode or order in `schedule.json`, then redeploying keeps every note on it.
- Renaming an operator in `operators.json` keeps all their stickies.
- "Copy schedule" puts a correctly ordered text summary on the clipboard on iOS Safari and Android Chrome.
- Removing a schedule's entry hides its notes, and removing a gathering type hides all of its schedules' notes. Restoring the same UUID brings them back.
- `deploy.sh` aborts if `schedule.json` has a duplicate or invalid UUID, or a `gatheringTypeId` that doesn't exist.
- Editing `public/operators.json` and running `./deploy.sh` changes the palette without touching existing assignments. Assignments for removed operators are hidden.
- `./deploy.sh` publishes the app to GitHub Pages, and the live URL works on a phone.
- A first-time visitor can't interact until they've entered a nickname. Returning visitors skip the prompt.
- Lighthouse mobile performance is at least 90, and the JS bundle is under 100 KB gzipped.

## 11. Decisions

| Topic | Decision |
|---|---|
| Removing stickies | Anyone can remove any sticky |
| Operators per schedule | No limit |
| Monthly reset | Never. One continuous board; stickies are cleared manually. `month` is a display label only |
| Removed schedules, gathering types or operators | Their stickies stay hidden indefinitely and come back if the UUID is restored |
| IDs | UUIDs for gathering types, schedules and operators |
| Backend | Supabase (free tier) |
| Hosting | GitHub Pages on the personal account: `https://<username>.github.io/mcgi-operators-board/` |
| Export | "Copy schedule" as text |
