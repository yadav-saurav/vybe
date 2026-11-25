package app.vybe.api.library;

import app.vybe.api.catalog.CatalogStore;
import app.vybe.api.common.Timestamps;
import app.vybe.api.error.ApiException;
import app.vybe.api.imports.ImportService;
import app.vybe.api.imports.SongResolver;
import app.vybe.api.model.Album;
import app.vybe.api.model.Artist;
import app.vybe.api.model.ContentItem;
import app.vybe.api.model.LibraryState;
import app.vybe.api.model.Playlist;
import app.vybe.api.model.Song;
import app.vybe.api.playlists.PlaylistRepository;
import app.vybe.api.playlists.PlaylistService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** The signed-in user's library, loves, and derived lists (songs, artists, recently added). */
@Service
public class LibraryService {

    public static final Set<String> TYPES = Set.of("song", "album", "playlist", "artist");
    private static final int RECENTLY_ADDED_LIMIT = 24;

    private final LibraryRepository library;
    private final PlaylistRepository playlistRows;
    private final PlaylistService playlists;
    private final CatalogStore catalog;
    private final SongResolver songs;
    private final ImportService imports;

    public LibraryService(LibraryRepository library, PlaylistRepository playlistRows,
                          PlaylistService playlists, CatalogStore catalog, SongResolver songs, ImportService imports) {
        this.library = library;
        this.playlistRows = playlistRows;
        this.playlists = playlists;
        this.catalog = catalog;
        this.songs = songs;
        this.imports = imports;
    }

    @Transactional
    public LibraryState add(String userId, String type, String id) {
        requireType(type);
        requireExists(userId, type, id);
        String now = Timestamps.now();
        library.addItem(userId, type, id, now);
        return state(userId);
    }

    @Transactional
    public LibraryState remove(String userId, String type, String id) {
        requireType(type);
        library.removeItem(userId, type, id);
        return state(userId);
    }

    /** Loving also adds the item to the library. */
    @Transactional
    public LibraryState love(String userId, String type, String id) {
        requireType(type);
        requireExists(userId, type, id);
        String now = Timestamps.now();
        library.addLove(userId, type, id, now);
        library.addItem(userId, type, id, now);
        return state(userId);
    }

    @Transactional
    public LibraryState unlove(String userId, String type, String id) {
        requireType(type);
        library.removeLove(userId, type, id);
        return state(userId);
    }

