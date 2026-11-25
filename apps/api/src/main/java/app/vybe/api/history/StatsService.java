package app.vybe.api.history;

import app.vybe.api.catalog.CatalogStore;
import app.vybe.api.imports.SongResolver;
import app.vybe.api.model.Artist;
import app.vybe.api.model.Genre;
import app.vybe.api.model.Song;
import org.springframework.stereotype.Service;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/** "Replay": listening statistics aggregated from play history for a period. */
@Service
public class StatsService {

    public record SongStat(Song song, int plays, long ms) { }
    public record ArtistStat(String id, String name, Artist artist, int plays, long ms) { }
    public record GenreStat(String id, String name, String color, int plays, double share) { }
    public record Stats(String period, String from, String to, long totalMs, int plays, int uniqueSongs,
                        int uniqueArtists, int longestStreakDays, int activeDays, List<SongStat> topSongs,
                        List<ArtistStat> topArtists, List<GenreStat> topGenres, int[] byHour, int[] byWeekday,
                        int[] byMonth, String topHourLabel) { }

    private final HistoryRepository history;
    private final SongResolver songs;
    private final CatalogStore catalog;

    public StatsService(HistoryRepository history, SongResolver songs, CatalogStore catalog) {
        this.history = history;
        this.songs = songs;
        this.catalog = catalog;
    }

    static LocalDate startOf(String period, LocalDate today) {
        return switch (period) {
            case "week" -> today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
            case "month" -> today.withDayOfMonth(1);
            case "all" -> LocalDate.of(2000, 1, 1);
            default -> today.withDayOfYear(1); // year
        };
    }

    public Stats stats(String userId, String periodParam) {
        String period = switch (periodParam == null ? "" : periodParam) {
            case "week", "month", "all" -> periodParam;
            default -> "year";
        };
        LocalDate today = LocalDate.now(ZoneOffset.UTC);
        LocalDate from = startOf(period, today);
        List<HistoryRepository.PlayRow> rows = history.since(userId, from.toString());

        Map<String, int[]> songPlays = new HashMap<>();   // id -> [plays]
        Map<String, long[]> songMs = new HashMap<>();
        Map<String, Song> songById = new HashMap<>();
        Map<String, ArtistAcc> artists = new HashMap<>();
        Map<String, Integer> genres = new HashMap<>();
        int[] byHour = new int[24], byWeekday = new int[7], byMonth = new int[12];
        Set<LocalDate> days = new TreeSet<>();
        long totalMs = 0;
        int plays = 0;

        for (HistoryRepository.PlayRow r : rows) {
            Song s = songById.computeIfAbsent(r.songId(), id -> songs.resolve(userId, id));
            if (s == null) continue;
            long ms = r.playedMs() > 0 ? r.playedMs() : s.durationMs();
            plays++;
            totalMs += ms;
            songPlays.computeIfAbsent(s.id(), k -> new int[1])[0]++;
            songMs.computeIfAbsent(s.id(), k -> new long[1])[0] += ms;
            ArtistAcc a = artists.computeIfAbsent(s.artist().id(), k -> new ArtistAcc(s.artist().id(), s.artist().name()));
            a.plays++;
            a.ms += ms;
            genres.merge(s.genreId(), 1, Integer::sum);
            try {
                OffsetDateTime t = OffsetDateTime.parse(r.playedAt());
                byHour[t.getHour()]++;
                byWeekday[t.getDayOfWeek().getValue() - 1]++;
                byMonth[t.getMonthValue() - 1]++;
                days.add(t.toLocalDate());
            } catch (RuntimeException ignored) {
                // malformed timestamp: counted in totals only
            }
        }

        List<SongStat> topSongs = songPlays.entrySet().stream()
                .sorted(Comparator.comparingInt((Map.Entry<String, int[]> e) -> -e.getValue()[0])
                        .thenComparing(e -> -songMs.get(e.getKey())[0]))
                .limit(20)
                .map(e -> new SongStat(songById.get(e.getKey()), e.getValue()[0], songMs.get(e.getKey())[0]))
                .toList();
        List<ArtistStat> topArtists = artists.values().stream()
                .sorted(Comparator.comparingLong((ArtistAcc a) -> -a.ms).thenComparingInt(a -> -a.plays))
                .limit(10)
                .map(a -> new ArtistStat(a.id, a.name, catalog.artist(a.id), a.plays, a.ms))
                .toList();
        int total = Math.max(1, plays);
        List<GenreStat> topGenres = genres.entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
                .limit(6)
                .map(e -> {
                    Genre g = catalog.genre(e.getKey());
                    return new GenreStat(e.getKey(), g != null ? g.name() : e.getKey(), g != null ? g.color() : "#888888",
                            e.getValue(), Math.round(e.getValue() * 1000.0 / total) / 1000.0);
                })
                .toList();

        int topHour = 0;
        for (int h = 1; h < 24; h++) if (byHour[h] > byHour[topHour]) topHour = h;
        String hourLabel = plays == 0 ? "" : hourLabel(topHour);

        return new Stats(period, from.toString(), today.toString(), totalMs, plays, songPlays.size(), artists.size(),
                longestStreak(days), days.size(), topSongs, topArtists, topGenres, byHour, byWeekday, byMonth, hourLabel);
    }

    static int longestStreak(Set<LocalDate> days) {
        int best = 0, run = 0;
        LocalDate prev = null;
        for (LocalDate d : new TreeSet<>(days)) {
            run = prev != null && prev.plusDays(1).equals(d) ? run + 1 : 1;
            best = Math.max(best, run);
            prev = d;
        }
        return best;
    }

    static String hourLabel(int h) {
        if (h < 5) return "Late night";
        if (h < 12) return "Morning";
        if (h < 17) return "Afternoon";
        if (h < 21) return "Evening";
        return "Night";
    }

    private static final class ArtistAcc {
        final String id, name;
        int plays;
        long ms;
        ArtistAcc(String id, String name) { this.id = id; this.name = name; }
    }
}
