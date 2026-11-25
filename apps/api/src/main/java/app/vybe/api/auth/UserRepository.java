package app.vybe.api.auth;

import app.vybe.api.model.User;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.List;
import java.util.Optional;

@Repository
class UserRepository {

    /** A user row plus the password hash, which never leaves this package. */
    record StoredUser(User user, String passwordHash) {
    }

    private static final RowMapper<User> USER_ROW = UserRepository::mapUser;

    private final JdbcTemplate jdbc;

    UserRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    long count() {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM users", Long.class);
        return n == null ? 0 : n;
    }

    void insert(User user, String passwordHash) {
        jdbc.update("INSERT INTO users (id, email, password_hash, display_name, avatar_color, created_at) VALUES (?,?,?,?,?,?)",
                user.id(), user.email(), passwordHash, user.displayName(), user.avatarColor(), user.createdAt());
    }

    Optional<StoredUser> findStoredByEmail(String email) {
        try {
            return Optional.ofNullable(jdbc.queryForObject(
                    "SELECT id, email, display_name, avatar_color, created_at, password_hash FROM users WHERE email = ?",
                    (rs, i) -> new StoredUser(mapUser(rs, i), rs.getString("password_hash")), email));
        } catch (EmptyResultDataAccessException e) {
            return Optional.empty();
        }
    }

    Optional<User> findById(String id) {
        List<User> rows = jdbc.query(
                "SELECT id, email, display_name, avatar_color, created_at FROM users WHERE id = ?", USER_ROW, id);
        return rows.stream().findFirst();
    }

    boolean emailExists(String email) {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE email = ?", Long.class, email);
        return n != null && n > 0;
    }

    void insertSession(String tokenHash, String userId, String createdAt, String expiresAt) {
        jdbc.update("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)",
                tokenHash, userId, createdAt, expiresAt);
    }

    /** Resolves a live (unexpired) session to its user. */
    Optional<User> findUserBySession(String tokenHash, String nowIso) {
        List<User> rows = jdbc.query("""
                SELECT u.id, u.email, u.display_name, u.avatar_color, u.created_at
                FROM sessions s JOIN users u ON u.id = s.user_id
                WHERE s.token_hash = ? AND s.expires_at > ?
                """, USER_ROW, tokenHash, nowIso);
        return rows.stream().findFirst();
    }

    void deleteSession(String tokenHash) {
        jdbc.update("DELETE FROM sessions WHERE token_hash = ?", tokenHash);
    }

    boolean shareActivity(String userId) {
        Integer v = jdbc.query("SELECT share_activity FROM users WHERE id = ?", (rs, n) -> rs.getInt(1), userId)
                .stream().findFirst().orElse(0);
        return v != null && v == 1;
    }

    void setShareActivity(String userId, boolean share) {
        jdbc.update("UPDATE users SET share_activity = ? WHERE id = ?", share ? 1 : 0, userId);
    }

    /** Followed listeners who have opted in to sharing, most recently followed first (capped). */
    java.util.List<UserRow> sharingFollowees(String followerId, int limit) {
        return jdbc.query("""
                SELECT u.id, u.display_name, u.avatar_color FROM user_follows f JOIN users u ON u.id = f.followee_id
                WHERE f.follower_id = ? AND u.share_activity = 1 ORDER BY f.created_at DESC LIMIT ?
                """, (rs, n) -> new UserRow(rs.getString(1), rs.getString(2), rs.getString(3)), followerId, limit);
    }

    record UserRow(String id, String displayName, String avatarColor) { }

    Optional<String> passwordHash(String id) {
        return jdbc.query("SELECT password_hash FROM users WHERE id = ?", (rs, n) -> rs.getString(1), id).stream().findFirst();
    }

    void updatePasswordHash(String id, String hash) {
        jdbc.update("UPDATE users SET password_hash = ? WHERE id = ?", hash, id);
    }

    /** Signs the user out everywhere except the session identified by {@code keepTokenHash}. */
    void deleteOtherSessions(String userId, String keepTokenHash) {
        jdbc.update("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?", userId, keepTokenHash);
    }

    /** Foreign keys cascade to sessions, library, loves, history, playlists, imports and follows. */
    void deleteUser(String id) {
        jdbc.update("DELETE FROM users WHERE id = ?", id);
    }

    void updateProfile(String id, String displayName, String avatarColor) {
        jdbc.update("UPDATE users SET display_name = ?, avatar_color = ? WHERE id = ?", displayName, avatarColor, id);
    }

    void follow(String followerId, String followeeId, String at) {
        jdbc.update("INSERT INTO user_follows (follower_id, followee_id, created_at) VALUES (?,?,?) ON CONFLICT DO NOTHING",
                followerId, followeeId, at);
    }

    void unfollow(String followerId, String followeeId) {
        jdbc.update("DELETE FROM user_follows WHERE follower_id = ? AND followee_id = ?", followerId, followeeId);
    }

    long followers(String userId) {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM user_follows WHERE followee_id = ?", Long.class, userId);
        return n == null ? 0 : n;
    }

    long following(String userId) {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM user_follows WHERE follower_id = ?", Long.class, userId);
        return n == null ? 0 : n;
    }

    boolean isFollowing(String followerId, String followeeId) {
        Long n = jdbc.queryForObject("SELECT COUNT(*) FROM user_follows WHERE follower_id = ? AND followee_id = ?",
                Long.class, followerId, followeeId);
        return n != null && n > 0;
    }

    java.util.List<String> followingIds(String userId) {
        return jdbc.queryForList("SELECT followee_id FROM user_follows WHERE follower_id = ? ORDER BY created_at DESC",
                String.class, userId);
    }

    void deleteExpiredSessions(String nowIso) {
        jdbc.update("DELETE FROM sessions WHERE expires_at <= ?", nowIso);
    }

    private static User mapUser(ResultSet rs, int rowNum) throws SQLException {
        return new User(rs.getString("id"), rs.getString("email"), rs.getString("display_name"),
                rs.getString("avatar_color"), rs.getString("created_at"));
    }
}
