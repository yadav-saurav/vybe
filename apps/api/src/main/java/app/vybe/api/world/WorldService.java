package app.vybe.api.world;

import app.vybe.api.error.ApiException;
import app.vybe.api.model.AlbumRef;
import app.vybe.api.model.ArtistRef;
import app.vybe.api.model.Artwork;
import app.vybe.api.model.Song;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.net.ProxySelector;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Worldwide music: famous songs from every country, as official 30-second previews from Apple's
 * public iTunes Search API (no key needed). Results become ordinary Vybe {@link Song}s with
 * {@code source = "world"}, so the player, queue and Jam handle them like any other song.
 *
 * <p>Ids carry the storefront so the client can link to the full song on Apple Music:
 * song {@code wd_<cc>_<trackId>}, album {@code wl_<cc>_<collectionId>}, artist {@code wa_<artistId>}.
 *
 * <p>Apple allows roughly 20 requests a minute per server, so answers are cached (searches for 30
 * minutes, charts for 3 hours) and every song seen is remembered for Jam lookups.
 */
@Service
public class WorldService {

    private static final Logger log = LoggerFactory.getLogger(WorldService.class);

    /** Storefronts offered in the app, in display order. */
    public static final Map<String, String> COUNTRIES = orderedCountries();
    private static final Pattern WORLD_ID = Pattern.compile("^wd_([a-z]{2})_(\\d{1,15})$");
    private static final long SEARCH_TTL_MS = 30 * 60_000L;
    private static final long CHART_TTL_MS = 3 * 60 * 60_000L;
    private static final int MAX_CACHE = 400;
    private static final int MAX_SONGS_REMEMBERED = 5000;
    /** Muted backgrounds that keep white text readable (Artwork palette until the image is loaded). */
    private static final String[] PALETTE = {"#2b3a55", "#4a2c40", "#1f4a46", "#5a3b1f", "#3a2f5c", "#203a5c", "#4d2a2a", "#2d4a2b"};

    public record Country(String code, String name) {
    }

    public record SongList(String title, String country, List<Song> songs) {
    }

    private record Cached(long expires, SongList value) {
    }

    /** A famous artist; the picture is their best-known cover (Apple's API has no artist photos). */
    public record WorldArtist(String id, String name, String genre, Artwork artwork, String country) {
    }

    /** One row of the Worldwide home. kind: hero | cards | artists. */
    /** kind: cards | artists | albums | charts. {@code link} is where "Show all" goes. */
    public record WorldShelf(String id, String title, String subtitle, String kind, List<Song> songs, List<WorldArtist> artists,
                             List<WorldStation> stations, List<WorldAlbum> albums, String link) {
        public WorldShelf(String id, String title, String subtitle, String kind, List<Song> songs, List<WorldArtist> artists) {
            this(id, title, subtitle, kind, songs, artists, List.of(), List.of(), "/shelf/" + id);
        }

        WorldShelf withLink(String l) {
            return new WorldShelf(id, title, subtitle, kind, songs, artists, stations, albums, l);
        }

        WorldShelf titled(String t, String sub) {
            return new WorldShelf(id, t, sub, kind, songs, artists, stations, albums, link);
        }
    }

    /** An album or single (Apple collection). Id {@code wl_<cc>_<collectionId>}. */
    public record WorldAlbum(String id, String title, String artistName, String artistId, Artwork artwork, String releaseDate, String country) {
    }

    public record AlbumPage(WorldAlbum album, List<Song> songs) {
    }

    /** A worldwide radio station: an endless shuffled mix of one scene. */
    public record WorldStation(String id, String name, String description, Artwork artwork, List<Song> songs) {
    }

    public record WorldHome(List<WorldShelf> shelves, boolean complete) {
    }

    public record ArtistPage(WorldArtist artist, List<Song> songs) {
    }

    private record Stars(List<WorldArtist> artists, Map<String, List<Song>> songsByArtist) {
    }

    private final ObjectMapper json;
    private final HttpClient http = HttpClient.newBuilder()
            .proxy(ProxySelector.getDefault())
            .followRedirects(HttpClient.Redirect.NORMAL)
            .connectTimeout(Duration.ofSeconds(6))
            .build();
    private Function<String, String> fetcher = this::httpGet;
    private final Map<String, Cached> cache = lru(MAX_CACHE);
    private final Map<String, Song> songsById = lru(MAX_SONGS_REMEMBERED);

    private final boolean autowarm;

