package app.vybe.api.media;

import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;

/**
 * Artwork and audio. Returning a {@link Resource} lets Spring MVC serve HTTP Range requests:
 * 206 with Content-Range, 416 when unsatisfiable, and 200 for full responses.
 */
@RestController
public class MediaController {

    private static final MediaType AUDIO_MP4 = MediaType.parseMediaType("audio/mp4");
    private static final MediaType WEBP = MediaType.parseMediaType("image/webp");

    private final MediaService media;

    public MediaController(MediaService media) {
        this.media = media;
    }

    @GetMapping("/media/art/{file:.+}")
    public ResponseEntity<Resource> art(@PathVariable String file, @RequestParam(value = "w", required = false) Integer w) {
        Resource body = media.art(file, w);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable())
                .contentType(WEBP)
                .body(body);
    }

    @GetMapping("/api/stream/{songId}")
    public ResponseEntity<Resource> stream(@PathVariable String songId) {
        Resource body = media.audio(songId);
        return ResponseEntity.ok()
                .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                .cacheControl(CacheControl.maxAge(Duration.ofHours(1)).cachePublic())
                .contentType(AUDIO_MP4)
                .body(body);
    }
}
