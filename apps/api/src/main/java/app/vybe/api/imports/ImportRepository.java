package app.vybe.api.imports;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;

@Repository
public class ImportRepository {

    /** One imported track as stored. {@code id} is the bare id; the song id is {@code "im_" + id}. */
    public record Row(String id, String userId, String title, String artist, String album, String albumArtist,
                      int trackNumber, int discNumber, Integer year, String genre, long durationMs,
                      String fileExt, String mime, long sizeBytes, boolean hasArt, String bgColor,
                      String textColor1, String textColor2, String textColor3, String createdAt, Double gainDb) {
    }

    private static final String COLUMNS = """
            id, user_id, title, artist, album, album_artist, track_number, disc_number, year, genre, duration_ms,
            file_ext, mime, size_bytes, has_art, bg_color, text_color1, text_color2, text_color3, created_at, gain_db""";

    private final JdbcTemplate jdbc;

    public ImportRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void insert(Row r) {
        jdbc.update("INSERT INTO imported_tracks (" + COLUMNS + ") VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                r.id(), r.userId(), r.title(), r.artist(), r.album(), r.albumArtist(), r.trackNumber(),
                r.discNumber(), r.year(), r.genre(), r.durationMs(), r.fileExt(), r.mime(), r.sizeBytes(),
                r.hasArt() ? 1 : 0, r.bgColor(), r.textColor1(), r.textColor2(), r.textColor3(), r.createdAt(), r.gainDb());
    }

    /** The row only when it belongs to {@code userId}. */
    public Optional<Row> findOwned(String userId, String id) {
        return jdbc.query("SELECT " + COLUMNS + " FROM imported_tracks WHERE id = ? AND user_id = ?",
                (rs, i) -> map(rs), id, userId).stream().findFirst();
    }

    /** Newest first. */
    public List<Row> findByUser(String userId) {
        return jdbc.query("SELECT " + COLUMNS + " FROM imported_tracks WHERE user_id = ? ORDER BY created_at DESC, id DESC",
                (rs, i) -> map(rs), userId);
    }

    /** Bytes of imported audio stored for one user. */
    public long usedBytes(String userId) {
        Long n = jdbc.queryForObject("SELECT COALESCE(SUM(size_bytes), 0) FROM imported_tracks WHERE user_id = ?", Long.class, userId);
        return n == null ? 0 : n;
    }

    /** Bytes of imported audio stored across all users (bounded by the storage plan). */
    public long usedBytesAll() {
        Long n = jdbc.queryForObject("SELECT COALESCE(SUM(size_bytes), 0) FROM imported_tracks", Long.class);
        return n == null ? 0 : n;
    }

    public boolean isDuplicate(String userId, long sizeBytes, String title, String artist) {
        Integer n = jdbc.queryForObject("""
                SELECT COUNT(*) FROM imported_tracks
                WHERE user_id = ? AND size_bytes = ? AND lower(title) = lower(?) AND lower(artist) = lower(?)
                """, Integer.class, userId, sizeBytes, title, artist);
        return n != null && n > 0;
    }

    public void delete(String userId, String id) {
        jdbc.update("DELETE FROM imported_tracks WHERE id = ? AND user_id = ?", id, userId);
    }

    /** Removes a song id from the user's library, loves and history. */
    public void purgeSongReferences(String userId, String songId) {
        jdbc.update("DELETE FROM library_items WHERE user_id = ? AND type = 'song' AND item_id = ?", userId, songId);
        jdbc.update("DELETE FROM loves WHERE user_id = ? AND type = 'song' AND item_id = ?", userId, songId);
        jdbc.update("DELETE FROM play_history WHERE user_id = ? AND song_id = ?", userId, songId);
    }

    /** Ids of playlists (any owner) that contain {@code songId}. */
    public List<String> playlistsContaining(String songId) {
        return jdbc.queryForList("SELECT DISTINCT playlist_id FROM user_playlist_tracks WHERE song_id = ?",
                String.class, songId);
    }

    private static Row map(ResultSet rs) throws SQLException {
        int year = rs.getInt("year");
        Integer yearOrNull = rs.wasNull() ? null : year;
        return new Row(rs.getString("id"), rs.getString("user_id"), rs.getString("title"), rs.getString("artist"),
                rs.getString("album"), rs.getString("album_artist"), rs.getInt("track_number"),
                rs.getInt("disc_number"), yearOrNull, rs.getString("genre"), rs.getLong("duration_ms"),
                rs.getString("file_ext"), rs.getString("mime"), rs.getLong("size_bytes"), rs.getInt("has_art") == 1,
                rs.getString("bg_color"), rs.getString("text_color1"), rs.getString("text_color2"),
                rs.getString("text_color3"), rs.getString("created_at"),
                rs.getObject("gain_db") == null ? null : rs.getDouble("gain_db"));
    }
}
