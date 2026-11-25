package app.vybe.api.world;

import app.vybe.api.model.Song;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Apple songs that listeners saved or played. A snapshot is stored the first time a song is
 * referenced (library, favourite, playlist, history, Jam), so those keep working after a restart
 * and even while Apple is unreachable. Hot entries are also kept in memory.
 */
@Component
public class WorldSongStore {

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final Map<String, Song> memo = new ConcurrentHashMap<>();

    public WorldSongStore(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public Song get(String id) {
        Song hit = memo.get(id);
        if (hit != null) {
            return hit;
        }
        List<String> rows = jdbc.queryForList("SELECT json FROM world_songs WHERE id = ?", String.class, id);
        if (rows.isEmpty()) {
            return null;
        }
        try {
            Song s = json.readValue(rows.get(0), Song.class);
            remember(s);
            return s;
        } catch (Exception e) {
            return null;
        }
    }

    public void save(Song s) {
        if (memo.containsKey(s.id())) {
            return;
        }
        try {
            String body = json.writeValueAsString(s);
            int n = jdbc.update("UPDATE world_songs SET json = ?, saved_at = ? WHERE id = ?", body, Instant.now().toString(), s.id());
            if (n == 0) {
                jdbc.update("INSERT INTO world_songs (id, json, saved_at) VALUES (?, ?, ?)", s.id(), body, Instant.now().toString());
            }
            remember(s);
        } catch (Exception ignored) {
            // a concurrent insert of the same song is fine
            remember(s);
        }
    }

    private void remember(Song s) {
        if (memo.size() > 20_000) {
            memo.clear();
        }
        memo.put(s.id(), s);
    }
}
