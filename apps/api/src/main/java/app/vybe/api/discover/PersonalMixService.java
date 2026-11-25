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
    public static final List<String> KINDS = List.of("favorites", "discovery", "chill", "newmusic");
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
        Map<String, Integer> plays = history.playCounts(userId);
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
        if (!KINDS.contains(kind)) {
            return Optional.empty();
        }
        return Optional.of(build(kind, user, profile(user.id())));
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
