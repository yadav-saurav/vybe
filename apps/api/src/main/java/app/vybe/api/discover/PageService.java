package app.vybe.api.discover;

import app.vybe.api.catalog.CatalogStore;
import app.vybe.api.common.Text;
import app.vybe.api.error.ApiException;
import app.vybe.api.library.LibraryRepository;
import app.vybe.api.model.Album;
import app.vybe.api.model.Artist;
import app.vybe.api.model.ContentItem;
import app.vybe.api.model.Genre;
import app.vybe.api.model.HeroCard;
import app.vybe.api.model.PageResponse;
import app.vybe.api.model.Pages;
import app.vybe.api.model.Playlist;
import app.vybe.api.model.Shelf;
import app.vybe.api.model.Song;
import app.vybe.api.model.Station;
import app.vybe.api.model.User;
import app.vybe.api.playlists.PlaylistService;
import org.springframework.beans.factory.InitializingBean;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Builds the editorial and personalized pages. Catalog-only pages (anonymous home, New, Radio) are
 * computed once at startup and cached, since the catalog is immutable.
 */
@Service
public class PageService implements InitializingBean {

    private static final int HERO_CARDS = 6;

    private final CatalogStore catalog;
    private final Similarity similarity;
    private final PersonalMixService mixes;
    private final PlaylistService playlists;
    private final LibraryRepository library;
    private final Map<String, PageResponse> anonymousCache = new ConcurrentHashMap<>();

    public PageService(CatalogStore catalog, Similarity similarity, PersonalMixService mixes,
                       PlaylistService playlists, LibraryRepository library) {
        this.catalog = catalog;
        this.similarity = similarity;
        this.mixes = mixes;
        this.playlists = playlists;
        this.library = library;
    }

    @Override
    public void afterPropertiesSet() {
        anonymousHome();
        newPage();
        radioPage();
    }

    // ------------------------------------------------------------------ home

    public PageResponse home(User user) {
        if (user == null) {
            return anonymousHome();
        }
        List<Shelf> shelves = new ArrayList<>();
        PersonalMixService.Profile profile = mixes.profile(user.id());

        List<Playlist> mixList = mixes.mixes(user, profile);
        List<Album> topGenreAlbums = recommendedAlbums(profile, 2);
        List<ContentItem> topPicks = new ArrayList<>();
        mixList.forEach(p -> topPicks.add(ContentItem.playlist(p)));
        topGenreAlbums.forEach(a -> topPicks.add(ContentItem.album(a)));
        add(shelves, Shelf.of("top-picks-for-you", "Top Picks for You", "large-tiles", topPicks));

        add(shelves, Shelf.of("recently-played", "Recently Played", "grid-lockups", recentlyPlayed(user, profile)));
        add(shelves, Shelf.of("made-for-you", "Made For You", "large-tiles",
                mixList.stream().map(ContentItem::playlist).toList()));

        String topArtistId = topKey(profile.artistPlays());
        if (topArtistId != null) {
            Artist artist = catalog.artist(topArtistId);
            if (artist != null) {
                List<ContentItem> because = new ArrayList<>();
                for (Artist sim : similarity.similarArtists(topArtistId, 3)) {
                    catalog.albumsOfArtist(sim.id()).stream().limit(4).forEach(a -> because.add(ContentItem.album(a)));
                }
                add(shelves, Shelf.withSubtitle("because-" + artist.id(),
                        "Because You Listened to " + artist.name(), null, "grid-lockups", because));
            }
        }

        add(shelves, Shelf.of("your-top-artists", "Your Top Artists", "circle-artists", topArtists(user, profile)));
        anonymousHome().shelves().stream()
                .filter(s -> !"top-picks".equals(s.id()))
                .forEach(shelves::add);
        return new PageResponse("Home", shelves);
    }

