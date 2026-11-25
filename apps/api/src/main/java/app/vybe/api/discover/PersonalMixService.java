package app.vybe.api.discover;

import app.vybe.api.catalog.CatalogStore;
import app.vybe.api.history.HistoryRepository;
import app.vybe.api.library.LibraryRepository;
import app.vybe.api.model.Artwork;
import app.vybe.api.model.Genre;
import app.vybe.api.model.Playlist;
import app.vybe.api.model.Song;
import app.vybe.api.model.Station;
import app.vybe.api.model.User;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/**
 * Builds the four "Made For You" mixes for a user, dynamically from play history and loves.
 * Mix ids are {@code pl_mix_<kind>_<userId>}; a mix only resolves for the user it was built for.
 */
@Service
public class PersonalMixService {

    public static final String PREFIX = "pl_mix_";
    public static final List<String> KINDS = List.of("favorites", "discovery", "chill", "newmusic", "weekly");
    /** Daily Mix 1..6: one per top genre; ids are pl_mix_dailyN_<userId>. */
    public static final int MAX_DAILY = 6;
    private static final int MIX_SIZE = 30;

    /** The user's listening signals, derived once per request. */
    public record Profile(
            Map<String, Integer> plays,
            Map<String, Integer> genrePlays,
            Map<String, Integer> artistPlays,
            Set<String> lovedSongs,
            List<HistoryRepository.PlayRow> recent) {
    }

    private final CatalogStore catalog;
    private final HistoryRepository history;
    private final LibraryRepository library;
    private final Similarity similarity;

    public PersonalMixService(CatalogStore catalog, HistoryRepository history,
                              LibraryRepository library, Similarity similarity) {
        this.catalog = catalog;
        this.history = history;
        this.library = library;
        this.similarity = similarity;
    }

    public Profile profile(String userId) {
        // Only catalog songs feed mixes; plays of imported tracks (private, "im_" ids) are ignored.
        Map<String, Integer> plays = new HashMap<>(history.playCounts(userId));
        plays.keySet().removeIf(id -> catalog.song(id) == null);
        Map<String, Integer> genrePlays = new HashMap<>();
        Map<String, Integer> artistPlays = new HashMap<>();
        for (Map.Entry<String, Integer> e : plays.entrySet()) {
            Song s = catalog.song(e.getKey());
            if (s != null) {
                genrePlays.merge(s.genreId(), e.getValue(), Integer::sum);
                artistPlays.merge(s.artist().id(), e.getValue(), Integer::sum);
            }
        }
        Set<String> loved = new LinkedHashSet<>();
        for (LibraryRepository.Ref ref : library.loves(userId)) {
            if ("song".equals(ref.type())) {
                loved.add(ref.id());
            }
        }
        return new Profile(plays, genrePlays, artistPlays, loved, history.recent(userId, 300));
    }

    /** All four mixes, in display order. */
    public List<Playlist> mixes(User user, Profile profile) {
        List<Playlist> out = new ArrayList<>(KINDS.size());
        for (String kind : KINDS) {
            out.add(build(kind, user, profile));
        }
        return out;
    }

    /** Resolves a mix id for {@code user}, or empty when the id is not a mix of this user. */
    public Optional<Playlist> resolve(String mixId, User user) {
        if (user == null || !mixId.startsWith(PREFIX)) {
            return Optional.empty();
        }
        String rest = mixId.substring(PREFIX.length());
        String suffix = "_" + user.id();
        if (!rest.endsWith(suffix)) {
            return Optional.empty();
        }
        String kind = rest.substring(0, rest.length() - suffix.length());
        Profile profile = profile(user.id());
        if (kind.startsWith("daily")) {
            int n;
            try { n = Integer.parseInt(kind.substring(5)); } catch (NumberFormatException e) { return Optional.empty(); }
            List<String> genres = dailyGenres(profile);
            if (n < 1 || n > genres.size()) return Optional.empty();
            return Optional.of(buildDaily(n, genres.get(n - 1), user, profile));
        }
        if (!KINDS.contains(kind)) {
            return Optional.empty();
        }
        return Optional.of(build(kind, user, profile));
    }

    static String mixId(String kind, String userId) {
        return PREFIX + kind + "_" + userId;
    }

    private Playlist build(String kind, User user, Profile profile) {
        List<String> tracks = switch (kind) {
            case "favorites" -> favorites(profile);
            case "discovery" -> discovery(profile);
            case "chill" -> chill(user, profile);
            case "newmusic" -> newMusic();
            case "weekly" -> discoverWeekly(user, profile);
            default -> throw new IllegalArgumentException("unknown mix " + kind);
        };
        List<Song> songs = tracks.stream().map(catalog::song).toList();
        long duration = songs.stream().mapToLong(Song::durationMs).sum();
        String[] copy = copyFor(kind);
        return new Playlist(mixId(kind, user.id()), "personal-mix", copy[0], "Vybe", copy[1], copy[2],
                artworkFor(kind, songs, profile), tracks, duration, user.createdAt(), false, user.id());
    }

