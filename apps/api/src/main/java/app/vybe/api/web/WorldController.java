package app.vybe.api.web;

import app.vybe.api.world.WorldService;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.List;
import java.util.Map;

/** Worldwide music: famous songs from every country as 30-second previews (no sign-in needed). */
@RestController
public class WorldController {
    private final WorldService world;

    public WorldController(WorldService world) {
        this.world = world;
    }

    @GetMapping("/api/world/countries")
    public Map<String, List<WorldService.Country>> countries() {
        return Map.of("countries", world.countries());
    }

    @GetMapping("/api/world/charts")
    public ResponseEntity<WorldService.SongList> chart(@RequestParam(value = "country", required = false) String country) {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(30)).cachePublic()).body(world.chart(country));
    }

    /** The Worldwide home: shelves that are ready now; {@code complete=false} means more are on the way. */
    @GetMapping("/api/world/home")
    public ResponseEntity<WorldService.WorldHome> home(@app.vybe.api.auth.CurrentUser(required = false) app.vybe.api.model.User user) {
        WorldService.WorldHome h = world.home(user != null);
        // Never cached: signed-in and signed-out listeners get different rows from the same URL.
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(h);
    }

    /** Famous songs for one of Vybe's pages: new, radio, or genre/{genreId}. */
    @GetMapping({"/api/world/section/{name}", "/api/world/section/{name}/{arg}"})
    public ResponseEntity<WorldService.WorldHome> section(@org.springframework.web.bind.annotation.PathVariable String name,
                                                          @org.springframework.web.bind.annotation.PathVariable(required = false) String arg) {
        WorldService.WorldHome h = switch (name) {
            case "genre" -> world.sectionGenre(arg);
            default -> throw app.vybe.api.error.ApiException.notFound("Unknown section.");
        };
        if (!h.complete()) {
            world.warmInBackground();
        }
        CacheControl cc = h.complete() ? CacheControl.maxAge(Duration.ofMinutes(10)).cachePublic() : CacheControl.noStore();
        return ResponseEntity.ok().cacheControl(cc).body(h);
    }

    /** Real album covers for the Browse Categories cards, keyed by genre id. */
    @GetMapping("/api/world/genre-covers")
    public ResponseEntity<Map<String, Object>> genreCovers() {
        Map<String, app.vybe.api.model.Artwork> covers = world.genreCovers();
        CacheControl cc = covers.size() >= 12 ? CacheControl.maxAge(Duration.ofHours(1)).cachePublic() : CacheControl.noStore();
        return ResponseEntity.ok().cacheControl(cc).body(Map.of("covers", covers));
    }

    @GetMapping("/api/world/artists/{id}")
    public ResponseEntity<WorldService.ArtistPage> artist(@org.springframework.web.bind.annotation.PathVariable String id,
                                                          @RequestParam(value = "country", required = false) String country) {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(30)).cachePublic()).body(world.artist(id, country));
    }

    /** "Show all" for one home row. */
    @GetMapping("/api/world/shelves/{id}")
    public WorldService.WorldShelf shelf(@org.springframework.web.bind.annotation.PathVariable String id,
                                         @app.vybe.api.auth.CurrentUser(required = false) app.vybe.api.model.User user) {
        WorldService.WorldShelf sh = world.shelf(id, user != null);
        if (sh == null) {
            world.warmInBackground();
            throw new app.vybe.api.error.ApiException(503, "world_loading", "Still gathering this row. Try again in a moment.");
        }
        return sh;
    }

    @GetMapping("/api/world/albums/{id}")
    public ResponseEntity<WorldService.AlbumPage> album(@org.springframework.web.bind.annotation.PathVariable String id) {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(30)).cachePublic()).body(world.albumPage(id));
    }

    /** Songs, artists and albums for a search (one Apple call). */
    @GetMapping("/api/world/search-all")
    public ResponseEntity<WorldService.SearchAll> searchAll(@RequestParam("term") String term,
                                                            @RequestParam(value = "country", required = false) String country) {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(10)).cachePublic()).body(world.searchAll(term, country));
    }

    @GetMapping("/api/world/search")
    public ResponseEntity<WorldService.SongList> search(@RequestParam("term") String term,
                                                        @RequestParam(value = "country", required = false) String country) {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(10)).cachePublic()).body(world.search(term, country));
    }
}