    private PageResponse anonymousHome() {
        return anonymousCache.computeIfAbsent("home", k -> {
            List<Shelf> shelves = new ArrayList<>();
            List<ContentItem> topPicks = new ArrayList<>();
            catalog.editorialPlaylists().stream()
                    .sorted(Comparator.comparing(Playlist::updatedAt, Comparator.reverseOrder()))
                    .limit(6).forEach(p -> topPicks.add(ContentItem.playlist(p)));
            add(shelves, Shelf.of("top-picks", "Top Picks", "large-tiles", topPicks));
            add(shelves, Shelf.of("vybe-today", "Vybe Today", "song-list", songItems(topSongs(30))));
            add(shelves, Shelf.of("popular-albums", "Popular Albums", "grid-lockups", albumItems(topAlbums(12))));
            add(shelves, Shelf.of("featured-artists", "Featured Artists", "circle-artists",
                    artistItems(catalog.artistsByListeners().stream().limit(12).toList())));
            for (Genre g : catalog.genres()) {
                List<Album> albums = topAlbumsOf(g.id(), 10);
                add(shelves, Shelf.of("genre-" + g.id(), "Best in " + g.name(), "grid-lockups", albumItems(albums))
                        .withSeeAll("/genres/" + g.id()));
            }
            return new PageResponse("Home", shelves);
        });
    }

    private List<ContentItem> recentlyPlayed(User user, PersonalMixService.Profile profile) {
        Set<String> seenAlbums = new HashSet<>();
        Set<String> seenPlaylists = new HashSet<>();
        List<ContentItem> out = new ArrayList<>();
        for (var play : profile.recent()) {
            if (out.size() >= 12) {
                break;
            }
            if ("album".equals(play.contextType()) && play.contextId() != null && seenAlbums.add(play.contextId())) {
                Album a = catalog.album(play.contextId());
                if (a != null) {
                    out.add(ContentItem.album(a));
                }
            } else if ("playlist".equals(play.contextType()) && play.contextId() != null
                    && seenPlaylists.add(play.contextId())) {
                playlists.findVisible(play.contextId(), user).ifPresent(p -> out.add(ContentItem.playlist(p)));
            }
        }
        if (out.isEmpty()) {
            // Plays without a context: fall back to the albums of the most recent songs.
            for (var play : profile.recent()) {
                Song s = catalog.song(play.songId());
                if (s != null && seenAlbums.add(s.album().id())) {
                    out.add(ContentItem.album(catalog.album(s.album().id())));
                }
                if (out.size() >= 12) {
                    break;
                }
            }
        }
        return out;
    }

