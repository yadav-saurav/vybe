package app.vybe.api.imports;

import app.vybe.api.catalog.CatalogStore;
import app.vybe.api.model.Song;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Map;

/**
 * Resolves a song id for a given user: catalog ids from the in-memory catalog, {@code im_} ids
 * only when that user owns the import. With no user, imported ids never resolve.
 */
@Service
public class SongResolver {

    private final CatalogStore catalog;
    private final ImportService imports;

    public SongResolver(CatalogStore catalog, ImportService imports) {
        this.catalog = catalog;
        this.imports = imports;
    }

    /** The song, or null when unknown or not visible to {@code userId}. */
    public Song resolve(String userId, String id) {
        if (ImportService.isImportId(id)) {
            return userId == null ? null : imports.find(userId, id).orElse(null);
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
