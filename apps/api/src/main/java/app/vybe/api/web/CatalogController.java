package app.vybe.api.web;

import app.vybe.api.auth.CurrentUser;
import app.vybe.api.catalog.CatalogService;
import app.vybe.api.discover.Similarity;
import app.vybe.api.discover.StationService;
import app.vybe.api.model.Pages;
import app.vybe.api.model.User;
import app.vybe.api.playlists.PlaylistService;
import app.vybe.api.catalog.CatalogStore;
import app.vybe.api.error.ApiException;
import app.vybe.api.model.Song;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Arrays;
import java.util.HashSet;
import java.util.List;

@RestController
public class CatalogController {

    private final CatalogService catalog;
    private final PlaylistService playlists;
    private final StationService stations;
    private final Similarity similarity;
    private final CatalogStore store;

    public CatalogController(CatalogService catalog, PlaylistService playlists, StationService stations,
                             Similarity similarity, CatalogStore store) {
        this.catalog = catalog;
        this.playlists = playlists;
        this.stations = stations;
        this.similarity = similarity;
        this.store = store;
    }

    @GetMapping("/api/songs/{id}")
    public Pages.SongWrapper song(@PathVariable String id) {
        return new Pages.SongWrapper(catalog.song(id));
    }

    @GetMapping("/api/songs")
    public Pages.Songs songs(@RequestParam(value = "ids", defaultValue = "") String ids) {
        return new Pages.Songs(catalog.songs(csv(ids)));
    }

    @GetMapping("/api/songs/{id}/lyrics")
    public Pages.Lyrics lyrics(@PathVariable String id) {
        return new Pages.Lyrics(catalog.lyrics(id));
    }

    @GetMapping("/api/albums/{id}")
    public Pages.AlbumPage album(@PathVariable String id) {
        return catalog.album(id);
    }

    @GetMapping("/api/artists/{id}")
    public Pages.ArtistPage artist(@PathVariable String id) {
        return catalog.artist(id);
    }

    @GetMapping("/api/artists/{id}/songs")
    public Pages.Songs artistSongs(@PathVariable String id,
                                   @RequestParam(value = "sort", defaultValue = "popularity") String sort) {
        return new Pages.Songs(catalog.artistSongs(id, sort));
    }

    @GetMapping("/api/playlists/{id}")
    public app.vybe.api.model.Pages.PlaylistPage playlist(@PathVariable String id,
                                                          @CurrentUser(required = false) User viewer) {
        return playlists.page(id, viewer);
    }

    @GetMapping("/api/stations/{id}/next")
    public Pages.StationPlayback next(@PathVariable String id,
                                      @RequestParam(value = "count", defaultValue = "10") int count,
                                      @RequestParam(value = "exclude", defaultValue = "") String exclude) {
        return stations.next(id, new HashSet<>(csv(exclude)), count);
    }

    @GetMapping("/api/recommendations/autoplay")
    public Pages.Songs autoplay(@RequestParam("songId") String songId,
                                @RequestParam(value = "exclude", defaultValue = "") String exclude,
                                @RequestParam(value = "count", defaultValue = "10") int count) {
        Song seed = store.song(songId);
        if (seed == null) {
            throw ApiException.notFound("No song with id " + songId);
        }
        int n = Math.max(1, Math.min(count, 50));
        return new Pages.Songs(similarity.autoplay(seed, new HashSet<>(csv(exclude)), n));
    }

    /** Splits a comma-separated query value, dropping blanks. */
    static List<String> csv(String raw) {
        if (raw == null || raw.isBlank()) {
            return List.of();
        }
        return Arrays.stream(raw.split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .toList();
    }
}