    private List<ContentItem> topArtists(User user, PersonalMixService.Profile profile) {
        List<Artist> artists = new ArrayList<>();
        profile.artistPlays().entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed().thenComparing(Map.Entry.comparingByKey()))
                .limit(12)
                .forEach(e -> {
                    Artist a = catalog.artist(e.getKey());
                    if (a != null) {
                        artists.add(a);
                    }
                });
        if (artists.isEmpty()) {
            for (var ref : library.items(user.id(), "artist")) {
                Artist a = catalog.artist(ref.id());
                if (a != null && artists.size() < 12) {
                    artists.add(a);
                }
            }
        }
        return artistItems(artists);
    }

    /** Albums from genres the user plays, that they have not played yet. */
    private List<Album> recommendedAlbums(PersonalMixService.Profile profile, int limit) {
        String topGenre = topKey(profile.genrePlays());
        List<Album> candidates = topGenre == null ? topAlbums(limit) : topAlbumsOf(topGenre, 20);
        List<Album> out = new ArrayList<>();
        for (Album a : candidates) {
            boolean played = catalog.tracksOfAlbum(a.id()).stream().anyMatch(s -> profile.plays().containsKey(s.id()));
            if (!played && out.size() < limit) {
                out.add(a);
            }
        }
        return out;
    }

    // ------------------------------------------------------------------ new

    public PageResponse newPage() {
        return anonymousCache.computeIfAbsent("new", k -> {
            List<Shelf> shelves = new ArrayList<>();
            List<HeroCard> hero = newHeroCards();
            add(shelves, new Shelf("new-hero", "Featured", null, "hero", null,
                    hero.stream().map(HeroCard::item).toList(), hero));
            add(shelves, Shelf.of("best-new-songs", "Best New Songs", "song-list", songItems(bestNewSongs(30))));
            add(shelves, Shelf.of("new-releases", "New Releases", "grid-lockups",
                    albumItems(catalog.albumsByDate().stream().limit(20).toList())));
            add(shelves, Shelf.of("updated-playlists", "Updated Playlists", "grid-lockups",
                    playlistItems(updatedPlaylists(12))));
            add(shelves, Shelf.of("everyone-listening", "Everyone's Listening To", "grid-lockups",
                    playlistItems(popularPlaylists(12))));
            for (Genre g : catalog.genres()) {
                List<Album> albums = catalog.albumsOfGenre(g.id()).stream().limit(10).toList();
                add(shelves, Shelf.of("new-in-" + g.id(), "New in " + g.name(), "grid-lockups", albumItems(albums))
                        .withSeeAll("/genres/" + g.id()));
            }
            add(shelves, Shelf.of("top-albums", "Top Albums", "grid-lockups", albumItems(topAlbums(20))));
            return new PageResponse("New", shelves);
        });
    }

    /** Six cards alternating newest albums and recently updated editorial playlists. */
    private List<HeroCard> newHeroCards() {
        List<Album> albums = catalog.albumsByDate();
        List<Playlist> updated = updatedPlaylists(8);
        List<HeroCard> cards = new ArrayList<>();
        int ai = 0;
        int pi = 0;
        while (cards.size() < HERO_CARDS && (ai < albums.size() || pi < updated.size())) {
            if (ai < albums.size() && cards.size() < HERO_CARDS) {
                cards.add(albumCard(albums.get(ai++)));
            }
            if (pi < updated.size() && cards.size() < HERO_CARDS) {
                cards.add(playlistCard(updated.get(pi++)));
            }
        }
        return cards;
    }

    private HeroCard albumCard(Album a) {
        return new HeroCard(albumEyebrow(a.type()), a.title(), a.artist().name(),
                Text.firstSentence(a.editorialNotes(), 140), ContentItem.album(a));
    }

    private HeroCard playlistCard(Playlist p) {
        return new HeroCard("UPDATED PLAYLIST", p.name(), p.curatorName(), p.shortDescription(), ContentItem.playlist(p));
    }

    static String albumEyebrow(String type) {
        return switch (type) {
            case "ep" -> "NEW EP";
            case "single" -> "NEW SINGLE";
            case "compilation" -> "NEW COMPILATION";
            default -> "NEW ALBUM";
        };
    }

    /** Songs from the last ~4 months of releases, ranked by popularity. */
    private List<Song> bestNewSongs(int limit) {
        String latest = catalog.latestReleaseDate();
        String cutoff = latest.isEmpty() ? "" : LocalDate.parse(latest.substring(0, 10)).minusDays(120).toString();
        List<Song> recent = catalog.songs().stream()
                .filter(s -> s.releaseDate().compareTo(cutoff) >= 0)
                .sorted(Comparator.comparingInt(Song::popularity).reversed().thenComparing(Song::id))
                .toList();
        if (recent.size() < 12) {
            recent = catalog.songs().stream()
                    .sorted(Comparator.comparing(Song::releaseDate).reversed()
                            .thenComparing(Comparator.comparingInt(Song::popularity).reversed()))
                    .limit(12).toList();
        }
        return recent.stream().limit(limit).toList();
    }

    private List<Playlist> updatedPlaylists(int limit) {
        return catalog.editorialPlaylists().stream()
                .sorted(Comparator.comparing(Playlist::updatedAt).reversed().thenComparing(Playlist::id))
                .limit(limit).toList();
    }

    private List<Playlist> popularPlaylists(int limit) {
        Map<String, Double> avg = new HashMap<>();
        for (Playlist p : catalog.editorialPlaylists()) {
            avg.put(p.id(), p.trackIds().stream().map(catalog::song).filter(java.util.Objects::nonNull)
                    .mapToInt(Song::popularity).average().orElse(0));
        }
        return catalog.editorialPlaylists().stream()
                .sorted(Comparator.comparingDouble((Playlist p) -> avg.get(p.id())).reversed().thenComparing(Playlist::id))
                .limit(limit).toList();
    }

    // ------------------------------------------------------------------ radio

    public PageResponse radioPage() {
        return anonymousCache.computeIfAbsent("radio", k -> {
            List<Shelf> shelves = new ArrayList<>();
            List<HeroCard> live = new ArrayList<>();
            for (Station st : catalog.stations()) {
                if ("live".equals(st.kind())) {
                    live.add(new HeroCard("LIVE NOW", st.name(), st.tagline(), st.tagline(), ContentItem.station(st)));
                }
            }
            add(shelves, new Shelf("live-stations", "Live Stations", null, "hero", null,
                    live.stream().map(HeroCard::item).toList(), live));
            add(shelves, Shelf.of("genre-stations", "Genre Stations", "grid-lockups", stationItems("genre")));
            add(shelves, Shelf.of("artist-stations", "Artist Stations", "grid-lockups", stationItems("artist")));
            add(shelves, Shelf.of("song-stations", "Song Stations", "grid-lockups", stationItems("song")));
            add(shelves, Shelf.of("radio-shows", "Radio Shows", "grid-lockups",
                    playlistItems(catalog.editorialPlaylists().stream().limit(10).toList())));
            return new PageResponse("Radio", shelves);
        });
    }

    // ------------------------------------------------------------------ browse + genre rooms

    public Pages.Genres browseCategories() {
        return new Pages.Genres(catalog.genres());
    }

    public PageResponse genreRoom(String genreId) {
        Genre genre = catalog.genre(genreId);
        if (genre == null) {
            throw ApiException.notFound("No genre with id " + genreId);
        }
        List<Shelf> shelves = new ArrayList<>();
        List<Album> albums = catalog.albumsOfGenre(genreId);
        List<HeroCard> hero = new ArrayList<>();
        albums.stream().limit(4).forEach(a -> hero.add(albumCard(a)));
        add(shelves, new Shelf("genre-hero-" + genreId, genre.name(), null, "hero", null,
                hero.stream().map(HeroCard::item).toList(), hero));
        add(shelves, Shelf.of("genre-top-songs-" + genreId, "Top Songs", "song-list",
                songItems(catalog.songsOfGenre(genreId).stream().limit(20).toList())));
        add(shelves, Shelf.of("genre-albums-" + genreId, "Albums", "grid-lockups", albumItems(albums.stream().limit(20).toList())));
        add(shelves, Shelf.of("genre-playlists-" + genreId, "Playlists", "grid-lockups",
                playlistItems(catalog.editorialOfGenre(genreId).stream().limit(10).toList())));
        List<Artist> artists = catalog.artistsByListeners().stream()
                .filter(a -> a.genreIds().contains(genreId)).limit(12).toList();
        add(shelves, Shelf.of("genre-artists-" + genreId, "Artists", "circle-artists", artistItems(artists)));
        List<Station> stations = catalog.stations().stream()
                .filter(s -> "genre".equals(s.kind()) && genreId.equals(s.seedId())).toList();
        add(shelves, Shelf.of("genre-stations-" + genreId, "Stations", "grid-lockups", stationItems(stations)));
        return new PageResponse(genre.name(), shelves);
    }

    // ------------------------------------------------------------------ shared helpers

    private List<Song> topSongs(int limit) {
        return catalog.songsByPopularity().stream().limit(limit).toList();
    }

    private List<Album> topAlbums(int limit) {
        return catalog.albums().stream()
                .sorted(Comparator.comparingDouble((Album a) -> catalog.albumPopularity(a.id())).reversed()
                        .thenComparing(Album::id))
                .limit(limit).toList();
    }

    private List<Album> topAlbumsOf(String genreId, int limit) {
        return catalog.albumsOfGenre(genreId).stream()
                .sorted(Comparator.comparingDouble((Album a) -> catalog.albumPopularity(a.id())).reversed()
                        .thenComparing(Album::id))
                .limit(limit).toList();
    }

    private List<Station> stationKinds(String kind) {
        return catalog.stations().stream().filter(s -> kind.equals(s.kind())).toList();
    }

    private List<ContentItem> stationItems(String kind) {
        return stationItems(stationKinds(kind));
    }

    private static List<ContentItem> stationItems(List<Station> stations) {
        return stations.stream().map(ContentItem::station).toList();
    }

    private static List<ContentItem> songItems(List<Song> songs) {
        return songs.stream().map(ContentItem::song).toList();
    }

    private static List<ContentItem> albumItems(List<Album> albums) {
        return albums.stream().map(ContentItem::album).toList();
    }

    private static List<ContentItem> playlistItems(List<Playlist> list) {
        return list.stream().map(ContentItem::playlist).toList();
    }

    private static List<ContentItem> artistItems(List<Artist> artists) {
        return artists.stream().map(ContentItem::artist).toList();
    }

    /** Adds a shelf only when it has content, so empty personalized shelves never reach the client. */
    private static void add(List<Shelf> shelves, Shelf shelf) {
        if (!shelf.items().isEmpty() || (shelf.heroCards() != null && !shelf.heroCards().isEmpty())) {
            shelves.add(shelf);
        }
    }

    /** Key with the highest count (ties broken by key), or null when empty. */
    private static String topKey(Map<String, Integer> counts) {
        return counts.entrySet().stream()
                .max(Map.Entry.<String, Integer>comparingByValue().thenComparing(Map.Entry.comparingByKey(Comparator.reverseOrder())))
                .map(Map.Entry::getKey).orElse(null);
    }
}
