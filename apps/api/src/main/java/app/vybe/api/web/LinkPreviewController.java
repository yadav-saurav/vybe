package app.vybe.api.web;

import app.vybe.api.catalog.CatalogStore;
import app.vybe.api.model.Album;
import app.vybe.api.model.Artist;
import app.vybe.api.model.Playlist;
import app.vybe.api.model.Station;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;

/**
 * Link previews: when a Vybe link is pasted into a chat app, its crawler fetches the page without
 * running JavaScript. In production (web build present) these routes return the app shell with Open
 * Graph / Twitter tags for the specific album, playlist, artist or station injected into the head.
 * In dev (Vite serves the app) the build is absent and these routes 404 so Vite handles them.
 */
@RestController
public class LinkPreviewController {

    private final CatalogStore catalog;
    private final Path indexHtml;

    public LinkPreviewController(CatalogStore catalog, @Value("${vybe.web-dir:${VYBE_WEB_DIR:../web/dist}}") String webDir) {
        this.catalog = catalog;
        this.indexHtml = Path.of(webDir).toAbsolutePath().normalize().resolve("index.html");
    }

    record Meta(String title, String description, String image, String type) { }

    @GetMapping("/album/{id}")
    public ResponseEntity<String> album(@PathVariable String id, HttpServletRequest req) throws IOException {
        Album a = catalog.album(id);
        return page(req, a == null ? null : new Meta(a.title() + " by " + a.artist().name(),
                capitalize(a.type()) + " · " + year(a.releaseDate()) + " · " + a.trackIds().size() + " songs. " + a.editorialNotes(),
                a.artwork().url(), "music.album"));
    }

    @GetMapping("/playlist/{id}")
    public ResponseEntity<String> playlist(@PathVariable String id, HttpServletRequest req) throws IOException {
        Playlist p = catalog.playlist(id); // editorial playlists only; private user playlists get the default card
        return page(req, p == null ? null : new Meta(p.name() + " · " + p.curatorName(), p.description(), p.artwork().url(), "music.playlist"));
    }

    @GetMapping("/artist/{id}")
    public ResponseEntity<String> artist(@PathVariable String id, HttpServletRequest req) throws IOException {
        Artist a = catalog.artist(id);
        return page(req, a == null ? null : new Meta(a.name(), a.bio(), a.artwork().url(), "profile"));
    }

    @GetMapping("/station/{id}")
    public ResponseEntity<String> station(@PathVariable String id, HttpServletRequest req) throws IOException {
        Station s = catalog.station(id);
        return page(req, s == null ? null : new Meta(s.name() + " · Vybe Radio", s.tagline(), s.artwork().url(), "music.radio_station"));
    }

    private ResponseEntity<String> page(HttpServletRequest req, Meta meta) throws IOException {
        if (!Files.isRegularFile(indexHtml)) {
            return ResponseEntity.notFound().build();
        }
        String html = Files.readString(indexHtml, StandardCharsets.UTF_8);
        if (meta != null) {
            String origin = origin(req);
            String url = origin + req.getRequestURI();
            String image = meta.image().startsWith("http") ? meta.image() : origin + meta.image();
            String desc = clip(meta.description(), 200);
            String tags = """
                    <meta property="og:site_name" content="Vybe" />
                    <meta property="og:type" content="%s" />
                    <meta property="og:title" content="%s" />
                    <meta property="og:description" content="%s" />
                    <meta property="og:url" content="%s" />
                    <meta property="og:image" content="%s" />
                    <meta property="og:image:width" content="1000" />
                    <meta property="og:image:height" content="1000" />
                    <meta name="twitter:card" content="summary_large_image" />
                    <meta name="twitter:title" content="%s" />
                    <meta name="twitter:description" content="%s" />
                    <meta name="twitter:image" content="%s" />
                    """.formatted(esc(meta.type()), esc(meta.title()), esc(desc), esc(url), esc(image),
                    esc(meta.title()), esc(desc), esc(image));
            html = html.replaceFirst("<title>[^<]*</title>", "<title>" + esc(meta.title()).replace("$", "\\$") + " — Vybe</title>")
                    .replace("</head>", tags + "</head>");
        }
        return ResponseEntity.ok().contentType(MediaType.TEXT_HTML).cacheControl(CacheControl.maxAge(Duration.ofMinutes(10)).cachePublic()).body(html);
    }

    /** Public origin, honouring the reverse proxy headers set by hosts like Render. */
    static String origin(HttpServletRequest req) {
        String proto = header(req, "X-Forwarded-Proto", req.getScheme());
        String host = header(req, "X-Forwarded-Host", req.getHeader("Host"));
        return proto + "://" + host;
    }

    private static String header(HttpServletRequest req, String name, String fallback) {
        String v = req.getHeader(name);
        return v == null || v.isBlank() ? fallback : v.split(",")[0].trim();
    }

    static String esc(String s) {
        return s == null ? "" : s.replace("&", "&amp;").replace("\"", "&quot;").replace("<", "&lt;").replace(">", "&gt;");
    }

    private static String clip(String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, max - 1).stripTrailing() + "…";
    }

    private static String capitalize(String s) {
        return s == null || s.isEmpty() ? "" : Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }

    private static String year(String date) {
        return date == null || date.length() < 4 ? "" : date.substring(0, 4);
    }
}