    public WorldService(ObjectMapper json,
                        @org.springframework.beans.factory.annotation.Value("${vybe.world.autowarm:${VYBE_WORLD_AUTOWARM:true}}") boolean autowarm) {
        this.json = json;
        this.autowarm = autowarm;
    }

    /** Build the Worldwide home right after startup, so the first visitor finds it ready. */
    @org.springframework.context.event.EventListener(org.springframework.boot.context.event.ApplicationReadyEvent.class)
    public void warmOnStartup() {
        if (autowarm) {
            warmInBackground();
        }
    }

    /** Tests swap in canned Apple responses. */
    void setFetcher(Function<String, String> fetcher) {
        this.fetcher = fetcher;
        synchronized (cache) {
            cache.clear();
        }
    }

    public List<Country> countries() {
        return COUNTRIES.entrySet().stream().map(e -> new Country(e.getKey(), e.getValue())).toList();
    }

    // ---------------------------------------------------------------- search and charts

    public SongList search(String term, String country) {
        String q = term == null ? "" : term.strip();
        if (q.length() < 2) {
            throw ApiException.badRequest("invalid_request", "Type at least 2 characters to search worldwide.");
        }
        if (q.length() > 100) {
            q = q.substring(0, 100);
        }
        String cc = country(country);
        String key = "s:" + cc + ":" + q.toLowerCase(Locale.ROOT);
        String finalQ = q;
        return cached(key, SEARCH_TTL_MS, () -> {
            String url = "https://itunes.apple.com/search?media=music&entity=song&limit=50&country=" + cc
                    + "&term=" + URLEncoder.encode(finalQ, StandardCharsets.UTF_8);
            return new SongList("Results for “" + finalQ + "”", cc, songs(read(url).path("results"), cc));
        });
    }

    /** Apple Music's most-played songs in a country, with previews. */
    public SongList chart(String country) {
        String cc = country(country);
        return cached("c:" + cc, CHART_TTL_MS, () -> {
            JsonNode feed = read("https://rss.applemarketingtools.com/api/v2/" + cc + "/music/most-played/50/songs.json");
            List<String> ids = new ArrayList<>();
            for (JsonNode r : feed.path("feed").path("results")) {
                if (r.path("id").asText().matches("\\d{1,15}")) {
                    ids.add(r.path("id").asText());
                }
            }
            List<Song> songs = ids.isEmpty() ? List.of()
                    : songs(read("https://itunes.apple.com/lookup?entity=song&country=" + cc + "&id=" + String.join(",", ids)).path("results"), cc);
            // Lookup answers in its own order; keep the chart's.
            Map<String, Song> byTrack = new LinkedHashMap<>();
            for (Song s : songs) {
                byTrack.put(s.id().substring(s.id().lastIndexOf('_') + 1), s);
            }
            List<Song> ordered = ids.stream().map(byTrack::get).filter(s -> s != null).toList();
            return new SongList("Top Songs in " + COUNTRIES.get(cc), cc, ordered);
        });
    }

    /** A worldwide song by id (Jam queues them). Unknown ids are looked up once at Apple. */
    public Song find(String id) {
        Matcher m = id == null ? null : WORLD_ID.matcher(id);
        if (m == null || !m.matches()) {
            return null;
        }
        Song known;
        synchronized (songsById) {
            known = songsById.get(id);
        }
        if (known != null) {
            return known;
        }
        try {
            List<Song> found = songs(read("https://itunes.apple.com/lookup?entity=song&country=" + m.group(1) + "&id=" + m.group(2)).path("results"), m.group(1));
            return found.stream().filter(s -> s.id().equals(id)).findFirst().orElse(null);
        } catch (ApiException e) {
            return null;
        }
    }

    // ---------------------------------------------------------------- Worldwide home

    /** Apple artist ids, looked up once (search by name is slower and ambiguous). */
    static final String[] INDIAN_STARS = {"484568188", "19715559", "3249567", "480976476", "401698843", "423087540",
            "1465633100", "214832525", "914892130", "1484701109", "300187267", "213157068", "117755361", "273046345", "1841842116"};
    static final String[] GLOBAL_STARS = {"159260351", "479756766", "883131348", "1126808565", "183313439", "1065981054", "271256",
            "1031397873", "889327", "1141774019", "412778295", "278873078", "63346553", "320569549", "471744", "111051", "1419227",
            "966309175", "979458609"};
    private static final long HOME_TTL_MS = 6 * 60 * 60_000L;

