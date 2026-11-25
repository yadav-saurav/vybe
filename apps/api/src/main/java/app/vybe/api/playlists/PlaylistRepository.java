package app.vybe.api.playlists;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Repository
public class PlaylistRepository {

    /** A user playlist row (without its tracks). */
    public record Row(String id, String userId, String name, String description, boolean isPublic,
                      String createdAt, String updatedAt) {
    }

    private final JdbcTemplate jdbc;

    public PlaylistRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    private static final String SELECT = "SELECT id, user_id, name, description, is_public, created_at, updated_at FROM user_playlists";

    public void insert(Row r) {
        jdbc.update("INSERT INTO user_playlists (id, user_id, name, description, is_public, created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
                r.id(), r.userId(), r.name(), r.description(), r.isPublic() ? 1 : 0, r.createdAt(), r.updatedAt());
    }

    public void update(Row r) {
        jdbc.update("UPDATE user_playlists SET name = ?, description = ?, is_public = ?, updated_at = ? WHERE id = ?",
                r.name(), r.description(), r.isPublic() ? 1 : 0, r.updatedAt(), r.id());
    }

    public void touch(String id, String updatedAt) {
        jdbc.update("UPDATE user_playlists SET updated_at = ? WHERE id = ?", updatedAt, id);
    }

    public Optional<Row> find(String id) {
        return jdbc.query(SELECT + " WHERE id = ?", (rs, i) -> map(rs), id).stream().findFirst();
    }

    /** Newest first. */
    public List<Row> findByUser(String userId) {
        return jdbc.query(SELECT + " WHERE user_id = ? ORDER BY created_at DESC, id", (rs, i) -> map(rs), userId);
    }

    public List<String> trackIds(String playlistId) {
        return jdbc.query("SELECT song_id FROM user_playlist_tracks WHERE playlist_id = ? ORDER BY position",
                (rs, i) -> rs.getString("song_id"), playlistId);
    }

    /** Replaces the full ordered track list. Positions are rewritten contiguously from 0. */
    public void replaceTracks(String playlistId, List<String> trackIds) {
        jdbc.update("DELETE FROM user_playlist_tracks WHERE playlist_id = ?", playlistId);
        List<Object[]> rows = new ArrayList<>(trackIds.size());
        for (int i = 0; i < trackIds.size(); i++) {
            rows.add(new Object[]{playlistId, i, trackIds.get(i)});
        }
        if (!rows.isEmpty()) {
            jdbc.batchUpdate("INSERT INTO user_playlist_tracks (playlist_id, position, song_id) VALUES (?,?,?)", rows);
        }
    }

    public void delete(String id) {
        jdbc.update("DELETE FROM user_playlists WHERE id = ?", id);
    }

    private static Row map(java.sql.ResultSet rs) throws java.sql.SQLException {
        return new Row(rs.getString("id"), rs.getString("user_id"), rs.getString("name"),
                rs.getString("description"), rs.getInt("is_public") == 1,
                rs.getString("created_at"), rs.getString("updated_at"));
    }
}