    /**
     * Full library snapshot. Artists combine followed artists with the primary artists of saved
     * songs and albums. Own user playlists are included in {@code playlistIds}. Every imported track
     * is in the library automatically ({@code songIds}, dated when it was imported).
     */
    public LibraryState state(String userId) {
        List<LibraryRepository.Ref> songRefs = library.items(userId, "song");
        List<LibraryRepository.Ref> albumRefs = library.items(userId, "album");
        List<LibraryRepository.Ref> playlistRefs = library.items(userId, "playlist");
        List<LibraryRepository.Ref> artistRefs = library.items(userId, "artist");
        List<LibraryRepository.Ref> loveRefs = library.loves(userId);

        Map<String, String> addedAt = new HashMap<>();
        Map<String, String> songAt = new LinkedHashMap<>();
        for (var r : songRefs) {
            songAt.merge(r.id(), r.at(), LibraryService::later);
        }
        imports.createdAt(userId).forEach((id, at) -> songAt.merge(id, at, LibraryService::later));
        List<Map.Entry<String, String>> songEntries = new ArrayList<>(songAt.entrySet());
        songEntries.sort((a, b) -> b.getValue().compareTo(a.getValue()));
        List<String> songIds = new ArrayList<>();
        for (var e : songEntries) {
            songIds.add(e.getKey());
            addedAt.put(e.getKey(), e.getValue());
        }
        List<String> albumIds = new ArrayList<>();
        for (var r : albumRefs) {
            albumIds.add(r.id());
            addedAt.put(r.id(), r.at());
        }

        // Playlists: editorial ones saved to the library plus the user's own, newest first.
        List<Map.Entry<String, String>> playlistEntries = new ArrayList<>();
        for (var r : playlistRefs) {
            playlistEntries.add(Map.entry(r.id(), r.at()));
        }
        for (PlaylistRepository.Row row : playlistRows.findByUser(userId)) {
            playlistEntries.add(Map.entry(row.id(), row.createdAt()));
        }
        playlistEntries.sort((a, b) -> b.getValue().compareTo(a.getValue()));
        List<String> playlistIds = new ArrayList<>();
        for (var e : playlistEntries) {
            playlistIds.add(e.getKey());
            addedAt.put(e.getKey(), e.getValue());
        }

        // Artists: explicit follows, plus those derived from saved songs and albums (latest date wins).
        Map<String, String> artistAt = new LinkedHashMap<>();
        for (var r : artistRefs) {
            artistAt.merge(r.id(), r.at(), LibraryService::later);
        }
        for (var r : songRefs) {
            Song s = catalog.song(r.id());
            if (s != null) {
                artistAt.merge(s.artist().id(), r.at(), LibraryService::later);
            }
        }
        for (var r : albumRefs) {
            Album a = catalog.album(r.id());
            if (a != null) {
                artistAt.merge(a.artist().id(), r.at(), LibraryService::later);
            }
        }
        List<Map.Entry<String, String>> artistEntries = new ArrayList<>(artistAt.entrySet());
        artistEntries.sort((a, b) -> b.getValue().compareTo(a.getValue()));
        List<String> artistIds = new ArrayList<>();
        for (var e : artistEntries) {
            artistIds.add(e.getKey());
            addedAt.put(e.getKey(), e.getValue());
        }

        List<String> followedArtistIds = new ArrayList<>();
        for (var r : artistRefs) {
            followedArtistIds.add(r.id());
        }

        List<String> lovedIds = new ArrayList<>();
        for (var r : loveRefs) {
            lovedIds.add(r.id());
        }
        return new LibraryState(songIds, albumIds, playlistIds, artistIds, followedArtistIds, lovedIds, addedAt);
    }

    /** Directly added songs, tracks of library albums and every imported track, de-duplicated, newest first. */
    public List<Song> songs(String userId) {
        Map<String, String> at = new LinkedHashMap<>();
        for (var r : library.items(userId, "song")) {
            at.merge(r.id(), r.at(), LibraryService::later);
        }
        imports.createdAt(userId).forEach((id, added) -> at.merge(id, added, LibraryService::later));
        for (var r : library.items(userId, "album")) {
            for (Song s : catalog.tracksOfAlbum(r.id())) {
                at.merge(s.id(), r.at(), LibraryService::later);
            }
        }
        List<Map.Entry<String, String>> entries = new ArrayList<>(at.entrySet());
        entries.sort((a, b) -> b.getValue().compareTo(a.getValue()));
        return songs.resolveAll(userId, entries.stream().map(Map.Entry::getKey).toList());
    }

    public List<Album> albums(String userId) {
        return library.items(userId, "album").stream().map(r -> catalog.album(r.id()))
                .filter(java.util.Objects::nonNull).toList();
    }

    public List<Artist> artists(String userId) {
        return state(userId).artistIds().stream().map(catalog::artist)
                .filter(java.util.Objects::nonNull).toList();
    }

    /** Editorial playlists saved to the library, and the user's own playlists, newest first. */
    public List<Playlist> playlists(String userId) {
        List<String> ids = state(userId).playlistIds();
        List<Playlist> out = new ArrayList<>(ids.size());
        for (String id : ids) {
            PlaylistRepository.Row row = playlistRows.find(id).orElse(null);
            if (row != null && row.userId().equals(userId)) {
                out.add(playlists.toPlaylist(row, playlistRows.trackIds(id)));
            } else if (row != null) {
                // Someone else's playlist saved to the library: only while it is still public or collaborative.
                if (row.isPublic() || row.isCollaborative()) {
                    out.add(playlists.toPlaylist(row, playlistRows.trackIds(id), userId));
                }
            } else {
                Playlist editorial = catalog.playlist(id);
                if (editorial != null) {
                    out.add(editorial);
                }
            }
        }
        return out;
    }

