package app.vybe.api.history;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Repository
public class HistoryRepository {

    /** One play, as stored. */
    public record PlayRow(String songId, String playedAt, String contextType, String contextId, int playedMs) {
    }

    private final JdbcTemplate jdbc;

    public HistoryRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public void deleteAll(String userId) {
        jdbc.update("DELETE FROM play_history WHERE user_id = ?", userId);
    }

    public void insert(String userId, String songId, String playedAt, int playedMs,
                       String contextType, String contextId) {
        jdbc.update("""
                INSERT INTO play_history (user_id, song_id, played_at, played_ms, context_type, context_id)
                VALUES (?,?,?,?,?,?)
                """, userId, songId, playedAt, playedMs, contextType, contextId);
    }

    /** Newest first. */
    public List<PlayRow> recent(String userId, int limit) {
        return jdbc.query("""
                SELECT song_id, played_at, played_ms, context_type, context_id
                FROM play_history WHERE user_id = ?
                ORDER BY played_at DESC, id DESC LIMIT ?
                """, (rs, i) -> new PlayRow(rs.getString("song_id"), rs.getString("played_at"),
                rs.getString("context_type"), rs.getString("context_id"), rs.getInt("played_ms")), userId, limit);
    }

    /** Plays at or after {@code fromIso} (ISO-8601, lexically sortable), oldest first. */
    public List<PlayRow> since(String userId, String fromIso) {
        return jdbc.query("SELECT song_id, played_at, played_ms, context_type, context_id FROM play_history "
                        + "WHERE user_id = ? AND played_at >= ? ORDER BY played_at ASC, id ASC",
                (rs, i) -> new PlayRow(rs.getString("song_id"), rs.getString("played_at"),
                        rs.getString("context_type"), rs.getString("context_id"), rs.getInt("played_ms")),
                userId, fromIso);
    }

    /** Number of plays per song across all of the user's history. */
    public Map<String, Integer> playCounts(String userId) {
        Map<String, Integer> counts = new HashMap<>();
        jdbc.query("SELECT song_id, COUNT(*) AS n FROM play_history WHERE user_id = ? GROUP BY song_id",
                rs -> {
                    counts.put(rs.getString("song_id"), rs.getInt("n"));
                }, userId);
        return counts;
    }
}
