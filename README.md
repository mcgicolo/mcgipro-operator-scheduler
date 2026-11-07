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

## One-time Supabase setup

1. Open the project in the Supabase dashboard and go to **SQL Editor**.
2. Paste and run [`supabase/schema.sql`](supabase/schema.sql). It creates the `assignments` table, the RLS policy, realtime publishing and a write rate-limit trigger.
3. Copy the **Project URL** and the **anon public** key from **Project Settings → API** into `.env`.

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

The board will be live at `https://<github-user>.github.io/mcgipro-operator-scheduler/`.
