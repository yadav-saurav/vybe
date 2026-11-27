# Deploying Vybe (free): Render + Neon + Supabase

| Piece | Service | What it holds |
|---|---|---|
| App (API + website) | **Render**, free web service, Docker | Nothing persistent: the disk is wiped on each restart |
| Database | **Neon**, free Postgres | Users, library, playlists, history, imports metadata |
| Files | **Supabase Storage**, free | `vybe-imports` (private): user data only. Music streams from the worldwide catalogue, not from storage |

Free-tier limits change, so check each provider's current terms.
Vybe hosts no music files: every song is streamed from the worldwide catalogue at play time.

## 1. Neon (database)
1. Create a project at neon.tech.
2. Copy the **connection string**: `postgresql://USER:PASSWORD@HOST/DB?sslmode=require`.

The API creates its tables on first start.

## 2. Supabase (files)
1. Create a project at supabase.com.
2. In **Project Settings → API**, copy the **Project URL** and the **`service_role` key**. The `service_role` key is a secret: never put it in the frontend or in git.
3. Nothing to upload: Vybe plays worldwide songs at runtime, so there is no music catalogue to generate or store.
   Only the private `vybe-imports` bucket is used (for user data).

## 3. Render (app)
1. Push this repo to GitHub.
2. In Render, choose **New → Blueprint**, pick the repo, and Render reads `render.yaml`.
3. Fill in the secret values when asked:

| Variable | Value |
|---|---|
| `VYBE_DATABASE_URL` | the Neon connection string |
| `SUPABASE_URL` | `https://YOUR-PROJECT.supabase.co` |
| `SUPABASE_SERVICE_KEY` | the `service_role` key |

4. Deploy. Your site is at `https://vybe-XXXX.onrender.com`; sign in with `demo@vybe.app` / `vybe1234`.

## 4. Keep it awake (optional)
Render's free tier sleeps after about 15 minutes with no traffic, and the next visit then waits about a minute.
To avoid that, create a free job at cron-job.org that requests `https://YOUR-APP.onrender.com/api/health` every 10 minutes.
Neon and Supabase may still pause after long inactivity; they wake on the next request.

## How it works
- `VYBE_DATABASE_URL` set: the API uses Postgres (`schema-postgres.sql`). Unset, it uses local SQLite.
- `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` set: imports are uploaded to `vybe-imports`, and playback redirects to a 2-hour signed URL that only the owner receives.
- Running locally with none of these set behaves exactly as before.