    private record ShelfDef(String id, java.util.function.Supplier<WorldShelf> load) {
    }

    private record Built(long at, WorldShelf shelf) {
    }

    private final Map<String, Built> homeShelves = new java.util.concurrent.ConcurrentHashMap<>();
    private final java.util.concurrent.atomic.AtomicBoolean warming = new java.util.concurrent.atomic.AtomicBoolean();
    private volatile Stars indianStars;
    private volatile Stars globalStars;

    private List<ShelfDef> shelfDefs() {
        return List.of(
                new ShelfDef("trending", () -> cards("trending", "Trending songs", "The most-played songs in India right now", chart("in").songs())
                        .withLink("/chart/in")),
                new ShelfDef("stars-in", () -> {
                    indianStars = stars(INDIAN_STARS, "in");
                    return new WorldShelf("stars-in", "Indian Superstars", "Bollywood and South legends", "artists", List.of(), indianStars.artists());
                }),
                new ShelfDef("stars-global", () -> {
                    globalStars = stars(GLOBAL_STARS, "us");
                    return new WorldShelf("stars-global", "Global Superstars", "The biggest names on the planet", "artists", List.of(), globalStars.artists());
                }),
                new ShelfDef("albums", () -> new WorldShelf("albums", "Popular albums and singles", "Most played in India", "albums",
                        List.of(), List.of(), List.of(), albumChart("in"), "/shelf/albums")),
                new ShelfDef("bollywood", () -> cards("bollywood", "Latest Bollywood", "Fresh from the films", freshFirst(search("bollywood", "in").songs()))),
                new ShelfDef("tamil", () -> cards("tamil", "Tamil Hits", "New from Kollywood", freshFirst(search("tamil", "in").songs()))),
                new ShelfDef("telugu", () -> cards("telugu", "Telugu Hits", "New from Tollywood", freshFirst(search("telugu", "in").songs()))),
                new ShelfDef("malayalam", () -> cards("malayalam", "Malayalam Melodies", "New from Mollywood", freshFirst(search("malayalam", "in").songs()))),
                new ShelfDef("kannada", () -> cards("kannada", "Kannada Hits", "New from Sandalwood", freshFirst(search("kannada", "in").songs()))),
                new ShelfDef("punjabi", () -> cards("punjabi", "Punjabi Power", "Bhangra, pop and hip-hop", freshFirst(search("punjabi", "in").songs()))),
                new ShelfDef("top-us", () -> cards("top-us", "Global Top Songs", "Most played in the United States", chart("us").songs()).withLink("/chart/us")),
                new ShelfDef("kpop", () -> cards("kpop", "K-Pop Now", "Top songs in South Korea", chart("kr").songs()).withLink("/chart/kr")),
                new ShelfDef("best-arijit", () -> essentials("best-arijit", indianStars, "484568188")),
                new ShelfDef("best-rahman", () -> essentials("best-rahman", indianStars, "3249567")),
                new ShelfDef("best-taylor", () -> essentials("best-taylor", globalStars, "159260351")));
    }

    /** Signed out: a taste. Signed in: the full home. */
    private static final List<String> HOME_SIGNED_OUT = List.of("trending", "popular-artists", "charts");
    private static final List<String> HOME_SIGNED_IN = List.of("trending", "popular-artists", "albums", "charts", "bollywood", "tamil",
            "telugu", "malayalam", "kannada", "punjabi", "top-us", "kpop", "best-arijit", "best-rahman", "best-taylor");

    private WorldShelf built(String id) {
        Built b = homeShelves.get(id);
        return b == null ? null : b.shelf();
    }

    /** Display shelves, including the ones composed from others (artists) or static (charts). */
    public WorldShelf shelf(String id, boolean signedIn) {
        return switch (id) {
            case "popular-artists" -> {
                List<WorldArtist> all = new ArrayList<>();
                WorldShelf in = built("stars-in"), gl = built("stars-global");
                if (in != null) {
                    all.addAll(in.artists());
                }
                if (gl != null) {
                    all.addAll(gl.artists());
                }
                yield all.isEmpty() ? null : new WorldShelf("popular-artists", "Popular artists", "From India and around the world", "artists", List.of(), all);
            }
            case "charts" -> new WorldShelf("charts", signedIn ? "Featured Charts" : "Top playlists", "Updated daily", "charts",
                    List.of(), List.of(), List.of(), List.of(), "/shelf/charts");
            default -> built(id);
        };
    }

