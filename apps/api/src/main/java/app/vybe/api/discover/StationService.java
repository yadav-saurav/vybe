package app.vybe.api.discover;

import app.vybe.api.catalog.CatalogStore;
import app.vybe.api.error.ApiException;
import app.vybe.api.model.Pages;
import app.vybe.api.model.Song;
import app.vybe.api.model.Station;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** Endless station playback: returns the next tracks of a station, never repeating an excluded id. */
@Service
public class StationService {

    private static final int MAX_COUNT = 50;

    private final CatalogStore catalog;
    private final Similarity similarity;

    public StationService(CatalogStore catalog, Similarity similarity) {
        this.catalog = catalog;
        this.similarity = similarity;
    }

    public Pages.StationPlayback next(String stationId, Set<String> exclude, int count) {
        Station station = catalog.station(stationId);
        if (station == null) {
            throw ApiException.notFound("No station with id " + stationId);
        }
        int n = Math.max(1, Math.min(count, MAX_COUNT));
        List<Song> tracks = switch (station.kind()) {
            case "genre" -> station.seedId() != null && catalog.genre(station.seedId()) != null
                    ? genreStream(station.seedId(), exclude, n) : liveStream(station, exclude, n);
            case "artist" -> station.seedId() != null && catalog.artist(station.seedId()) != null
                    ? artistStream(station.seedId(), exclude, n) : liveStream(station, exclude, n);
            case "song" -> songStream(station.seedId(), exclude, n, station);
            default -> liveStream(station, exclude, n);
        };
        return new Pages.StationPlayback(station, tracks);
    }

    /** Popular cross-genre mix: round-robins across genres so no single genre dominates. */
    private List<Song> liveStream(Station station, Set<String> exclude, int n) {
        List<List<Song>> perGenre = new ArrayList<>();
        for (var genre : catalog.genres()) {
            List<Song> ranked = catalog.songsOfGenre(genre.id()).stream()
                    .filter(s -> !exclude.contains(s.id()))
                    .sorted(java.util.Comparator.comparingDouble((Song s) -> rankKey(station.id(), s)).reversed()
                            .thenComparing(Song::id))
                    .toList();
            if (!ranked.isEmpty()) {
                perGenre.add(ranked);
            }
        }
        List<Song> out = new ArrayList<>(n);
        java.util.Map<String, Integer> perArtist = new java.util.HashMap<>();
        int[] cursor = new int[perGenre.size()];
        boolean progressed = true;
        while (out.size() < n && progressed) {
            progressed = false;
            for (int g = 0; g < perGenre.size() && out.size() < n; g++) {
                List<Song> list = perGenre.get(g);
                while (cursor[g] < list.size()) {
                    Song s = list.get(cursor[g]++);
                    if (perArtist.getOrDefault(s.artist().id(), 0) < 2) {
                        perArtist.merge(s.artist().id(), 1, Integer::sum);
                        out.add(s);
                        progressed = true;
                        break;
                    }
                }
            }
        }
        return out;
    }

    private List<Song> genreStream(String genreId, Set<String> exclude, int n) {
        List<Song> ranked = catalog.songsOfGenre(genreId).stream()
                .filter(s -> !exclude.contains(s.id()))
                .sorted(java.util.Comparator.comparingDouble((Song s) -> rankKey(genreId, s)).reversed()
                        .thenComparing(Song::id))
                .toList();
        return Similarity.diversify(ranked, n, 3);
    }

    /** The artist's own tracks, interleaved two-to-one with tracks from similar artists. */
    private List<Song> artistStream(String artistId, Set<String> exclude, int n) {
        List<Song> own = new ArrayList<>(catalog.songsOfArtist(artistId));
        own.sort(java.util.Comparator.comparingDouble((Song s) -> rankKey(artistId, s)).reversed()
                .thenComparing(Song::id));
        List<Song> similar = new ArrayList<>();
        for (var sim : similarity.similarArtists(artistId, 6)) {
            catalog.songsOfArtist(sim.id()).stream()
                    .sorted(java.util.Comparator.comparingDouble((Song s) -> rankKey(artistId, s)).reversed()
                            .thenComparing(Song::id))
                    .forEach(similar::add);
        }
        Set<String> picked = new LinkedHashSet<>();
        List<Song> out = new ArrayList<>(n);
        int oi = 0;
        int si = 0;
        while (out.size() < n && (oi < own.size() || si < similar.size())) {
            for (int k = 0; k < 2 && oi < own.size() && out.size() < n; k++) {
                Song s = own.get(oi++);
                if (!exclude.contains(s.id()) && picked.add(s.id())) {
                    out.add(s);
                }
            }
            if (si < similar.size() && out.size() < n) {
                Song s = similar.get(si++);
                if (!exclude.contains(s.id()) && picked.add(s.id())) {
                    out.add(s);
                }
            }
        }
        return out;
    }

    private List<Song> songStream(String songId, Set<String> exclude, int n, Station station) {
        Song seed = songId == null ? null : catalog.song(songId);
        if (seed == null) {
            return liveStream(station, exclude, n);
        }
        return similarity.autoplay(seed, exclude, n);
    }

    /** Popularity with a small per-station jitter, so the order varies between stations but is stable. */
    private double rankKey(String salt, Song s) {
        return s.popularity() + 10 * Similarity.jitter(salt, s.id());
    }
}