    /**
     * Most recently added albums, playlists and songs. A catalog song is shown as its album, so an
     * album appears once even when both it and one of its tracks were saved. Imported tracks have no
     * album page, so each one is listed as a song (dated when it was imported).
     */
    public List<ContentItem> recentlyAdded(String userId) {
        record Entry(String type, String id, String at) {
        }
        List<Entry> entries = new ArrayList<>();
        for (var r : library.items(userId, "album")) {
            entries.add(new Entry("album", r.id(), r.at()));
        }
        for (var r : library.items(userId, "song")) {
            if (!ImportService.isImportId(r.id())) {
                entries.add(new Entry("song", r.id(), r.at()));
            }
        }
        Map<String, Song> imported = imports.byId(userId);
        Map<String, String> importedAt = imports.createdAt(userId);
        for (var e : importedAt.entrySet()) {
            entries.add(new Entry("import", e.getKey(), e.getValue()));
        }
        for (var r : library.items(userId, "playlist")) {
            entries.add(new Entry("playlist", r.id(), r.at()));
        }
        for (PlaylistRepository.Row row : playlistRows.findByUser(userId)) {
            entries.add(new Entry("playlist", row.id(), row.createdAt()));
        }
        entries.sort((a, b) -> b.at().compareTo(a.at()));

        Set<String> seenAlbums = new LinkedHashSet<>();
        List<ContentItem> out = new ArrayList<>();
        for (Entry e : entries) {
            if (out.size() >= RECENTLY_ADDED_LIMIT) {
                break;
            }
            switch (e.type()) {
                case "album" -> addAlbum(out, seenAlbums, e.id());
                case "import" -> {
                    Song s = imported.get(e.id());
                    if (s != null) {
                        out.add(ContentItem.song(s));
                    }
                }
                case "song" -> {
                    Song s = catalog.song(e.id());
                    if (s != null) {
                        addAlbum(out, seenAlbums, s.album().id());
                    }
                }
                default -> {
                    Playlist p = findPlaylist(e.id(), userId);
                    if (p != null) {
                        out.add(ContentItem.playlist(p));
                    }
                }
            }
        }
        return out;
    }

    /** The later of two ISO timestamps (they sort lexicographically). */
    static String later(String a, String b) {
        return a.compareTo(b) >= 0 ? a : b;
    }

    private void addAlbum(List<ContentItem> out, Set<String> seen, String albumId) {
        Album album = catalog.album(albumId);
        if (album != null && seen.add(albumId)) {
            out.add(ContentItem.album(album));
        }
    }

    private Playlist findPlaylist(String id, String userId) {
        PlaylistRepository.Row row = playlistRows.find(id).orElse(null);
        if (row != null) {
            return row.userId().equals(userId) ? playlists.toPlaylist(row, playlistRows.trackIds(id)) : null;
        }
        return catalog.playlist(id);
    }

    private static void requireType(String type) {
        if (!TYPES.contains(type)) {
            throw ApiException.badRequest("invalid_type", "type must be one of " + TYPES);
        }
    }

    private void requireExists(String userId, String type, String id) {
        boolean exists = switch (type) {
            case "song" -> songs.exists(userId, id);
            case "album" -> catalog.album(id) != null;
            case "artist" -> catalog.artist(id) != null;
            default -> (catalog.playlist(id) != null && "editorial".equals(catalog.playlist(id).kind()))
                    || playlistRows.find(id).filter(r -> r.isPublic() || r.isCollaborative() || r.userId().equals(userId)).isPresent();
        };
        if (!exists) {
            throw ApiException.notFound("No " + type + " with id " + id);
        }
    }
}