    private static WorldShelf cards(String id, String title, String subtitle, List<Song> songs) {
        return new WorldShelf(id, title, subtitle, "cards", songs.stream().limit(20).toList(), List.of());
    }

    /** Songs from the last three years first (newest first), then the rest in Apple's relevance order. */
    static List<Song> freshFirst(List<Song> songs) {
        String cutoff = java.time.LocalDate.now().minusYears(3).toString();
        List<Song> fresh = songs.stream().filter(x -> x.releaseDate() != null && x.releaseDate().compareTo(cutoff) >= 0)
                .sorted(java.util.Comparator.comparing(Song::releaseDate).reversed()).toList();
        List<Song> out = new ArrayList<>(fresh);
        songs.stream().filter(x -> !fresh.contains(x)).forEach(out::add);
        return out;
    }

    /** The star's own songs first (lookups also return songs they only feature on). */
    private static List<Song> ownFirst(List<Song> songs, String name) {
        String n = name.toLowerCase(Locale.ROOT).replace(".", "");
        java.util.function.Predicate<Song> own = x -> x.artist().name().toLowerCase(Locale.ROOT).replace(".", "").contains(n);
        List<Song> out = new ArrayList<>(songs.stream().filter(own).toList());
        songs.stream().filter(own.negate()).forEach(out::add);
        return out;
    }

    private static WorldShelf essentials(String shelfId, Stars stars, String artistId) {
        if (stars == null) {
            throw new IllegalStateException("stars not loaded yet");
        }
        WorldArtist a = stars.artists().stream().filter(x -> x.id().equals("wa_" + artistId)).findFirst().orElseThrow();
        return cards(shelfId, a.name() + " Essentials", "Their best-known songs", stars.songsByArtist().getOrDefault(a.id(), List.of()));
    }

    /**
     * Home: every shelf that's ready, in order. Missing or stale shelves are (re)built in the
     * background, one Apple call at a time, so the page fills in within a minute of a cold start.
     */
    public WorldHome home(boolean signedIn) {
        long now = System.currentTimeMillis();
        boolean complete = shelfDefs().stream().allMatch(d -> {
            Built b = homeShelves.get(d.id());
            return b != null && now - b.at() <= HOME_TTL_MS;
        });
        if (!complete) {
            warmInBackground();
        }
        List<WorldShelf> ready = new ArrayList<>();
        for (String id : signedIn ? HOME_SIGNED_IN : HOME_SIGNED_OUT) {
            WorldShelf sh = shelf(id, signedIn);
            if (sh != null) {
                ready.add(sh);
            }
        }
        return new WorldHome(ready, complete);
    }

    public WorldHome home() {
        return home(true);
    }

    public void warmInBackground() {
        if (!warming.compareAndSet(false, true)) {
            return;
        }
        Thread t = new Thread(() -> {
            try {
                warm();
            } finally {
                warming.set(false);
            }
        }, "world-warm");
        t.setDaemon(true);
        t.start();
    }

    private org.springframework.context.ApplicationEventPublisher events;

    @org.springframework.beans.factory.annotation.Autowired(required = false)
    void setEvents(org.springframework.context.ApplicationEventPublisher events) {
        this.events = events;
    }

    /** Tell listeners (the demo account) which real songs are available now. */
    private void announce() {
        if (events == null) {
            return;
        }
        Map<String, List<Song>> songs = new LinkedHashMap<>();
        homeShelves.forEach((id, b) -> {
            if (!b.shelf().songs().isEmpty()) {
                songs.put(id, b.shelf().songs());
            }
        });
        if (songs.containsKey("trending")) {
            events.publishEvent(new WorldWarmedEvent(songs));
        }
    }

    /** Build every missing or stale shelf in display order. A failure skips that shelf until next time. */
    void warm() {
        long now = System.currentTimeMillis();
        for (ShelfDef d : shelfDefs()) {
            Built b = homeShelves.get(d.id());
            if (b != null && now - b.at() <= HOME_TTL_MS) {
                continue;
            }
            try {
                WorldShelf shelf = d.load().get();
                if (!shelf.songs().isEmpty() || !shelf.artists().isEmpty() || !shelf.albums().isEmpty()) {
                    homeShelves.put(d.id(), new Built(System.currentTimeMillis(), shelf));
                }
            } catch (RuntimeException e) {
                log.info("Worldwide shelf {} not ready: {}", d.id(), e.getMessage());
            }
        }
        announce();
    }

