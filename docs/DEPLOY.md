# Deploying Vybe (free): Render + Neon + Supabase

| Piece | Service | What it holds |
|---|---|---|
| App (API + website) | **Render**, free web service, Docker | Nothing persistent: the disk is wiped on each restart |
| Database | **Neon**, free Postgres | Users, library, playlists, history, imports metadata |
| Files | **Supabase Storage**, free | `vybe-catalog` (public): Vybe's generated audio and artwork. `vybe-imports` (private): each user's own uploads |

Free-tier limits change, so check each provider's current terms.
**Only Vybe's own generated catalog, or music you have the rights to publish, may go in the public bucket.**
Users' imported songs stay in the private bucket and play only for their owner, through short-lived signed links.

## 1. Neon (database)
1. Create a project at neon.tech.
2. Copy the **connection string**: `postgresql://USER:PASSWORD@HOST/DB?sslmode=require`.

The API creates its tables on first start.

## 2. Supabase (files)
1. Create a project at supabase.com.
2. In **Project Settings → API**, copy the **Project URL** and the **`service_role` key**. The `service_role` key is a secret: never put it in the frontend or in git.
3. Upload the catalog from your machine. Run each step from the repo root:

   Generate the catalog first, if you haven't already:
   ```bash
   npm run generate:catalog
   ```
   Then upload it:
   ```bash
   SUPABASE_URL=https://YOUR-PROJECT.supabase.co SUPABASE_SERVICE_KEY=YOUR-SERVICE-ROLE-KEY python3 scripts/upload_media_to_supabase.py
   ```

   This creates the public `vybe-catalog` and private `vybe-imports` buckets, uploads about 900 MB and prints your `VYBE_MEDIA_BASE_URL`.

## 3. Render (app)
1. Push this repo to GitHub.
2. In Render, choose **New → Blueprint**, pick the repo, and Render reads `render.yaml`.
3. Fill in the secret values when asked:

| Variable | Value |
|---|---|
| `VYBE_DATABASE_URL` | the Neon connection string |
| `VYBE_MEDIA_BASE_URL` | `https://YOUR-PROJECT.supabase.co/storage/v1/object/public/vybe-catalog` |
| `SUPABASE_URL` | `https://YOUR-PROJECT.supabase.co` |
| `SUPABASE_SERVICE_KEY` | the `service_role` key |

4. Deploy. Your site is at `https://vybe-XXXX.onrender.com`; sign in with `demo@vybe.app` / `vybe1234`.

## 4. Keep it awake (optional)
Render's free tier sleeps after about 15 minutes with no traffic, and the next visit then waits about a minute.
To avoid that, create a free job at cron-job.org that requests `https://YOUR-APP.onrender.com/api/health` every 10 minutes.
Neon and Supabase may still pause after long inactivity; they wake on the next request.

## How it works
- `VYBE_DATABASE_URL` set: the API uses Postgres (`schema-postgres.sql`). Unset, it uses local SQLite.
- `VYBE_MEDIA_BASE_URL` set: `/api/stream/{id}` and `/media/art/{file}` redirect (302) to the public bucket. The browser then streams directly from Supabase's CDN, with seeking supported.
- `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` set: imports are uploaded to `vybe-imports`, and playback redirects to a 2-hour signed URL that only the owner receives.
- Running locally with none of these set behaves exactly as before.
