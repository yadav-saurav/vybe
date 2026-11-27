package app.vybe.api.playlists;

import app.vybe.api.auth.AuthService;
import app.vybe.api.catalog.CatalogStore;
import app.vybe.api.common.Ids;
import app.vybe.api.common.Text;
import app.vybe.api.common.Timestamps;
import app.vybe.api.discover.PersonalMixService;
import app.vybe.api.error.ApiException;
import app.vybe.api.imports.ImportService;
import app.vybe.api.imports.SongResolver;
import app.vybe.api.model.Artwork;
import app.vybe.api.model.Pages;
import app.vybe.api.model.Playlist;
import app.vybe.api.model.Song;
import app.vybe.api.model.User;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * Playlists in all three flavours: editorial (catalog), personal mixes (computed) and user playlists
 * (stored, owner-only edits). Also builds the playlist detail page.
 */
@Service
public class PlaylistService {

    public static final int MAX_TRACKS = 1000;

    public record CreateRequest(String name, String description, List<String> trackIds) {
    }

    public record PatchRequest(String name, String description, Boolean isPublic, Boolean isCollaborative, List<String> trackIds) {
    }

    private final PlaylistRepository repo;
    private final CatalogStore catalog;
    private final PersonalMixService mixes;
    private final AuthService auth;
    private final SongResolver songs;

    public PlaylistService(PlaylistRepository repo, CatalogStore catalog, PersonalMixService mixes, AuthService auth,
                           SongResolver songs) {
        this.repo = repo;
        this.catalog = catalog;
        this.mixes = mixes;
        this.auth = auth;
        this.songs = songs;
    }

    // ------------------------------------------------------------------ reads

    /** Resolves an editorial, mix or user playlist the viewer is allowed to see. */
    public Optional<Playlist> findVisible(String id, User viewer) {
        if (id.startsWith(PersonalMixService.PREFIX)) {
            return mixes.resolve(id, viewer);
        }
        Playlist editorial = catalog.playlist(id);
        if (editorial != null && "editorial".equals(editorial.kind())) {
            return Optional.of(editorial);
        }
        return repo.find(id)
                .filter(row -> row.isPublic() || row.isCollaborative() || (viewer != null && row.userId().equals(viewer.id())))
                .map(row -> toPlaylist(row, repo.trackIds(row.id()), viewer == null ? null : viewer.id()));
    }

    public Pages.PlaylistPage page(String id, User viewer) {
        Playlist playlist = findVisible(id, viewer)
                .orElseThrow(() -> ApiException.notFound("No playlist with id " + id));
        // Imported tracks only hydrate for the playlist's owner (findVisible already hid them from others).
        boolean owner = viewer != null && viewer.id().equals(playlist.ownerId());
        List<Song> tracks = songs.resolveAll(owner ? viewer.id() : null, playlist.trackIds());
        return new Pages.PlaylistPage(playlist, tracks, moreLikeThis(playlist));
    }

    /** Editorial playlists sharing artists or genres with {@code playlist}, best matches first. */
    private List<Playlist> moreLikeThis(Playlist playlist) {
        if (!"editorial".equals(playlist.kind())) {
            return List.of();
        }
        Set<String> artists = new HashSet<>();
        Set<String> genres = new HashSet<>();
        for (Song s : tracks(playlist.trackIds())) {
            artists.add(s.artist().id());
            genres.add(s.genreId());
        }
        List<Playlist> scored = new ArrayList<>();
        List<Integer> scores = new ArrayList<>();
        for (Playlist other : catalog.editorialPlaylists()) {
            if (other.id().equals(playlist.id())) {
                continue;
            }
            int score = 0;
            for (Song s : tracks(other.trackIds())) {
                if (artists.contains(s.artist().id())) {
                    score += 2;
                }
                if (genres.contains(s.genreId())) {
                    score += 1;
                }
            }
            if (score > 0) {
                scored.add(other);
                scores.add(score);
            }
        }
        List<Integer> order = new ArrayList<>();
        for (int i = 0; i < scored.size(); i++) {
            order.add(i);
        }
        order.sort((a, b) -> Integer.compare(scores.get(b), scores.get(a)));
        return order.stream().limit(6).map(scored::get).toList();
    }

    // ------------------------------------------------------------------ user playlist writes

    @Transactional
    public Playlist create(User user, CreateRequest req) {
        List<String> trackIds = validatedTracks(req.trackIds(), user.id());
        String now = Timestamps.now();
        String id = Ids.random("pl_u_", 12);
        repo.insert(new PlaylistRepository.Row(id, user.id(), requireName(req.name()),
                clean(req.description()), false, now, now, false));
        repo.replaceTracks(id, trackIds);
        return loadOwned(id, user);
    }

    @Transactional
    public Playlist update(User user, String id, PatchRequest patch) {
        PlaylistRepository.Row row = owned(id, user);
        String name = patch.name() == null ? row.name() : requireName(patch.name());
        String description = patch.description() == null ? row.description() : clean(patch.description());
        boolean isPublic = patch.isPublic() == null ? row.isPublic() : patch.isPublic();
        boolean collaborative = patch.isCollaborative() == null ? row.isCollaborative() : patch.isCollaborative();
        repo.update(new PlaylistRepository.Row(id, user.id(), name, description, isPublic,
                row.createdAt(), Timestamps.now(), collaborative));
        if (patch.trackIds() != null) {
            repo.replaceTracks(id, validatedTracks(patch.trackIds(), user.id()));
        }
        return loadOwned(id, user);
    }