    /** Several artists' top songs in one Apple call: each artist record is followed by its tracks. */
    private Stars stars(String[] ids, String cc) {
        return stars(ids, cc, 10);
    }

    private Stars stars(String[] ids, String cc, int limit) {
        JsonNode results = read("https://itunes.apple.com/lookup?entity=song&limit=" + limit + "&country=" + cc + "&id=" + String.join(",", ids)).path("results");
        Map<String, WorldArtist> artists = new LinkedHashMap<>();
        Map<String, List<Song>> songs = new LinkedHashMap<>();
        String currentId = null;
        String currentName = null;
        String currentGenre = null;
        for (JsonNode r : results) {
            if ("artist".equals(r.path("wrapperType").asText())) {
                currentId = "wa_" + r.path("artistId").asLong();
                currentName = clean(r.path("artistName").asText());
                currentGenre = r.path("primaryGenreName").asText("");
                songs.put(currentId, new ArrayList<>());
                continue;
            }
            if (currentId == null) {
                continue;
            }
            List<Song> one = songs(com.fasterxml.jackson.databind.node.JsonNodeFactory.instance.arrayNode().add(r), cc);
            if (one.isEmpty()) {
                continue;
            }
            songs.get(currentId).add(one.get(0));
            artists.putIfAbsent(currentId, new WorldArtist(currentId, currentName, currentGenre, one.get(0).artwork(), cc));
        }
        // Keep the curated order; each star's own songs (and cover) first.
        List<WorldArtist> ordered = new ArrayList<>();
        Set<String> usedArt = new java.util.HashSet<>();
        for (String id : ids) {
            WorldArtist a = artists.get("wa_" + id);
            if (a == null) {
                continue;
            }
            List<Song> mine = ownFirst(songs.get(a.id()), a.name());
            songs.put(a.id(), mine);
            // A cover no other star in the row already uses (duets share covers).
            Artwork pic = mine.stream().map(Song::artwork).filter(x -> usedArt.add(x.url())).findFirst().orElse(mine.get(0).artwork());
            ordered.add(new WorldArtist(a.id(), a.name(), a.genre(), pic, a.country()));
        }
        return new Stars(ordered, songs);
    }

    /** An artist's page: their most popular songs with previews. */
    public ArtistPage artist(String artistId, String country) {
        String raw = artistId == null ? "" : artistId.replaceFirst("^wa_", "");
        if (!raw.matches("\\d{1,15}")) {
            throw ApiException.notFound("Artist not found.");
        }
        String cc = country(country);
        SongList list = cached("a:" + cc + ":" + raw, HOME_TTL_MS, () -> {
            Stars st = stars(new String[]{raw}, cc, 50);
            if (st.artists().isEmpty()) {
                throw ApiException.notFound("Artist not found.");
            }
            WorldArtist a = st.artists().get(0);
            return new SongList(a.name() + "\u0000" + a.genre(), cc, st.songsByArtist().get(a.id()));
        });
        String[] nameGenre = list.title().split("\u0000", 2);
        Song first = list.songs().isEmpty() ? null : list.songs().get(0);
        WorldArtist a = new WorldArtist("wa_" + raw, nameGenre[0], nameGenre.length > 1 ? nameGenre[1] : "",
                first == null ? null : first.artwork(), cc);
        return new ArtistPage(a, list.songs());
    }

    // ---------------------------------------------------------------- famous songs on every page

    /** Vybe genre id -> worldwide search (term, storefront). */
    private static final Map<String, String[]> GENRE_SEARCH = Map.ofEntries(
            Map.entry("pop", new String[]{"pop hits", "us", "Pop"}), Map.entry("hiphop", new String[]{"hip hop", "us", "Hip-Hop"}),
            Map.entry("rnb", new String[]{"r&b", "us", "R&B"}), Map.entry("electronic", new String[]{"edm", "us", "Electronic"}),
            Map.entry("rock", new String[]{"rock classics", "gb", "Rock"}), Map.entry("indie", new String[]{"indie", "us", "Indie"}),
            Map.entry("jazz", new String[]{"jazz", "us", "Jazz"}), Map.entry("classical", new String[]{"classical", "de", "Classical"}),
            Map.entry("country", new String[]{"country", "us", "Country"}), Map.entry("latin", new String[]{"latin pop", "mx", "Latin"}),
            Map.entry("ambient", new String[]{"ambient", "us", "Ambient"}), Map.entry("lofi", new String[]{"lofi", "us", "Lo-Fi"}));

