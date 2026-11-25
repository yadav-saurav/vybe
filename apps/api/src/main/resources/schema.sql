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

-- Audio files a user imported from their own computer. Private to the owner. Files live in
-- <imports-dir>/<user_id>/<id>.<file_ext> (and <id>.jpg when has_art = 1). Song id is "im_" || id.
CREATE TABLE IF NOT EXISTS imported_tracks (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title         TEXT NOT NULL,
    artist        TEXT NOT NULL,
    album         TEXT NOT NULL DEFAULT '',
    album_artist  TEXT NOT NULL DEFAULT '',
    track_number  INTEGER NOT NULL DEFAULT 0,
    disc_number   INTEGER NOT NULL DEFAULT 0,
    year          INTEGER,
    genre         TEXT NOT NULL DEFAULT '',
    duration_ms   INTEGER NOT NULL DEFAULT 0,
    file_ext      TEXT NOT NULL,
    mime          TEXT NOT NULL,
    size_bytes    INTEGER NOT NULL,
    has_art       INTEGER NOT NULL DEFAULT 0,
    bg_color      TEXT NOT NULL,
    text_color1   TEXT NOT NULL,
    text_color2   TEXT NOT NULL,
    text_color3   TEXT NOT NULL,
    created_at    TEXT NOT NULL,
    gain_db       REAL
);
CREATE INDEX IF NOT EXISTS idx_imported_tracks_user ON imported_tracks(user_id, created_at);

-- Listener-to-listener follows (profiles, friend activity).
CREATE TABLE IF NOT EXISTS user_follows (
    follower_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    followee_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at   TEXT NOT NULL,
    PRIMARY KEY (follower_id, followee_id)
);
CREATE INDEX IF NOT EXISTS idx_user_follows_followee ON user_follows(followee_id);
