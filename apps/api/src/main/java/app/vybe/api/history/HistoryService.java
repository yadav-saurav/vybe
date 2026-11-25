package app.vybe.api.history;

import app.vybe.api.catalog.CatalogStore;
import app.vybe.api.common.Timestamps;
import app.vybe.api.error.ApiException;
import app.vybe.api.imports.ImportService;
import app.vybe.api.imports.SongResolver;
import app.vybe.api.model.ContentType;
import app.vybe.api.model.HistoryEntry;
import app.vybe.api.model.Song;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

@Service
public class HistoryService {

    private static final int DEFAULT_LIMIT = 50;
    private static final int MAX_LIMIT = 200;

    private final HistoryRepository history;
    private final CatalogStore catalog;
    private final SongResolver songs;
    private final ImportService imports;

    public HistoryService(HistoryRepository history, CatalogStore catalog, SongResolver songs, ImportService imports) {
        this.history = history;
        this.catalog = catalog;
        this.songs = songs;
        this.imports = imports;
    }

    @Transactional
    public void record(String userId, String songId, int playedMs, ContentType contextType, String contextId) {
        if (!songs.exists(userId, songId)) {
            throw ApiException.badRequest("unknown_song", "Unknown song " + songId);
        }
        history.insert(userId, songId, Timestamps.now(), Math.max(0, playedMs),
                contextType == null ? null : contextType.value(), contextId);
    }

    /** Newest first, with each song hydrated. Plays of songs that no longer exist are skipped. */
    public List<HistoryEntry> list(String userId, Integer limit) {
        int n = limit == null ? DEFAULT_LIMIT : Math.max(1, Math.min(limit, MAX_LIMIT));
        List<HistoryEntry> out = new ArrayList<>(n);
        java.util.Map<String, Song> imported = null;
        for (var row : history.recent(userId, n)) {
            Song song;
            if (ImportService.isImportId(row.songId())) {
                if (imported == null) {
                    imported = imports.byId(userId);
                }
                song = imported.get(row.songId());
            } else {
                song = songs.resolve(userId, row.songId()); // catalog or Apple snapshot
            }
            if (song != null) {
                out.add(new HistoryEntry(row.songId(), row.playedAt(), ContentType.fromValue(row.contextType()),
                        row.contextId(), song));
            }
        }
        return out;
    }
}
