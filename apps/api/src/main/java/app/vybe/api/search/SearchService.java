package app.vybe.api.search;

import app.vybe.api.catalog.CatalogStore;
import app.vybe.api.model.Album;
import app.vybe.api.model.Artist;
import app.vybe.api.model.ContentItem;
import app.vybe.api.model.ContentType;
import app.vybe.api.model.Pages;
import app.vybe.api.model.Playlist;
import app.vybe.api.model.SearchResults;
import app.vybe.api.model.SearchSuggestion;
import app.vybe.api.model.Song;
import app.vybe.api.model.Station;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * In-memory search over the catalog. Documents and their normalized tokens are built once at startup.
 *
 * <p>Ranking tiers for a name match: exact name (100), name prefix (80), every query token is an
 * exact or token-prefix match (60), typo-tolerant match (40, query tokens of 4+ characters may
 * differ by one edit). A match only in the description or bio scores 10. Popularity adds up to 10.
 */
@Service
public class SearchService {

    private static final int DEFAULT_LIMIT = 25;
    private static final int MAX_LIMIT = 100;
    private static final int TOP_SIZE = 8;
    private static final int SUGGESTION_TERMS = 4;
    private static final int SUGGESTION_ITEMS = 4;

    private enum Kind { SONG, ALBUM, ARTIST, PLAYLIST, STATION }

    /** One searchable catalog item with its precomputed tokens. */
    private record Doc(
            Kind kind,
            ContentType type,
            Object item,
            String display,
            String normName,
            String[] nameTokens,
            String[] descTokens,
            double boost) {
    }

    private record Hit(Doc doc, double score) {
    }

    private final List<Doc> docs;

    public SearchService(CatalogStore catalog) {
        List<Doc> built = new ArrayList<>();
        for (Artist a : catalog.artists()) {
            built.add(doc(Kind.ARTIST, ContentType.ARTIST, a, a.name(), a.name(), a.bio(),
                    Math.min(10, Math.log10(a.monthlyListeners() + 10) * 1.6)));
        }
        for (Album a : catalog.albums()) {
            built.add(doc(Kind.ALBUM, ContentType.ALBUM, a, a.title(), a.title(),
                    a.artist().name() + " " + a.editorialNotes(), catalog.albumPopularity(a.id()) / 10));
        }
        for (Song s : catalog.songs()) {
            built.add(doc(Kind.SONG, ContentType.SONG, s, s.title(), s.title(),
                    s.artist().name() + " " + s.album().title() + " " + s.composer(), s.popularity() / 10.0));
        }
        for (Playlist p : catalog.editorialPlaylists()) {
            built.add(doc(Kind.PLAYLIST, ContentType.PLAYLIST, p, p.name(), p.name(),
                    p.description() + " " + p.curatorName(), 5));
        }
        for (Station st : catalog.stations()) {
            built.add(doc(Kind.STATION, ContentType.STATION, st, st.name(), st.name(), st.tagline(), 3));
        }
        this.docs = List.copyOf(built);
    }

    private static Doc doc(Kind kind, ContentType type, Object item, String display, String name, String desc,
                           double boost) {
        return new Doc(kind, type, item, display, TextNormalizer.normalize(name),
                TextNormalizer.tokens(name), TextNormalizer.tokens(desc), boost);
    }

    public SearchResults search(String term, String types, Integer limit) {
        return search(term, types, limit, List.of());
    }

    /**
     * Like {@link #search(String, String, Integer)}, also ranking {@code extraSongs} (the signed-in
     * user's imported tracks) with the same tiers, so they appear in {@code songs} and {@code top}.
     */
    public SearchResults search(String term, String types, Integer limit, List<Song> extraSongs) {
        Set<Kind> wanted = parseTypes(types);
        int n = limit == null ? DEFAULT_LIMIT : Math.max(1, Math.min(limit, MAX_LIMIT));
        String[] query = TextNormalizer.tokens(term);
        if (query.length == 0) {
            return new SearchResults(term == null ? "" : term, List.of(), List.of(), List.of(), List.of(), List.of(), List.of());
        }
        String queryNorm = String.join(" ", query);
        List<Hit> hits = new ArrayList<>();
        List<Doc> extra = new ArrayList<>();
        if (wanted.contains(Kind.SONG)) {
            for (Song s : extraSongs) {
                // Imports have no popularity; a small fixed boost keeps the user's own music competitive.
                extra.add(doc(Kind.SONG, ContentType.SONG, s, s.title(), s.title(),
                        s.artist().name() + " " + s.album().title(), 5));
            }
        }
        for (List<Doc> pool : List.of(docs, extra)) {
            for (Doc d : pool) {
                if (!wanted.contains(d.kind())) {
                    continue;
                }
                double s = score(d, query, queryNorm);
                if (s > 0) {
                    hits.add(new Hit(d, s));
                }
            }
        }
        hits.sort(Comparator.comparingDouble(Hit::score).reversed()
                .thenComparing(h -> h.doc().display().toLowerCase(Locale.ROOT)));

        List<Song> songs = new ArrayList<>();
        List<Album> albums = new ArrayList<>();
        List<Artist> artists = new ArrayList<>();
        List<Playlist> playlists = new ArrayList<>();
        List<Station> stations = new ArrayList<>();
        for (Hit h : hits) {
            switch (h.doc().kind()) {
                case SONG -> { if (songs.size() < n) songs.add((Song) h.doc().item()); }
                case ALBUM -> { if (albums.size() < n) albums.add((Album) h.doc().item()); }
                case ARTIST -> { if (artists.size() < n) artists.add((Artist) h.doc().item()); }
                case PLAYLIST -> { if (playlists.size() < n) playlists.add((Playlist) h.doc().item()); }
                case STATION -> { if (stations.size() < n) stations.add((Station) h.doc().item()); }
            }
        }
        List<ContentItem> top = new ArrayList<>(TOP_SIZE);
        for (Hit h : hits) {
            if (top.size() >= TOP_SIZE) {
                break;
            }
            top.add(item(h.doc()));
        }
        return new SearchResults(term, top, songs, albums, artists, playlists, stations);
    }