    private List<Song> shelfSongs(String id) {
        Built b = homeShelves.get(id);
        return b == null ? List.of() : b.shelf().songs();
    }

    /** A genre page: famous songs from around the world in that genre (one cached search). */
    public WorldHome sectionGenre(String genreId) {
        String[] g = GENRE_SEARCH.get(genreId == null ? "" : genreId.toLowerCase(Locale.ROOT));
        if (g == null) {
            return new WorldHome(List.of(), true);
        }
        SongList list;
        try {
            list = search(g[0], g[1]);
        } catch (ApiException e) {
            return new WorldHome(List.of(), false); // Apple busy: the page tries again shortly
        }
        List<WorldShelf> out = new ArrayList<>();
        out.add(cards("genre-" + genreId, "Worldwide " + g[2], "Famous " + g[2] + " songs from around the world", list.songs()));
        List<Song> latest = freshFirst(list.songs()).stream().filter(x -> x.releaseDate() != null
                && x.releaseDate().compareTo(java.time.LocalDate.now().minusYears(3).toString()) >= 0).toList();
        if (latest.size() >= 4) {
            out.add(cards("genre-new-" + genreId, "New " + g[2], "Recent releases", latest));
        }
        return new WorldHome(out, true);
    }

    /** Apple Music's most-played albums in a country (the feed carries name, artist and cover). */
    private List<WorldAlbum> albumChart(String cc) {
        JsonNode feed = read("https://rss.applemarketingtools.com/api/v2/" + cc + "/music/most-played/25/albums.json");
        List<WorldAlbum> out = new ArrayList<>();
        for (JsonNode r : feed.path("feed").path("results")) {
            String id = r.path("id").asText();
            if (!id.matches("\\d{1,15}")) {
                continue;
            }
            out.add(new WorldAlbum("wl_" + cc + "_" + id, clean(r.path("name").asText()), clean(r.path("artistName").asText()),
                    "wa_" + r.path("artistId").asText("0"), art(r.path("artworkUrl100").asText(""), Long.parseLong(id)),
                    r.path("releaseDate").asText(""), cc));
        }
        return out;
    }

    private static Artwork art(String url100, long seed) {
        return new Artwork(url100.replace("100x100bb", "600x600bb"), 600, 600, PALETTE[(int) (Math.abs(seed) % PALETTE.length)], "#ffffff", "#e6e6eb", "#ffffff");
    }

    private WorldAlbum album(JsonNode r, String cc) {
        long id = r.path("collectionId").asLong();
        String date = r.path("releaseDate").asText("");
        return new WorldAlbum("wl_" + cc + "_" + id, clean(r.path("collectionName").asText("")), clean(r.path("artistName").asText("")),
                "wa_" + r.path("artistId").asLong(), art(r.path("artworkUrl100").asText(""), id), date.length() >= 10 ? date.substring(0, 10) : date, cc);
    }

    /** An album page: its songs with previews. */
    public AlbumPage albumPage(String albumId) {
        Matcher m = albumId == null ? null : Pattern.compile("^wl_([a-z]{2})_(\\d{1,15})$").matcher(albumId);
        if (m == null || !m.matches()) {
            throw ApiException.notFound("Album not found.");
        }
        String cc = m.group(1), raw = m.group(2);
        SongList list = cached("al:" + cc + ":" + raw, HOME_TTL_MS, () -> {
            JsonNode results = read("https://itunes.apple.com/lookup?entity=song&limit=200&country=" + cc + "&id=" + raw).path("results");
            List<Song> songs = songs(results, cc);
            for (JsonNode r : results) {
                if ("collection".equals(r.path("wrapperType").asText())) {
                    WorldAlbum a = album(r, cc);
                    return new SongList(a.title() + "\u0000" + a.artistName() + "\u0000" + a.artistId() + "\u0000" + a.releaseDate()
                            + "\u0000" + a.artwork().url(), cc, songs);
                }
            }
            throw ApiException.notFound("Album not found.");
        });
        String[] f = list.title().split("\u0000", -1);
        WorldAlbum a = new WorldAlbum(albumId, f[0], f[1], f[2], new Artwork(f[4], 600, 600,
                PALETTE[(int) (Math.abs(Long.parseLong(raw)) % PALETTE.length)], "#ffffff", "#e6e6eb", "#ffffff"), f[3], cc);
        return new AlbumPage(a, list.songs());
    }

    public record SearchAll(List<Song> songs, List<WorldArtist> artists, List<WorldAlbum> albums) {
    }

