package app.vybe.api.seed;

import app.vybe.api.auth.AuthService;
import app.vybe.api.catalog.CatalogStore;
import app.vybe.api.common.Timestamps;
import app.vybe.api.config.VybeProperties;
import app.vybe.api.history.HistoryRepository;
import app.vybe.api.library.LibraryRepository;
import app.vybe.api.model.Album;
import app.vybe.api.model.Playlist;
import app.vybe.api.model.Song;
import app.vybe.api.model.User;
import app.vybe.api.playlists.PlaylistService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Random;

/**
 * Creates the demo account on an empty database: a library, loves, two user playlists and about
 * 120 plays over the last 30 days. Uses a fixed random seed so the same catalog gives the same data.
 */
@Component
@Order(100)
public class DemoSeeder implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(DemoSeeder.class);
    static final String DEMO_EMAIL = "demo@vybe.app";
    static final String DEMO_PASSWORD = "vybe1234";
    static final String DEMO_NAME = "Alex";
    private static final long SEED = 20261125L;

    private final VybeProperties props;
    private final AuthService auth;
    private final CatalogStore catalog;
    private final LibraryRepository library;
    private final HistoryRepository history;
    private final PlaylistService playlists;

    public DemoSeeder(VybeProperties props, AuthService auth, CatalogStore catalog, LibraryRepository library,
                      HistoryRepository history, PlaylistService playlists) {
        this.props = props;
        this.auth = auth;
        this.catalog = catalog;
        this.library = library;
        this.history = history;
        this.playlists = playlists;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (!props.autoseed() || auth.hasUsers()) {
            return;
        }
        User demo = auth.signUp(DEMO_EMAIL, DEMO_PASSWORD, DEMO_NAME);
        if (catalog.songs().isEmpty()) {
            return; // worldwide-only: DemoWorldSeeder fills the demo library with real songs
        }
        Random rnd = new Random(SEED);
        Instant now = Instant.now();

        // Library: about 40 songs, 8 albums, 4 editorial playlists, spread over the last 30 days.
        List<Song> songs = new ArrayList<>(catalog.songs());
        Collections.shuffle(songs, rnd);
        List<Song> librarySongs = songs.subList(0, Math.min(40, songs.size()));
        for (Song s : librarySongs) {
            library.addItem(demo.id(), "song", s.id(), at(now, rnd));
        }

        List<Album> albums = new ArrayList<>(catalog.albums());
        Collections.shuffle(albums, rnd);
        List<Album> libraryAlbums = albums.subList(0, Math.min(8, albums.size()));
        for (Album a : libraryAlbums) {
            String when = at(now, rnd);
            library.addItem(demo.id(), "album", a.id(), when);
            library.addItem(demo.id(), "artist", a.artist().id(), when);
        }

        List<Playlist> editorial = new ArrayList<>(catalog.editorialPlaylists());
        Collections.shuffle(editorial, rnd);
        for (Playlist p : editorial.subList(0, Math.min(4, editorial.size()))) {
            library.addItem(demo.id(), "playlist", p.id(), at(now, rnd));
        }

        // Loves: a handful of songs and an album.
        for (Song s : librarySongs.subList(0, Math.min(6, librarySongs.size()))) {
            library.addLove(demo.id(), "song", s.id(), at(now, rnd));
        }
        if (!libraryAlbums.isEmpty()) {
            library.addLove(demo.id(), "album", libraryAlbums.get(0).id(), at(now, rnd));
        }

        // Two user playlists with tracks.
        playlists.create(demo, new PlaylistService.CreateRequest("Sunday Slow Down",
                "Easy listening for lazy afternoons.", pick(librarySongs, 9, rnd)));
        playlists.create(demo, new PlaylistService.CreateRequest("Gym Warmup",
                "Fast tempo for the first ten minutes.", pick(songs, 7, rnd)));

        // About 120 plays over 30 days: mostly library songs, with album or playlist contexts.
        List<String> playedPool = new ArrayList<>();
        librarySongs.forEach(s -> playedPool.add(s.id()));
        for (int i = 0; i < 120; i++) {
            Song s = rnd.nextInt(10) < 7 && !playedPool.isEmpty()
                    ? catalog.song(playedPool.get(rnd.nextInt(playedPool.size())))
                    : songs.get(rnd.nextInt(songs.size()));
            if (s == null) {
                continue;
            }
            String ctype = null;
            String cid = null;
            int roll = rnd.nextInt(10);
            if (roll < 5) {
                ctype = "album";
                cid = s.album().id();
            } else if (roll < 7 && !editorial.isEmpty()) {
                ctype = "playlist";
                cid = editorial.get(rnd.nextInt(editorial.size())).id();
            }
            int playedMs = (int) Math.min(s.durationMs(), 60_000 + rnd.nextInt(180_000));
            history.insert(demo.id(), s.id(), Timestamps.format(now.minus(Duration.ofMinutes(rnd.nextInt(30 * 24 * 60)))),
                    playedMs, ctype, cid);
        }
        log.info("seeded demo user {} with library, loves, playlists and history", DEMO_EMAIL);
    }

    private static String at(Instant now, Random rnd) {
        return Timestamps.format(now.minus(Duration.ofMinutes(rnd.nextInt(30 * 24 * 60))));
    }

    private static List<String> pick(List<Song> from, int n, Random rnd) {
        List<String> ids = new ArrayList<>();
        for (int i = 0; i < n && !from.isEmpty(); i++) {
            ids.add(from.get(rnd.nextInt(from.size())).id());
        }
        return ids;
    }
}
