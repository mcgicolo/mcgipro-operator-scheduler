# MCGI Operators Board

A mobile-first, live-syncing version of the Miro **Operator Scheduling** board. Operators drag their name stickies under the duty they'll take, and everyone sees the change right away.

- Vue 3 + Vite + TypeScript, with plain CSS
- Supabase (Postgres + Realtime) for shared state
- Static hosting on GitHub Pages

The full design is in [docs/PLAN.md](docs/PLAN.md).

## Run locally

```bash
npm install
npm run dev
```

- With `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set in `.env`, the board uses Supabase.
- With them empty, it runs in **demo mode**: changes are saved in this browser and synced between its tabs, with no backend.
- To use demo mode without editing `.env`, run `VITE_SUPABASE_URL= npm run dev`.

`npm run dev` also serves on your LAN IP, so you can open it on a phone on the same Wi-Fi.

## Local development with PostgreSQL

To test against a real database without touching Supabase, run the board on a local PostgreSQL. You need PostgreSQL running on your machine, for example `brew install postgresql@18 && brew services start postgresql@18`.

```bash
npm run db:setup   # creates the mcgi_board database and applies db/local-schema.sql (safe to re-run)
npm run dev:pg     # vite --mode pg, which loads .env.pg
```

The status pill shows **Live · local DB**. A dev-only Vite plugin (`server/pgDevApi.ts`) serves a small REST and Server-Sent Events API at `/mcgipro-operator-scheduler/api/` and uses Postgres `LISTEN/NOTIFY` to push changes, so tabs and phones on your LAN stay in sync.

- **Use another database.** `.env.pg` points at `postgres://localhost:5432/mcgi_board`. Override `DATABASE_URL` in `.env.pg.local` or inline, as in `DATABASE_URL=postgres://user@host/db npm run dev:pg`. `db:setup` only targets `mcgi_board`, so apply the schema yourself with `psql -d <db> -f db/local-schema.sql`.
- **Existing local database.** Run `npm run db:setup` again to add the history table.
- **Reset the board.** Run `psql -d mcgi_board -c 'truncate assignments, assignment_events'` (this clears the history too).
- **Dev only.** This backend exists only under `vite` dev. Production builds never include it, and the deployed site still uses Supabase.

The backend is picked at startup, first match wins:

| Mode | How it's chosen | Data lives in |
|---|---|---|
| Local PostgreSQL | `VITE_BACKEND=postgres` in dev (`npm run dev:pg`) | Your local `mcgi_board` database |
| Supabase | `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` set | The Supabase project |
| Demo | Neither of the above | This browser's localStorage |

## One-time Supabase setup

1. Open the project in the Supabase dashboard and go to **SQL Editor**.
2. Paste and run [`supabase/schema.sql`](supabase/schema.sql). It creates the `assignments` table, the RLS policy, realtime publishing, a write rate-limit trigger and the append-only `assignment_events` history table (with its logging trigger and the `remove_assignment` function).
3. Copy the **Project URL** and the **anon public** key from **Project Settings → API** into `.env`.

**Existing projects:** re-run `supabase/schema.sql` to get History. It is safe to re-run. Until you do, the board works as before and History shows "History Isn't Set Up".

## History (paper trail)

Every add, move and remove is logged, so you can see who changed what and when.

- **Open it** with the **History** button in the top bar. A red badge counts changes by others since you last looked.
- **Find things** with the search box and the All / Added / Moved / Removed filter. Entries are grouped by day, newest first.
- **Tap a row** for its details and that sticky's whole trail, with a **Show on Board** button. A sticky's own sheet has **View History** too.
- **Quick series are merged.** Adds or moves of one sticky by the same person within 5 minutes show as one row.
- **Read-only.** Entries can't be edited or deleted from the app, because the anon key can only read the history table.
- In demo mode the log lives in this browser and keeps the last 500 entries.

## Changing the board

The layout is locked and can only be changed by editing these JSON files and redeploying:

| File | What it controls |
|---|---|
| `public/schedule.json` | Title, month label, instructions, gathering types and schedules |
| `public/operators.json` | Operator names and sticky colors |

Every entry has a permanent UUID, and stickies are attached to UUIDs:

- **Rename or retime freely.** Changing a name, color, day, time, mode or order keeps every sticky in place.
- **Never change or reuse an `id`.** To add an entry, generate a new one with `uuidgen | tr A-Z a-z`.
- **Removing an entry hides its stickies.** They come back if the same `id` is restored.
- **Check your edits** with `npm run validate:config`. `deploy.sh` runs it too.

## Deploy

```bash
./deploy.sh          # refuses if there are uncommitted changes
./deploy.sh --force  # deploys anyway
```

`deploy.sh` validates the config, checks the Supabase env vars, builds the app and publishes `dist/` to the `gh-pages` branch.

For the first deploy only, go to **GitHub → Settings → Pages → Source** and pick branch `gh-pages`, folder `/ (root)`.

The board will be live at `https://mcgicolo.github.io/mcgipro-operator-scheduler/` (repo: [github.com/mcgicolo/mcgipro-operator-scheduler](https://github.com/mcgicolo/mcgipro-operator-scheduler)).
