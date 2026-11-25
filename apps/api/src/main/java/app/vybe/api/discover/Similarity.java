package app.vybe.api.discover;

import app.vybe.api.catalog.CatalogStore;
import app.vybe.api.model.Album;
import app.vybe.api.model.Artist;
import app.vybe.api.model.Song;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Content similarity for autoplay, stations, "because you listened" and "you might also like".
 * Scores are deterministic: a small jitter derived from the two ids varies the order between
 * seeds without making results change between requests.
 */
@Component
public class Similarity {

    private final CatalogStore catalog;

    public Similarity(CatalogStore catalog) {
        this.catalog = catalog;
    }

    record Scored<T>(T item, double score) {
    }

    /** Autoplay continuation after {@code seed}: best matches first, at most 2 tracks per primary artist. */
    public List<Song> autoplay(Song seed, Set<String> exclude, int count) {
        List<Scored<Song>> ranked = new ArrayList<>(catalog.songs().size());
        for (Song s : catalog.songs()) {
            if (s.id().equals(seed.id()) || exclude.contains(s.id())) {
                continue;
            }
            ranked.add(new Scored<>(s, songScore(seed, s)));
        }
        ranked.sort(Comparator.<Scored<Song>>comparingDouble(Scored::score).reversed()
                .thenComparing(x -> x.item().id()));
        return diversify(ranked.stream().map(Scored::item).toList(), count, 2);
    }

    public double songScore(Song seed, Song cand) {
        double s = 0;
        if (seed.genreId().equals(cand.genreId())) {
            s += 3;
        }
        if (sharesArtist(seed, cand)) {
            s += 4;
        }
        s += 2 * Math.max(0, 1 - Math.abs(seed.bpm() - cand.bpm()) / 40.0);
        if (seed.mood().equals(cand.mood())) {
            s += 1.5;
        }
        s += 1.5 * (1 - Math.abs(seed.energy() - cand.energy()));
        s += cand.popularity() / 100.0;
        s += 0.5 * jitter(seed.id(), cand.id());
        return s;
    }

    /** Walks a ranked list keeping at most {@code perArtist} tracks per primary artist. */
    public static List<Song> diversify(List<Song> ranked, int count, int perArtist) {
        Map<String, Integer> perArtistCount = new HashMap<>();
        List<Song> out = new ArrayList<>(Math.min(count, ranked.size()));
        for (Song s : ranked) {
            if (out.size() >= count) {
                break;
            }
            int used = perArtistCount.getOrDefault(s.artist().id(), 0);
            if (used >= perArtist) {
                continue;
            }
            perArtistCount.put(s.artist().id(), used + 1);
            out.add(s);
        }
        return out;
    }

    public List<Artist> similarArtists(String artistId, int limit) {
        Artist seed = catalog.artist(artistId);
        if (seed == null) {
            return List.of();
        }
        Set<String> seedGenres = new HashSet<>(seed.genreIds());
        List<Scored<Artist>> ranked = new ArrayList<>();
        for (Artist a : catalog.artists()) {
            if (a.id().equals(artistId)) {
                continue;
            }
            long shared = a.genreIds().stream().filter(seedGenres::contains).count();
            double score = shared * 3 + Math.log10(a.monthlyListeners() + 10) * 0.5 + 0.5 * jitter(seed.id(), a.id());
            ranked.add(new Scored<>(a, score));
        }
        ranked.sort(Comparator.<Scored<Artist>>comparingDouble(Scored::score).reversed()
                .thenComparing(x -> x.item().id()));
        return ranked.stream().limit(limit).map(Scored::item).toList();
    }

    /** Albums that go with {@code seed}: same genre or from a similar artist, excluding its own artist. */
    public List<Album> similarAlbums(Album seed, Set<String> exclude, int limit) {
        Map<String, Double> similarRank = new HashMap<>();
        List<Artist> similar = similarArtists(seed.artist().id(), 6);
        for (int i = 0; i < similar.size(); i++) {
            similarRank.put(similar.get(i).id(), 3 - i * 0.4);
        }
        List<Scored<Album>> ranked = new ArrayList<>();
        for (Album a : catalog.albums()) {
            if (a.id().equals(seed.id()) || a.artist().id().equals(seed.artist().id()) || exclude.contains(a.id())) {
                continue;
            }
            double score = (seed.genreId().equals(a.genreId()) ? 3 : 0)
                    + similarRank.getOrDefault(a.artist().id(), 0.0)
                    + catalog.albumPopularity(a.id()) / 100.0 * 2
                    + 0.5 * jitter(seed.id(), a.id());
            ranked.add(new Scored<>(a, score));
        }
        ranked.sort(Comparator.<Scored<Album>>comparingDouble(Scored::score).reversed()
                .thenComparing(x -> x.item().id()));
        return ranked.stream().limit(limit).map(Scored::item).toList();
    }

    static boolean sharesArtist(Song a, Song b) {
        if (a.artist().id().equals(b.artist().id())) {
            return true;
        }
        if (b.featuring().stream().anyMatch(f -> f.id().equals(a.artist().id()))) {
            return true;
        }
        return a.featuring().stream().anyMatch(f -> f.id().equals(b.artist().id()));
    }

    /** Deterministic pseudo-random value in [0, 1) derived from two identifiers. */
    public static double jitter(String a, String b) {
        long h = mix(a.hashCode() * 0x9E3779B97F4A7C15L ^ b.hashCode());
        h = mix(h ^ (h >>> 17) ^ (long) b.length());
        return (h >>> 11) * 0x1.0p-53;
    }

    private static long mix(long z) {
        z = (z ^ (z >>> 30)) * 0xBF58476D1CE4E5B9L;
        z = (z ^ (z >>> 27)) * 0x94D049BB133111EBL;
        return z ^ (z >>> 31);
    }
}