    /** Search: songs, plus the artists and albums those songs come from (one Apple call). */
    public SearchAll searchAll(String term, String country) {
        SongList list = search(term, country);
        Map<String, WorldArtist> artists = new LinkedHashMap<>();
        Map<String, WorldAlbum> albums = new LinkedHashMap<>();
        for (Song x : list.songs()) {
            artists.putIfAbsent(x.artist().id(), new WorldArtist(x.artist().id(), x.artist().name(), "", x.artwork(), list.country()));
            albums.putIfAbsent(x.album().id(), new WorldAlbum(x.album().id(), x.album().title(), x.artist().name(), x.artist().id(),
                    x.artwork(), x.releaseDate(), list.country()));
        }
        // Lead artist names only ("A & B" and "A, B" are separate people on Apple).
        List<WorldArtist> solo = artists.values().stream().filter(a -> !a.name().contains(",") && !a.name().contains(" & ")).limit(12).toList();
        return new SearchAll(list.songs(), solo.isEmpty() ? artists.values().stream().limit(12).toList() : solo,
                albums.values().stream().limit(20).toList());
    }

    public static boolean isWorldId(String id) {
        return id != null && WORLD_ID.matcher(id).matches();
    }

    // ---------------------------------------------------------------- mapping

    private List<Song> songs(JsonNode results, String cc) {
        List<Song> out = new ArrayList<>();
        Set<String> seen = new java.util.HashSet<>();
        for (JsonNode r : results) {
            if (!"song".equals(r.path("kind").asText()) || r.path("previewUrl").asText().isBlank()) {
                continue; // albums/artists in lookups, and the rare track without a preview
            }
            String preview = r.path("previewUrl").asText();
            if (!preview.startsWith("https://")) {
                continue;
            }
            Song s = toSong(r, cc, preview);
            if (seen.add(s.id())) {
                out.add(s);
            }
        }
        synchronized (songsById) {
            out.forEach(s -> songsById.put(s.id(), s));
        }
        return out;
    }

    /** Names from Apple sometimes carry doubled or trailing spaces; show them tidy. */
    private static String clean(String v) {
        return v == null ? "" : v.replaceAll("\\s+", " ").trim();
    }

    private Song toSong(JsonNode r, String cc, String preview) {
        long trackId = r.path("trackId").asLong();
        String art = r.path("artworkUrl100").asText("").replace("100x100bb", "600x600bb");
        String bg = PALETTE[(int) (Math.abs(r.path("collectionId").asLong()) % PALETTE.length)];
        String released = r.path("releaseDate").asText("");
        return new Song(
                "wd_" + cc + "_" + trackId,
                clean(r.path("trackName").asText("Untitled")),
                new ArtistRef("wa_" + r.path("artistId").asLong(), clean(r.path("artistName").asText("Unknown Artist"))),
                List.of(),
                new AlbumRef("wl_" + cc + "_" + r.path("collectionId").asLong(), clean(r.path("collectionName").asText(""))),
                "world",
                r.path("trackNumber").asInt(1),
                r.path("discNumber").asInt(1),
                30_000, // previews are 30 seconds; the player reads the exact length from the audio
                "explicit".equals(r.path("trackExplicitness").asText()),
                false,
                preview,
                new Artwork(art, 600, 600, bg, "#ffffff", "#e6e6eb", "#ffffff"),
                released.length() >= 10 ? released.substring(0, 10) : released,
                0,
                "upbeat",
                0.5,
                0,
                null,
                "world",
                null);
    }

    // ---------------------------------------------------------------- plumbing

    private String country(String cc) {
        String c = cc == null ? "" : cc.strip().toLowerCase(Locale.ROOT);
        return COUNTRIES.containsKey(c) ? c : "us";
    }

    private SongList cached(String key, long ttl, java.util.function.Supplier<SongList> load) {
        long now = System.currentTimeMillis();
        synchronized (cache) {
            Cached c = cache.get(key);
            if (c != null && c.expires() > now) {
                return c.value();
            }
        }
        SongList fresh = load.get();
        synchronized (cache) {
            cache.put(key, new Cached(now + ttl, fresh));
        }
        return fresh;
    }

    private JsonNode read(String url) {
        try {
            return json.readTree(fetcher.apply(url));
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Worldwide music unavailable ({}): {}", url.replaceAll("\\?.*", ""), e.toString());
            throw unavailable();
        }
    }

