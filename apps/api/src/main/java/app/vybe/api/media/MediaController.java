package app.vybe.api.media;

import app.vybe.api.catalog.CatalogStore;
import app.vybe.api.error.ApiException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;
import java.time.Duration;
import java.util.regex.Pattern;

/**
 * Artwork and audio. Returning a {@link Resource} lets Spring MVC serve HTTP Range requests:
 * 206 with Content-Range, 416 when unsatisfiable, and 200 for full responses.
 */
@RestController
public class MediaController {

    private static final MediaType AUDIO_MP4 = MediaType.parseMediaType("audio/mp4");
    private static final MediaType WEBP = MediaType.parseMediaType("image/webp");

    private static final Pattern ART_FILE = Pattern.compile("[A-Za-z0-9_-]+\\.webp");

    private final MediaService media;
    private final CatalogStore catalog;
    /** When set (e.g. a public Supabase Storage bucket), media is served by redirect instead of from disk. */
    private final String baseUrl;

    public MediaController(MediaService media, CatalogStore catalog,
                           @Value("${vybe.media-base-url:${VYBE_MEDIA_BASE_URL:}}") String baseUrl) {
        this.media = media;
        this.catalog = catalog;
        this.baseUrl = baseUrl == null ? "" : baseUrl.replaceAll("/+$", "");
    }

    private boolean remote() {
        return !baseUrl.isEmpty();
    }

    /** Same variant rule as local serving: w <= 160 -> _160, w <= 400 -> _400, otherwise full size. */
    static String variant(String file, Integer w) {
        String stem = file.substring(0, file.length() - ".webp".length());
        if (w != null && w <= 160) return stem + "_160.webp";
        if (w != null && w <= 400) return stem + "_400.webp";
        return file;
    }

    private static ResponseEntity<Resource> redirect(String url, CacheControl cache) {
        return ResponseEntity.status(302).location(URI.create(url)).cacheControl(cache).build();
    }

    @GetMapping("/media/art/{file:.+}")
    public ResponseEntity<Resource> art(@PathVariable String file, @RequestParam(value = "w", required = false) Integer w) {
        if (remote()) {
            if (!ART_FILE.matcher(file).matches()) throw ApiException.notFound("No such artwork");
            return redirect(baseUrl + "/art/" + variant(file, w), CacheControl.maxAge(Duration.ofDays(1)).cachePublic());
        }
        Resource body = media.art(file, w);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable())
                .contentType(WEBP)
                .body(body);
    }

    @GetMapping("/api/stream/{songId}")
    public ResponseEntity<Resource> stream(@PathVariable String songId) {
        if (remote()) {
            if (catalog.song(songId) == null) throw ApiException.notFound("No such song");
            return redirect(baseUrl + "/audio/" + songId + ".m4a", CacheControl.maxAge(Duration.ofHours(1)).cachePublic());
        }
        Resource body = media.audio(songId);
        return ResponseEntity.ok()
                .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                .cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePublic())
                .contentType(AUDIO_MP4)
                .body(body);
    }
}