    /** Term completions (up to 4) followed by content items (up to 4). */
    public Pages.Suggestions suggestions(String term) {
        String[] query = TextNormalizer.tokens(term);
        if (query.length == 0) {
            return new Pages.Suggestions(List.of());
        }
        String queryNorm = String.join(" ", query);
        List<Hit> hits = new ArrayList<>();
        for (Doc d : docs) {
            double s = score(d, query, queryNorm);
            if (s > 0) {
                hits.add(new Hit(d, s));
            }
        }
        hits.sort(Comparator.comparingDouble(Hit::score).reversed()
                .thenComparing(h -> h.doc().display().toLowerCase(Locale.ROOT)));

        List<SearchSuggestion> out = new ArrayList<>();
        Set<String> seenTerms = new HashSet<>();
        for (Hit h : hits) {
            if (out.size() >= SUGGESTION_TERMS) {
                break;
            }
            if (seenTerms.add(h.doc().normName())) {
                out.add(SearchSuggestion.term(h.doc().display()));
            }
        }
        int items = 0;
        for (Hit h : hits) {
            if (items >= SUGGESTION_ITEMS) {
                break;
            }
            out.add(SearchSuggestion.content(item(h.doc())));
            items++;
        }
        return new Pages.Suggestions(out);
    }

    /** Ranking score for a document, or 0 when the query does not match. */
    private static double score(Doc d, String[] query, String queryNorm) {
        int nameTier = nameTier(d, query, queryNorm);
        if (nameTier > 0) {
            return nameTier + d.boost();
        }
        // Description or bio match: all query tokens must appear as exact or prefix tokens.
        for (String q : query) {
            boolean found = false;
            for (String t : d.descTokens()) {
                if (t.startsWith(q)) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                return 0;
            }
        }
        return 10 + d.boost() / 10;
    }

    private static int nameTier(Doc d, String[] query, String queryNorm) {
        boolean allExactOrPrefix = true;
        for (String q : query) {
            boolean exactOrPrefix = false;
            boolean fuzzy = false;
            for (String t : d.nameTokens()) {
                if (t.startsWith(q)) {
                    exactOrPrefix = true;
                    break;
                }
                if (q.length() >= 4 && t.length() >= 4 && TextNormalizer.withinOneEdit(q, t)) {
                    fuzzy = true;
                }
            }
            if (!exactOrPrefix) {
                if (!fuzzy) {
                    return 0;
                }
                allExactOrPrefix = false;
            }
        }
        if (d.normName().equals(queryNorm)) {
            return 100;
        }
        if (d.normName().startsWith(queryNorm)) {
            return 80;
        }
        return allExactOrPrefix ? 60 : 40;
    }

    private ContentItem item(Doc d) {
        return switch (d.kind()) {
            case SONG -> ContentItem.song((Song) d.item());
            case ALBUM -> ContentItem.album((Album) d.item());
            case ARTIST -> ContentItem.artist((Artist) d.item());
            case PLAYLIST -> ContentItem.playlist((Playlist) d.item());
            case STATION -> ContentItem.station((Station) d.item());
        };
    }

    private static Set<Kind> parseTypes(String types) {
        if (types == null || types.isBlank()) {
            return EnumSet.allOf(Kind.class);
        }
        Set<Kind> out = EnumSet.noneOf(Kind.class);
        for (String raw : types.split(",")) {
            switch (raw.trim()) {
                case "songs" -> out.add(Kind.SONG);
                case "albums" -> out.add(Kind.ALBUM);
                case "artists" -> out.add(Kind.ARTIST);
                case "playlists" -> out.add(Kind.PLAYLIST);
                case "stations" -> out.add(Kind.STATION);
                default -> { /* unknown types are ignored */ }
            }
        }
        return out.isEmpty() ? EnumSet.allOf(Kind.class) : out;
    }
}
