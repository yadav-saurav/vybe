package app.vybe.api.library;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public class LibraryRepository {

    /** A library or love membership row. {@code at} is the ISO timestamp it was added or loved. */
    public record Ref(String type, String id, String at) {
    }

    private final JdbcTemplate jdbc;

    public LibraryRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Idempotent: re-adding keeps the original date. */
    public void addItem(String userId, String type, String id, String addedAt) {
        jdbc.update("INSERT INTO library_items (user_id, type, item_id, added_at) VALUES (?,?,?,?) ON CONFLICT DO NOTHING",
                userId, type, id, addedAt);
    }

    public void removeItem(String userId, String type, String id) {
        jdbc.update("DELETE FROM library_items WHERE user_id = ? AND type = ? AND item_id = ?", userId, type, id);
    }

    /** Library rows of one type, newest first. */
    public List<Ref> items(String userId, String type) {
        return jdbc.query("""
                SELECT type, item_id, added_at FROM library_items
                WHERE user_id = ? AND type = ? ORDER BY added_at DESC, item_id
                """, (rs, i) -> new Ref(rs.getString("type"), rs.getString("item_id"), rs.getString("added_at")),
                userId, type);
    }

    /** Library rows of every type, newest first. */
    public List<Ref> allItems(String userId) {
        return jdbc.query("""
                SELECT type, item_id, added_at FROM library_items
                WHERE user_id = ? ORDER BY added_at DESC, item_id
                """, (rs, i) -> new Ref(rs.getString("type"), rs.getString("item_id"), rs.getString("added_at")),
                userId);
    }

    public void addLove(String userId, String type, String id, String lovedAt) {
        jdbc.update("INSERT INTO loves (user_id, type, item_id, loved_at) VALUES (?,?,?,?) ON CONFLICT DO NOTHING",
                userId, type, id, lovedAt);
    }

    public void removeLove(String userId, String type, String id) {
        jdbc.update("DELETE FROM loves WHERE user_id = ? AND type = ? AND item_id = ?", userId, type, id);
    }

    /** Loves of every type, newest first. */
    public List<Ref> loves(String userId) {
        return jdbc.query("""
                SELECT type, item_id, loved_at FROM loves
                WHERE user_id = ? ORDER BY loved_at DESC, item_id
                """, (rs, i) -> new Ref(rs.getString("type"), rs.getString("item_id"), rs.getString("loved_at")),
                userId);
    }
}