    private static String[] copyFor(String kind) {
        return switch (kind) {
            case "favorites" -> new String[]{"Favorites Mix", "Your most played songs and loves, in one place.",
                    "Your favourites, mixed."};
            case "discovery" -> new String[]{"Discovery Mix", "Songs you haven't played yet, from the genres you love.",
                    "New finds in your genres."};
            case "chill" -> new String[]{"Chill Mix", "Calm, dreamy and focused music for slow moments.",
                    "Slow down and unwind."};
            case "weekly" -> new String[]{"Discover Weekly", "Your weekly mixtape of fresh music you haven't heard yet, picked from what you love. Updated every Monday.",
                    "Fresh finds, every Monday."};
            default -> new String[]{"New Music Mix", "The newest releases in the catalog, picked for you.",
                    "Fresh releases every week."};
        };
    }

    private List<String> favorites(Profile p) {
        Set<String> out = new LinkedHashSet<>();
        p.plays().entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey()))
                .limit(MIX_SIZE)
                .forEach(e -> out.add(e.getKey()));
        p.lovedSongs().stream().filter(id -> catalog.song(id) != null).forEach(out::add);
        if (out.isEmpty()) {
            catalog.songsByPopularity().stream().limit(MIX_SIZE).forEach(s -> out.add(s.id()));
        }
        return out.stream().limit(MIX_SIZE).toList();
    }

    private List<String> discovery(Profile p) {
        List<String> topGenres = p.genrePlays().isEmpty()
                ? catalog.genres().stream().map(Genre::id).limit(3).toList()
                : p.genrePlays().entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey()))
                .limit(3).map(Map.Entry::getKey).toList();
        List<Song> candidates = catalog.songsByPopularity().stream()
                .filter(s -> topGenres.contains(s.genreId()) && !p.plays().containsKey(s.id()))
                .toList();
        return ids(Similarity.diversify(candidates, MIX_SIZE, 3));
    }

    // ------------------------------------------------------------------ Discover Weekly + Daily Mixes

    static String weekKey(java.time.LocalDate d) {
        return d.get(java.time.temporal.IsoFields.WEEK_BASED_YEAR) + "-W" + d.get(java.time.temporal.IsoFields.WEEK_OF_WEEK_BASED_YEAR);
    }

    private static <K> List<K> topKeys(Map<K, Integer> counts, int n) {
        return counts.entrySet().stream()
                .sorted(Map.Entry.<K, Integer>comparingByValue().reversed().thenComparing(e -> String.valueOf(e.getKey())))
                .limit(n).map(Map.Entry::getKey).toList();
    }

    /** Unheard songs near the user's taste; the ordering seed changes every ISO week. */
    private List<String> discoverWeekly(User user, Profile p) {
        String seed = user.id() + ":" + weekKey(java.time.LocalDate.now(java.time.ZoneOffset.UTC));
        Set<String> genres = new java.util.HashSet<>(topKeys(p.genrePlays(), 3));
        Set<String> nearArtists = new java.util.HashSet<>();
        for (String a : topKeys(p.artistPlays(), 5)) {
            similarity.similarArtists(a, 5).forEach(x -> nearArtists.add(x.id()));
        }
        List<Song> ranked = catalog.songs().stream()
                .filter(s -> !p.plays().containsKey(s.id()) && !p.lovedSongs().contains(s.id()))
                .sorted(Comparator.<Song>comparingDouble(s -> (genres.contains(s.genreId()) ? 1.0 : 0)
                        + (nearArtists.contains(s.artist().id()) ? 0.8 : 0)
                        + s.popularity() / 200.0 + 0.6 * Similarity.jitter(seed, s.id())).reversed()
                        .thenComparing(Song::id))
                .toList();
        if (ranked.size() < 10) {
            // Heavy listeners may have heard almost everything: top up with popular songs, least-played first.
            List<Song> topUp = catalog.songsByPopularity().stream()
                    .filter(s -> !ranked.contains(s))
                    .sorted(Comparator.<Song>comparingInt(s -> p.plays().getOrDefault(s.id(), 0))
                            .thenComparing(Comparator.comparingInt(Song::popularity).reversed()).thenComparing(Song::id))
                    .toList();
            List<Song> all = new ArrayList<>(ranked);
            all.addAll(topUp);
            return ids(Similarity.diversify(all, MIX_SIZE, 2));
        }
        return ids(Similarity.diversify(ranked, MIX_SIZE, 2));
    }

    /** Top genres by plays (up to six); new listeners get the catalog's first genres. */
    public List<String> dailyGenres(Profile p) {
        List<String> top = topKeys(p.genrePlays(), MAX_DAILY);
        return top.isEmpty() ? catalog.genres().stream().map(Genre::id).limit(3).toList() : top;
    }

    public List<Playlist> dailyMixes(User user, Profile profile) {
        List<String> genres = dailyGenres(profile);
        List<Playlist> out = new ArrayList<>();
        for (int i = 0; i < genres.size(); i++) out.add(buildDaily(i + 1, genres.get(i), user, profile));
        return out;
    }

    private Playlist buildDaily(int n, String genreId, User user, Profile p) {
        String seed = user.id() + ":" + java.time.LocalDate.now(java.time.ZoneOffset.UTC);
        List<Song> inGenre = catalog.songs().stream().filter(s -> genreId.equals(s.genreId())).toList();
        List<Song> favs = inGenre.stream().filter(s -> p.plays().containsKey(s.id()))
                .sorted(Comparator.<Song>comparingInt(s -> -p.plays().get(s.id())).thenComparing(Song::id))
                .limit(MIX_SIZE / 2).toList();
        List<Song> fresh = inGenre.stream().filter(s -> !p.plays().containsKey(s.id()))
                .sorted(Comparator.<Song>comparingDouble(s -> s.popularity() / 100.0 + Similarity.jitter(seed, s.id())).reversed()
                        .thenComparing(Song::id))
                .toList();
        // Interleave favourites with new songs from the same genre, like a radio mix.
        List<Song> mixed = new ArrayList<>();
        for (int i = 0; mixed.size() < MIX_SIZE && (i < favs.size() || i < fresh.size()); i++) {
            if (i < favs.size()) mixed.add(favs.get(i));
            if (i < fresh.size() && mixed.size() < MIX_SIZE) mixed.add(fresh.get(i));
        }
        List<String> tracks = ids(Similarity.diversify(mixed, MIX_SIZE, 4));
        List<Song> songs = tracks.stream().map(catalog::song).toList();
        Genre g = catalog.genre(genreId);
        String gName = g != null ? g.name() : genreId;
        List<String> artistNames = songs.stream().map(s -> s.artist().name()).distinct().limit(2).toList();
        String shortDesc = gName + (artistNames.isEmpty() ? "" : ", " + String.join(", ", artistNames)) + " and more";
        Artwork art = songs.isEmpty() ? genreArtwork(genreId) : songs.get(0).artwork();
        return new Playlist(mixId("daily" + n, user.id()), "personal-mix", "Daily Mix " + n, "Vybe",
                gName + " favourites mixed with new songs you'll like. Updated daily.", shortDesc, art, tracks,
                songs.stream().mapToLong(Song::durationMs).sum(), user.createdAt(), false, user.id());
    }

    private List<String> chill(User user, Profile p) {
        List<Song> candidates = catalog.songs().stream()
                .filter(s -> ("chill".equals(s.mood()) || "dreamy".equals(s.mood())
                        || "focus".equals(s.mood()) || "melancholy".equals(s.mood())) && s.energy() <= 0.5)
                .sorted(Comparator.<Song>comparingDouble(s -> chillScore(user, p, s)).reversed()
                        .thenComparing(Song::id))
                .toList();
        return ids(Similarity.diversify(candidates, MIX_SIZE, 3));
    }

    private double chillScore(User user, Profile p, Song s) {
        double played = p.plays().containsKey(s.id()) ? 0.5 : 0;
        return played + s.popularity() / 100.0 + 0.3 * Similarity.jitter(user.id(), s.id());
    }

    private List<String> newMusic() {
        List<Song> newest = catalog.songs().stream()
                .sorted(Comparator.comparing(Song::releaseDate, Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(Comparator.comparingInt(Song::popularity).reversed())
                        .thenComparing(Song::id))
                .toList();
        return ids(Similarity.diversify(newest, MIX_SIZE, 3));
    }

    /**
     * Mix artwork comes from a song in the mix (station and genre tiles carry baked-in titles that
     * clash with the mix-name overlay). Each mix picks a different index so cards stay distinct.
     */
    private Artwork artworkFor(String kind, List<Song> songs, Profile profile) {
        if (!songs.isEmpty()) {
            int idx = switch (kind) {
                case "favorites" -> 0;
                case "discovery" -> 1;
                case "chill" -> 2;
                case "weekly" -> 4;
                default -> 3;
            };
            return songs.get(Math.min(idx, songs.size() - 1)).artwork();
        }
        return genreArtwork(profile.genrePlays().entrySet().stream()
                .max(Map.Entry.comparingByValue()).map(Map.Entry::getKey).orElse(null));
    }

    private Artwork genreArtwork(String genreId) {
        Genre g = genreId == null ? null : catalog.genre(genreId);
        if (g == null) {
            g = catalog.genres().get(0);
        }
        return g.artwork();
    }

    private static List<String> ids(List<Song> songs) {
        return songs.stream().map(Song::id).toList();
    }
}