    /**
     * Apple allows ~20 calls a minute per server. A rolling one-minute budget of 18 calls: what a
     * listener is waiting for (opening an album, a search) goes out at once while budget remains;
     * the background home builder only spends calls while 6 are still free for listeners.
     */
    private static final int BUDGET = 18;
    private static final int RESERVED_FOR_LISTENERS = 6;
    private static final long WINDOW_MS = 60_000;
    private final Object gate = new Object();
    private final java.util.ArrayDeque<Long> recent = new java.util.ArrayDeque<>();
    private long refusedUntil;

    private static boolean background() {
        return Thread.currentThread().getName().startsWith("world-");
    }

    private void waitTurn() throws InterruptedException {
        boolean bg = background();
        int limit = bg ? BUDGET - RESERVED_FOR_LISTENERS : BUDGET;
        long deadline = System.currentTimeMillis() + (bg ? 10 * 60_000L : 12_000L);
        while (true) {
            long wait;
            synchronized (gate) {
                long now = System.currentTimeMillis();
                while (!recent.isEmpty() && now - recent.peekFirst() >= WINDOW_MS) {
                    recent.pollFirst();
                }
                boolean cooling = bg && now < refusedUntil; // after a refusal, background work steps back
                // Background calls are spaced out so they never burst (Apple refuses bursts early).
                boolean spaced = !bg || recent.isEmpty() || now - recent.peekLast() >= 4_000;
                if (!cooling && spaced && recent.size() < limit) {
                    recent.addLast(now);
                    return;
                }
                wait = cooling ? refusedUntil - now
                        : recent.size() < limit ? 4_000 - (now - recent.peekLast())
                        : WINDOW_MS - (now - recent.peekFirst()) + 50;
                if (now + wait > deadline) {
                    throw new ApiException(503, "world_busy", "Lots of people are listening right now. Try again in a few seconds.");
                }
            }
            Thread.sleep(Math.min(wait, 2_000));
        }
    }

    private String httpGet(String url) {
        try {
            String body = httpGetOnce(url);
            if (body != null) {
                return body;
            }
            // Refused (rate limit): background work pauses for 30 s; a listener's request retries once shortly.
            synchronized (gate) {
                refusedUntil = System.currentTimeMillis() + 30_000;
            }
            Thread.sleep(background() ? 30_000 : 4_000);
            body = httpGetOnce(url);
            if (body != null) {
                return body;
            }
            throw new ApiException(503, "world_busy", "Worldwide music is busy right now. Try again in a minute.");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw unavailable();
        }
    }

    /** One call; {@code null} when Apple refuses (403/429). */
    private String httpGetOnce(String url) throws InterruptedException {
        waitTurn();
        try {
            HttpRequest req = HttpRequest.newBuilder(URI.create(url)).timeout(Duration.ofSeconds(10))
                    .header("Accept", "application/json").header("User-Agent", "Vybe/1.0").GET().build();
            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() == 403 || res.statusCode() == 429) {
                return null;
            }
            if (res.statusCode() != 200) {
                throw new IllegalStateException("HTTP " + res.statusCode());
            }
            return res.body();
        } catch (java.io.IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private static ApiException unavailable() {
        return new ApiException(502, "world_unavailable", "Worldwide music isn't reachable right now. Try again soon.");
    }

    private static <K, V> Map<K, V> lru(int max) {
        return new LinkedHashMap<>(64, 0.75f, true) {
            @Override
            protected boolean removeEldestEntry(Map.Entry<K, V> eldest) {
                return size() > max;
            }
        };
    }

    private static Map<String, String> orderedCountries() {
        Map<String, String> m = new LinkedHashMap<>();
        String[][] list = {
                {"in", "India"}, {"us", "United States"}, {"gb", "United Kingdom"}, {"kr", "South Korea"},
                {"jp", "Japan"}, {"br", "Brazil"}, {"mx", "Mexico"}, {"es", "Spain"}, {"fr", "France"},
                {"de", "Germany"}, {"it", "Italy"}, {"ng", "Nigeria"}, {"za", "South Africa"}, {"ae", "United Arab Emirates"},
                {"eg", "Egypt"}, {"tr", "Türkiye"}, {"pk", "Pakistan"}, {"np", "Nepal"}, {"id", "Indonesia"},
                {"ph", "Philippines"}, {"au", "Australia"}, {"ca", "Canada"}, {"ar", "Argentina"}, {"co", "Colombia"},
        };
        for (String[] c : list) {
            m.put(c[0], c[1]);
        }
        return java.util.Collections.unmodifiableMap(m);
    }
}
