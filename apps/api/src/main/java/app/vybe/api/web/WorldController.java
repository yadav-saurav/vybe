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
    public ResponseEntity<WorldService.WorldHome> home() {
        WorldService.WorldHome h = world.home();
        CacheControl cc = h.complete() ? CacheControl.maxAge(Duration.ofMinutes(10)).cachePublic() : CacheControl.noStore();
        return ResponseEntity.ok().cacheControl(cc).body(h);
    }

    @GetMapping("/api/world/artists/{id}")
    public ResponseEntity<WorldService.ArtistPage> artist(@org.springframework.web.bind.annotation.PathVariable String id,
                                                          @RequestParam(value = "country", required = false) String country) {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(30)).cachePublic()).body(world.artist(id, country));
    }

    @GetMapping("/api/world/search")
    public ResponseEntity<WorldService.SongList> search(@RequestParam("term") String term,
                                                        @RequestParam(value = "country", required = false) String country) {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(10)).cachePublic()).body(world.search(term, country));
    }
}
