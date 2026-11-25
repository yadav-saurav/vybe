package app.vybe.api.imports;

import app.vybe.api.catalog.CatalogStore;
import app.vybe.api.model.Song;
import app.vybe.api.world.WorldService;
import app.vybe.api.world.WorldSongStore;
import org.springframework.context.annotation.Lazy;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Map;

/**
 * Resolves a song id for a given user: Apple ({@code wd_}) songs from stored snapshots or Apple,
 * catalog ids from the in-memory catalog, {@code im_} ids only when that user owns the import.
 */
@Service
public class SongResolver {

    private final CatalogStore catalog;
    private final ImportService imports;
    private final WorldService world;
    private final WorldSongStore worldSongs;

    public SongResolver(CatalogStore catalog, ImportService imports, @Lazy WorldService world, WorldSongStore worldSongs) {
        this.catalog = catalog;
        this.imports = imports;
        this.world = world;
        this.worldSongs = worldSongs;
    }

    /**
     * An Apple song: stored snapshot first, then what this server has seen, then one lookup at Apple.
     * Every resolved song is snapshotted, because resolving means someone is saving or playing it.
     */
    public Song world(String id) {
        Song s = worldSongs.get(id);
        if (s == null) {
            s = world.find(id);
            if (s != null) {
                worldSongs.save(s);
            }
        }
        return s;
    }

    /** The song, or null when unknown or not visible to {@code userId}. */
    public Song resolve(String userId, String id) {
        if (ImportService.isImportId(id)) {
            return userId == null ? null : imports.find(userId, id).orElse(null);
        }
        if (WorldService.isWorldId(id)) {
            return world(id);
        }
        return catalog.song(id);
    }

    public boolean exists(String userId, String id) {
        return resolve(userId, id) != null;
    }

    /** Songs in the order given (duplicates kept); unknown or foreign ids are skipped. */
    public java.util.List<Song> resolveAll(String userId, Collection<String> ids) {
        Map<String, Song> own = null;
        java.util.List<Song> out = new ArrayList<>(ids.size());
        for (String id : ids) {
            Song s;
            if (ImportService.isImportId(id)) {
                if (own == null) {
                    own = imports.byId(userId);
                }
                s = own.get(id);
            } else if (WorldService.isWorldId(id)) {
                s = world(id);
            } else {
                s = catalog.song(id);
            }
            if (s != null) {
                out.add(s);
            }
        }
        return out;
    }
}
