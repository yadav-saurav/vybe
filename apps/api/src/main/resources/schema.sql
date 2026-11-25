-- Vybe persistence schema. Idempotent: applied on every startup.

CREATE TABLE IF NOT EXISTS users (
    id             TEXT PRIMARY KEY,
    email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash  TEXT NOT NULL,
    display_name   TEXT NOT NULL,
    avatar_color   TEXT NOT NULL,
    created_at     TEXT NOT NULL
);

-- Session tokens are stored hashed (SHA-256); the raw token only lives in the cookie.
CREATE TABLE IF NOT EXISTS sessions (
    token_hash  TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL,
    expires_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- Library membership (song | album | playlist | artist). Adding a song or album stores its row here.
CREATE TABLE IF NOT EXISTS library_items (
    user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type      TEXT NOT NULL,
    item_id   TEXT NOT NULL,
    added_at  TEXT NOT NULL,
    PRIMARY KEY (user_id, type, item_id)
);
CREATE INDEX IF NOT EXISTS idx_library_user_type_added ON library_items(user_id, type, added_at);

-- Favorites. Loving an item also adds it to the library.
CREATE TABLE IF NOT EXISTS loves (
    user_id   TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type      TEXT NOT NULL,
    item_id   TEXT NOT NULL,
    loved_at  TEXT NOT NULL,
    PRIMARY KEY (user_id, type, item_id)
);

CREATE TABLE IF NOT EXISTS play_history (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    song_id       TEXT NOT NULL,
    played_at     TEXT NOT NULL,
    played_ms     INTEGER NOT NULL DEFAULT 0,
    context_type  TEXT,
    context_id    TEXT
);
CREATE INDEX IF NOT EXISTS idx_history_user_time ON play_history(user_id, played_at);

CREATE TABLE IF NOT EXISTS user_playlists (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    is_public    INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_playlists_user ON user_playlists(user_id);

-- One row per position; duplicates allowed. Positions are contiguous from 0.
CREATE TABLE IF NOT EXISTS user_playlist_tracks (
    playlist_id  TEXT NOT NULL REFERENCES user_playlists(id) ON DELETE CASCADE,
    position     INTEGER NOT NULL,
    song_id      TEXT NOT NULL,
    PRIMARY KEY (playlist_id, position)
);
