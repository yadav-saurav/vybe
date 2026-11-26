package app.vybe.api.seed;

import app.vybe.api.auth.AuthService;
import app.vybe.api.auth.UserRepository;
import app.vybe.api.history.HistoryRepository;
import app.vybe.api.library.LibraryRepository;
import app.vybe.api.model.Song;
import app.vybe.api.model.User;
import app.vybe.api.playlists.PlaylistRepository;
import app.vybe.api.playlists.PlaylistService;
import app.vybe.api.world.WorldService;
import app.vybe.api.world.WorldSongStore;
import app.vybe.api.world.WorldWarmedEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * Gives the shared demo account a library of real songs. Vybe used to ship a generated catalog and
 * the demo account was filled from it; once the worldwide charts are gathered, any demo library
 * without real songs is replaced: saved songs, favourites, two playlists and recent plays.
 * Runs at most once per server start, and never touches a demo library that already has real songs.
 */
@Component
public class DemoWorldSeeder {

    private static final Logger log = LoggerFactory.getLogger(DemoWorldSeeder.class);

    private final String demoEmail;
    private final UserRepository users;
    private final AuthService auth;
    private final LibraryRepository library;
    private final PlaylistRepository playlistRows;
    private final PlaylistService playlists;
    private final HistoryRepository history;
    private final WorldSongStore worldSongs;
    private volatile boolean done;
    private final boolean enabled;

    public DemoWorldSeeder(@Value("${vybe.demo-email:${VYBE_DEMO_EMAIL:demo@vybe.app}}") String demoEmail,
                           @Value("${vybe.demo.refresh:true}") boolean enabled,
                           UserRepository users, AuthService auth, LibraryRepository library, PlaylistRepository playlistRows,
                           PlaylistService playlists, HistoryRepository history, WorldSongStore worldSongs) {
        this.demoEmail = demoEmail;
        this.enabled = enabled;
        this.users = users;
        this.auth = auth;
        this.library = library;
        this.playlistRows = playlistRows;
        this.playlists = playlists;
        this.history = history;
        this.worldSongs = worldSongs;
    }

    @EventListener
    public synchronized void onWorldReady(WorldWarmedEvent event) {
        if (done || !enabled) {
            return;
        }
        String demoId = users.idByEmail(demoEmail).orElse(null);
        if (demoId == null) {
            done = true;
            return;
        }
        boolean hasRealSongs = library.items(demoId, "song").stream().anyMatch(r -> WorldService.isWorldId(r.id()));
        if (hasRealSongs) {
            done = true;
            return;
        }
        User demo = auth.userById(demoId).orElse(null);
        if (demo == null) {
            return;
        }
        Map<String, List<Song>> shelves = event.songsByShelf();
        List<Song> pool = pick(shelves, new String[]{"trending", "bollywood", "punjabi", "tamil", "telugu", "top-us", "kpop", "best-arijit"}, 3, 30);
        if (pool.size() < 8) {
            return; // try again after the next warm-up
        }
        reset(demoId);
        pool.forEach(worldSongs::save); // the library keeps working even if Apple is unreachable later

        Random rnd = new Random(20261126L);
        Instant now = Instant.now();
        List<Song> saved = pool.subList(0, Math.min(24, pool.size()));
        for (int i = 0; i < saved.size(); i++) {
            library.addItem(demoId, "song", saved.get(i).id(), now.minus(Duration.ofHours(6L * i + rnd.nextInt(5))).toString());
        }
        for (int i = 0; i < Math.min(6, saved.size()); i += 1) {
            library.addLove(demoId, "song", saved.get(i * 3 % saved.size()).id(), now.minus(Duration.ofHours(3L * i + 1)).toString());
        }
        List<Song> bolly = pick(shelves, new String[]{"bollywood", "best-arijit", "trending"}, 6, 10);
        List<Song> global = pick(shelves, new String[]{"top-us", "kpop", "best-taylor"}, 4, 10);
        if (!bolly.isEmpty()) {
            bolly.forEach(worldSongs::save);
            playlists.create(demo, new PlaylistService.CreateRequest("Bollywood Nights", "Romantic hits for late evenings.", bolly.stream().map(Song::id).toList()));
        }
        if (!global.isEmpty()) {
            global.forEach(worldSongs::save);
            playlists.create(demo, new PlaylistService.CreateRequest("Global Hits", "The biggest songs around the world.", global.stream().map(Song::id).toList()));
        }
        // About 60 plays over the last two weeks, mostly from the library.
        for (int i = 0; i < 60; i++) {
            Song s = saved.get(rnd.nextInt(saved.size()));
            Instant at = now.minus(Duration.ofMinutes(20L + rnd.nextInt(14 * 24 * 60)));
            history.insert(demoId, s.id(), at.toString(), 30_000, null, null);
        }
        done = true;
        log.info("Demo account refreshed with {} real songs", saved.size());
    }

    /** Remove the demo's old generated-catalog library, favourites, playlists and plays. */
    private void reset(String demoId) {
        for (LibraryRepository.Ref r : library.allItems(demoId)) {
            library.removeItem(demoId, r.type(), r.id());
        }
        for (LibraryRepository.Ref r : library.loves(demoId)) {
            library.removeLove(demoId, r.type(), r.id());
        }
        for (PlaylistRepository.Row row : playlistRows.findByUser(demoId)) {
            playlistRows.delete(row.id());
        }
        history.deleteAll(demoId);
    }

    /** Up to {@code perShelf} songs from each shelf in order, de-duplicated, at most {@code max}. */
    private static List<Song> pick(Map<String, List<Song>> shelves, String[] ids, int perShelf, int max) {
        Map<String, Song> out = new LinkedHashMap<>();
        for (String id : ids) {
            List<Song> list = shelves.getOrDefault(id, List.of());
            int taken = 0;
            for (Song s : list) {
                if (taken >= perShelf || out.size() >= max) {
                    break;
                }
                if (out.putIfAbsent(s.id(), s) == null) {
                    taken++;
                }
            }
        }
        return new ArrayList<>(out.values());
    }
}
