# Vybe API

Backend for Vybe, the music streaming web app. Java 21 bytecode, Spring Boot 3.5, Spring MVC, JdbcTemplate
and SQLite. It implements the HTTP contract in `packages/shared/src/index.ts` and listens on
`127.0.0.1:4000`. Vite proxies `/api` and `/media` to it during development.

## Running

Requirements: JDK 21 or newer (built and tested with JDK 25), Maven Central access. `./mvnw` is included.

```bash
cd apps/api
./mvnw -q spring-boot:run                      # dev server on :4000
./mvnw -q -DskipTests package                  # builds target/vybe-api.jar
java -jar target/vybe-api.jar                  # production-style run
./mvnw test                                    # JUnit 5 + MockMvc suite (fixture catalog, temp DB)
```

The catalog must exist before startup. Generate it with `python3 scripts/generate_catalog.py` (writes
`data/catalog.json`, `data/lyrics.json` and `data/media/`). If `catalog.json` is missing, the application
fails fast with a message that says so.

On first start with an empty database, the demo account `demo@vybe.app` / `vybe1234` (display name "Alex") is
seeded. It has about 40 library songs, 8 albums, 4 editorial playlists, 2 user playlists, some loves and 120
plays spread over the last 30 days. The seed is deterministic for a given catalog.

## Configuration

| Property | Env var | Default | Meaning |
| --- | --- | --- | --- |
| `server.port` | `PORT` | `4000` | HTTP port |
| `server.address` | | `127.0.0.1` | bind address |
| `vybe.data-dir` | `VYBE_DATA_DIR` | `../../data` | catalog.json, lyrics.json, media/art, media/audio (resolved to an absolute path) |
| `vybe.db-path` | `VYBE_DB_PATH` | `../../data/vybe.db` | SQLite database file (created if missing) |
| `vybe.autoseed` | `VYBE_AUTOSEED` | `true` | seed the demo user when the database has no users |

Relative paths resolve against the working directory. Run from `apps/api` (the default) or set the env vars.

## Architecture

```
app.vybe.api
├── model        records mirroring the TS types (camelCase JSON; NON_NULL inclusion)
├── config       VybeProperties, SQLite DataSource (WAL, busy_timeout, one connection), CORS, Jackson
├── catalog      CatalogStore (immutable catalog and indexes loaded once), CatalogService (song, album, artist)
├── search       TextNormalizer (NFKD, diacritics, typo check), SearchService (ranking, suggestions)
├── discover     PageService (home, new, radio, genre rooms), Similarity (autoplay, similar artists/albums),
│                StationService (endless stations), PersonalMixService (Made For You mixes)
├── library      LibraryService + LibraryRepository (library, loves, recently added)
├── playlists    PlaylistService + PlaylistRepository (editorial, personal-mix and user playlists)
├── history      HistoryService + HistoryRepository (play history)
├── auth         AuthService (BCrypt, opaque session tokens), @CurrentUser resolver, UserRepository
├── media        MediaService + MediaController (artwork variants, audio with HTTP Range)
├── seed         DemoSeeder
├── web          REST controllers
└── error        ApiException + GlobalExceptionHandler ({"error":{"code","message"}} envelope)
```

Resources: `schema.sql` (idempotent `CREATE TABLE IF NOT EXISTS`, applied on startup) and `application.properties`.

Key decisions:

- **Catalog in memory.** All catalog reads come from immutable maps and pre-computed indexes (songs by artist,
  album, genre; albums by artist and genre; editorial playlists by artist; popularity orders). SQLite only holds
  user data, so page endpoints do not touch the database. Anonymous Home, New and Radio are built at startup
  and cached.
- **SQLite tuning.** A single-connection Hikari pool (SQLite writers are serialized), WAL journal mode,
  `busy_timeout=5000` and `foreign_keys=ON`, all set on the JDBC URL. Writes run in `@Transactional` methods.
- **Sessions.** The cookie `vybe_session` holds a random 32-byte token. The database stores only its SHA-256 hash,
  with a 30-day expiry. The cookie is httpOnly, SameSite=Lax and Path=/.
- **Search.** Documents and their tokens are built at startup. Ranking tiers are exact name (100), name prefix (80),
  every query token matched exactly or by prefix (60), typo-tolerant match (40; query and name tokens of 4+ characters
  may differ by one Damerau edit), and description or bio match (10). Popularity adds up to 10.
- **Similarity.** Score = same genre, shared artist, BPM closeness, same mood, energy closeness and popularity, plus a
  small deterministic jitter derived from the two ids. Autoplay and station results cap each primary artist.
- **Media.** `/media/art/{file}` whitelists file names by pattern and checks that the resolved path stays inside
  `media/art`. `?w=` picks `_160` (w <= 160), `_400` (w <= 400) or the full file. `/api/stream/{songId}` returns a
  `Resource`, so Spring MVC handles Range: 206 with Content-Range, 200 without, 416 when unsatisfiable.

## Endpoints

Every endpoint in the contract is implemented. In addition, `GET /api/health` returns `{ok: true}`.
Protected endpoints (`/api/me/**`) return 401 when anonymous. Playlist writes that target another user's
playlist return 403.

Notes beyond the contract:

- `POST /api/auth/signup` and `/signin` return 200 with `{user}`, like the other endpoints.
- `PUT/DELETE /api/me/loves/artist/:id` is accepted, in addition to song, album and playlist.
- `PUT /api/me/library/playlist/:id` only accepts editorial playlists. Own playlists are already in `playlistIds`.
- Personal mix ids are `pl_mix_favorites_<userId>`, `pl_mix_discovery_<userId>`, `pl_mix_chill_<userId>` and
  `pl_mix_newmusic_<userId>`.
- A private user playlist returns 404 to anyone except its owner. Its owner gets 200.
- Hero shelves also list their cards' items in `items`, so clients that read `items` still work.

## Errors

| Status | code | When |
| --- | --- | --- |
| 400 | `validation_failed` | body fails bean validation |
| 400 | `invalid_request` | malformed JSON or missing parameter |
| 400 | `invalid_type`, `unknown_track`, `unknown_song`, `invalid_position`, `invalid_name`, `playlist_too_long` | business validation |
| 401 | `unauthorized`, `invalid_credentials` | anonymous, or wrong email or password |
| 403 | `forbidden` | editing another user's playlist |
| 404 | `not_found` | unknown song, album, artist, playlist, station, genre, art, audio, lyrics, track position |
| 409 | `email_taken` | signup with an existing email |
| 416 | (Spring) | unsatisfiable `Range` on `/api/stream/...` |

## Tests

`src/test/resources/fixtures` holds a small deterministic catalog (3 genres, 4 artists, 4 albums, 12 songs, 3 playlists,
4 stations, lyrics), two short AAC files and tiny webp art at three sizes. The tests use it with a temp SQLite file.
Coverage: auth, library, loves, history, every page shape, personal mixes, search ranking and typos, playlist CRUD with
reorder and 403, Range streaming (206, 416), art variants and traversal, autoplay and station exclusions, and the
demo seed.