    /** Appends (or inserts at {@code position}) tracks. Duplicates are allowed. */
    @Transactional
    public Playlist addTracks(User user, String id, List<String> trackIds, Integer position) {
        PlaylistRepository.Row row = repo.find(id).orElseThrow(() -> ApiException.notFound("No playlist with id " + id));
        boolean owner = row.userId().equals(user.id());
        if (!owner && !row.isCollaborative()) {
            throw ApiException.forbidden("You can only change your own playlists");
        }
        // Collaborators append catalog songs only; imported files are private to their owner.
        if (!owner && trackIds != null && trackIds.stream().anyMatch(ImportService::isImportId)) {
            throw ApiException.badRequest("import_not_shareable", "Imported songs can't be added to someone else's playlist");
        }
        List<String> incoming = validatedTracks(trackIds, user.id());
        List<String> current = new ArrayList<>(repo.trackIds(id));
        int at = position == null || !owner ? current.size() : position;
        if (at < 0 || at > current.size()) {
            throw ApiException.badRequest("invalid_position", "position must be between 0 and " + current.size());
        }
        if (current.size() + incoming.size() > MAX_TRACKS) {
            throw ApiException.badRequest("playlist_too_long", "A playlist holds at most " + MAX_TRACKS + " tracks");
        }
        current.addAll(at, incoming);
        repo.replaceTracks(id, current);
        repo.touch(id, Timestamps.now());
        return toPlaylist(repo.find(id).orElseThrow(), repo.trackIds(id), user.id());
    }

    /** Removes the track at {@code index} (0-based position). */
    @Transactional
    public Playlist removeAt(User user, String id, int index) {
        owned(id, user);
        List<String> current = new ArrayList<>(repo.trackIds(id));
        if (index < 0 || index >= current.size()) {
            throw ApiException.notFound("No track at position " + index);
        }
        current.remove(index);
        repo.replaceTracks(id, current);
        repo.touch(id, Timestamps.now());
        return loadOwned(id, user);
    }

    @Transactional
    public void delete(User user, String id) {
        owned(id, user);
        repo.delete(id);
    }

    // ------------------------------------------------------------------ helpers

    /** Builds the public Playlist shape from a stored row and its ordered tracks, as its owner sees it. */
    public Playlist toPlaylist(PlaylistRepository.Row row, List<String> trackIds) {
        return toPlaylist(row, trackIds, row.userId());
    }

    /**
     * Builds the Playlist shape for {@code viewerId}. Imported tracks ({@code im_} ids) are private:
     * they resolve for the owner and are left out of {@code trackIds} for everyone else.
     */
    public Playlist toPlaylist(PlaylistRepository.Row row, List<String> allTrackIds, String viewerId) {
        boolean owner = row.userId().equals(viewerId);
        List<String> trackIds = owner ? allTrackIds
                : allTrackIds.stream().filter(t -> !ImportService.isImportId(t)).toList();
        List<Song> songs = this.songs.resolveAll(owner ? row.userId() : null, trackIds);
        long duration = songs.stream().mapToLong(Song::durationMs).sum();
        Artwork artwork = songs.isEmpty() ? new app.vybe.api.model.Artwork("", 600, 600, "#2b2d42", "#ffffff", "#d0d3e0", "#ffffff") : songs.get(0).artwork(); // empty playlist: plain tile
        String curator = auth.userById(row.userId()).map(User::displayName).orElse("Vybe listener");
        return new Playlist(row.id(), "user", row.name(), curator, row.description(),
                Text.firstSentence(row.description(), 80), artwork, trackIds, duration,
                row.updatedAt(), row.isPublic(), row.userId(), row.isCollaborative());
    }

    private Playlist loadOwned(String id, User user) {
        PlaylistRepository.Row row = repo.find(id).orElseThrow(() -> ApiException.notFound("No playlist " + id));
        return toPlaylist(row, repo.trackIds(id));
    }

    private PlaylistRepository.Row owned(String id, User user) {
        PlaylistRepository.Row row = repo.find(id)
                .orElseThrow(() -> ApiException.notFound("No playlist with id " + id));
        if (!row.userId().equals(user.id())) {
            throw ApiException.forbidden("You can only change your own playlists");
        }
        return row;
    }

    private List<Song> tracks(List<String> ids) {
        List<Song> out = new ArrayList<>(ids.size());
        for (String id : ids) {
            if (!app.vybe.api.world.WorldService.isWorldId(id)) {
                continue; // old generated-catalog tracks are no longer shown
            }
            Song s = songs.resolve(null, id);
            if (s != null) {
                out.add(s);
            }
        }
        return out;
    }

    private List<String> validatedTracks(List<String> ids, String userId) {
        if (ids == null) {
            return List.of();
        }
        if (ids.size() > MAX_TRACKS) {
            throw ApiException.badRequest("playlist_too_long", "A playlist holds at most " + MAX_TRACKS + " tracks");
        }
        java.util.Set<String> imported = null;
        for (String id : ids) {
            boolean known;
            if (ImportService.isImportId(id)) {
                if (imported == null) {
                    imported = new java.util.HashSet<>();
                    for (Song s : songs.resolveAll(userId, ids.stream().filter(ImportService::isImportId).toList())) {
                        imported.add(s.id());
                    }
                }
                known = imported.contains(id);
            } else if (app.vybe.api.world.WorldService.isWorldId(id)) {
                known = songs.resolve(userId, id) != null; // also snapshots the Apple song
            } else {
                known = catalog.song(id) != null;
            }
            if (!known) {
                throw ApiException.badRequest("unknown_track", "Unknown track " + id);
            }
        }
        return List.copyOf(ids);
    }

    private static String requireName(String name) {
        String trimmed = name == null ? "" : name.trim();
        if (trimmed.isEmpty() || trimmed.length() > 120) {
            throw ApiException.badRequest("invalid_name", "name must be 1 to 120 characters");
        }
        return trimmed;
    }

    private static String clean(String description) {
        return description == null ? "" : description.trim();
    }
}
