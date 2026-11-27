package app.vybe.api.catalog;

import app.vybe.api.config.VybeProperties;
import app.vybe.api.model.Album;
import app.vybe.api.model.Artist;
import app.vybe.api.model.Genre;
import app.vybe.api.model.LyricLine;
import app.vybe.api.model.Playlist;
import app.vybe.api.model.Song;
import app.vybe.api.model.Station;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The whole catalog, loaded once at startup into immutable collections and pre-computed indexes.
 * Every read path (pages, search, similarity, album and artist pages) works against this in-memory
 * model, so catalog reads never touch SQLite.
 */
@Component
public class CatalogStore {

    private static final Logger log = LoggerFactory.getLogger(CatalogStore.class);

    /** Wire format of catalog.json. */
    @JsonIgnoreProperties(ignoreUnknown = true)
    record CatalogFile(
            int version,
            List<Genre> genres,
            List<Artist> artists,
            List<Album> albums,
            List<Song> songs,
            List<Playlist> playlists,
            List<Station> stations) {
    }

    private final Path catalogFile;
    private final List<Genre> genres;
    private final Map<String, Genre> genreById;
    private final List<Artist> artists;
    private final Map<String, Artist> artistById;
    private final List<Album> albums;
    private final Map<String, Album> albumById;
    private final List<Song> songs;
    private final Map<String, Song> songById;
    private final List<Playlist> playlists;
    private final Map<String, Playlist> playlistById;
    private final List<Playlist> editorialPlaylists;
    private final List<Station> stations;
    private final Map<String, Station> stationById;
    private final Map<String, List<LyricLine>> lyrics;

    private final List<Song> songsByPopularity;
    private final List<Album> albumsByDate;
    private final List<Artist> artistsByListeners;
    private final Map<String, List<Song>> songsByArtist;
    private final Map<String, List<Song>> songsByFeatured;
    private final Map<String, List<Song>> songsByGenre;
    private final Map<String, List<Song>> songsByAlbum;
    private final Map<String, List<Album>> albumsByArtist;
    private final Map<String, List<Album>> albumsByGenre;
    private final Map<String, List<Album>> albumsByFeatured;
    private final Map<String, List<Playlist>> editorialByArtist;
    private final Map<String, List<Playlist>> editorialByGenre;
    private final Map<String, Double> albumPopularity;
    private final String latestReleaseDate;

    public CatalogStore(VybeProperties props, ObjectMapper mapper) {
        this.catalogFile = props.dataDirectory().resolve("catalog.json");
        CatalogFile file = read(mapper, catalogFile);
        Path lyricsFile = props.dataDirectory().resolve("lyrics.json");

        this.genres = nonNull(file.genres());
        this.genreById = indexById(genres, Genre::id, "genre");
        this.artists = nonNull(file.artists());
        this.artistById = indexById(artists, Artist::id, "artist");

        Set<String> songIds = new HashSet<>();
        List<Song> loadedSongs = new ArrayList<>();
        for (Song s : nonNull(file.songs())) {
            if (songIds.add(s.id())) {
                loadedSongs.add(s);
            } else {
                log.warn("duplicate song id {} ignored", s.id());
            }
        }
        this.songs = List.copyOf(loadedSongs);
        this.songById = indexById(songs, Song::id, "song");
        this.albums = sortAlbumsByDate(nonNull(file.albums()));
        this.albumById = indexById(albums, Album::id, "album");

        this.playlists = nonNull(file.playlists()).stream()
                .map(p -> withValidTracks(p, songById.keySet()))
                .toList();
        this.playlistById = indexById(playlists, Playlist::id, "playlist");
        this.editorialPlaylists = playlists.stream().filter(p -> "editorial".equals(p.kind())).toList();

        this.stations = nonNull(file.stations());
        this.stationById = indexById(stations, Station::id, "station");

        this.lyrics = readLyrics(mapper, lyricsFile, songById.keySet());

        // Derived indexes.
        this.songsByPopularity = songs.stream()
                .sorted(Comparator.comparingInt(Song::popularity).reversed().thenComparing(Song::id))
                .toList();
        this.artistsByListeners = artists.stream()
                .sorted(Comparator.comparingLong(Artist::monthlyListeners).reversed().thenComparing(Artist::id))
                .toList();
        this.songsByArtist = groupSorted(songs, s -> List.of(s.artist().id()), byPopularity());
        this.songsByFeatured = groupSorted(songs,
                s -> s.featuring().stream().map(a -> a.id()).distinct().toList(), byPopularity());
        this.songsByGenre = groupSorted(songs, s -> List.of(s.genreId()), byPopularity());
        this.songsByAlbum = groupSorted(songs, s -> List.of(s.album().id()),
                Comparator.comparingInt(Song::discNumber).thenComparingInt(Song::trackNumber).thenComparing(Song::id));
        this.albumsByArtist = groupSorted(albums, a -> List.of(a.artist().id()), albumsNewestFirst());
        this.albumsByGenre = groupSorted(albums, a -> List.of(a.genreId()), albumsNewestFirst());
        this.albumsByFeatured = groupSorted(albums, this::featuredArtistsOf, albumsNewestFirst());
        this.editorialByArtist = groupSorted(editorialPlaylists, this::artistsOfPlaylist, playlistsNewestFirst());
        this.editorialByGenre = groupSorted(editorialPlaylists, this::genresOfPlaylist, playlistsNewestFirst());
        this.albumPopularity = computeAlbumPopularity();
        this.albumsByDate = albums;
        this.latestReleaseDate = albums.stream().map(Album::releaseDate).max(String::compareTo).orElse("");

        log.info("catalog loaded: {} genres, {} artists, {} albums, {} songs, {} playlists, {} stations, {} lyric tracks",
                genres.size(), artists.size(), albums.size(), songs.size(), playlists.size(), stations.size(), lyrics.size());
    }

    // ----------------------------------------------------------------- loading helpers

    private static CatalogFile read(ObjectMapper mapper, Path file) {
        if (!Files.isRegularFile(file)) {
            // Vybe plays worldwide songs only; the old generated catalogue is retired.
            log.info("No local catalogue at {}: starting with worldwide songs only", file);
            return new CatalogFile(1, List.of(), List.of(), List.of(), List.of(), List.of(), List.of());
        }
        try {
            return mapper.readValue(file.toFile(), CatalogFile.class);
        } catch (IOException e) {
            throw new IllegalStateException("cannot read catalog " + file, e);
        }
    }

    private static Map<String, List<LyricLine>> readLyrics(ObjectMapper mapper, Path file, Set<String> knownSongs) {
        if (!Files.isRegularFile(file)) {
            log.warn("lyrics file {} not found; lyrics endpoints will return 404", file);
            return Map.of();
        }
        try {
            Map<String, List<LyricLine>> raw = mapper.readValue(file.toFile(),
                    new TypeReference<Map<String, List<LyricLine>>>() { });
            Map<String, List<LyricLine>> out = new HashMap<>();
            raw.forEach((songId, lines) -> {
                if (knownSongs.contains(songId) && lines != null && !lines.isEmpty()) {
                    out.put(songId, List.copyOf(lines));
                }
            });
            return Map.copyOf(out);
        } catch (IOException e) {
            throw new IllegalStateException("cannot read lyrics " + file, e);
        }
    }

    private static <T> List<T> nonNull(List<T> list) {
        return list == null ? List.of() : list;
    }

    private static <T> Map<String, T> indexById(List<T> items, java.util.function.Function<T, String> id, String what) {
        Map<String, T> map = new LinkedHashMap<>();
        for (T item : items) {
            T previous = map.putIfAbsent(id.apply(item), item);
            if (previous != null) {
                log.warn("duplicate {} id {} ignored", what, id.apply(item));
            }
        }
        return Map.copyOf(map);
    }

    private static List<Album> sortAlbumsByDate(List<Album> input) {
        return input.stream()
                .sorted(Comparator.comparing(Album::releaseDate, Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(Album::id))
                .toList();
    }

    /** Drops track ids that do not exist in the catalog so hydration can never fail. */
    private static Playlist withValidTracks(Playlist p, Set<String> knownSongs) {
        List<String> valid = p.trackIds().stream().filter(knownSongs::contains).toList();
        if (valid.size() == p.trackIds().size()) {
            return p;
        }
        log.warn("playlist {} references {} unknown tracks; dropped", p.id(), p.trackIds().size() - valid.size());
        return p.withTracks(valid, p.durationMs(), p.updatedAt(), p.artwork());
    }

    private static <T> Map<String, List<T>> groupSorted(List<T> items,
                                                        java.util.function.Function<T, List<String>> keys,
                                                        Comparator<T> order) {
        Map<String, List<T>> map = new HashMap<>();
        for (T item : items) {
            for (String key : keys.apply(item)) {
                map.computeIfAbsent(key, k -> new ArrayList<>()).add(item);
            }
        }
        Map<String, List<T>> out = new HashMap<>();
        map.forEach((k, v) -> {
            v.sort(order);
            out.put(k, List.copyOf(v));
        });
        return Map.copyOf(out);
    }

    private static Comparator<Song> byPopularity() {
        return Comparator.comparingInt(Song::popularity).reversed().thenComparing(Song::id);
    }

    private static Comparator<Album> albumsNewestFirst() {
        return Comparator.comparing(Album::releaseDate, Comparator.nullsLast(Comparator.reverseOrder()))
                .thenComparing(Album::id);
    }

    private static Comparator<Playlist> playlistsNewestFirst() {
        return Comparator.comparing(Playlist::updatedAt, Comparator.nullsLast(Comparator.reverseOrder()))
                .thenComparing(Playlist::id);
    }

    private List<String> featuredArtistsOf(Album album) {
        Set<String> ids = new HashSet<>();
        for (String trackId : album.trackIds()) {
            Song s = songById.get(trackId);
            if (s != null) {
                s.featuring().forEach(a -> ids.add(a.id()));
            }
        }
        ids.remove(album.artist().id());
        return List.copyOf(ids);
    }

    private List<String> artistsOfPlaylist(Playlist p) {
        Set<String> ids = new HashSet<>();
        for (String trackId : p.trackIds()) {
            Song s = songById.get(trackId);
            if (s != null) {
                ids.add(s.artist().id());
                s.featuring().forEach(a -> ids.add(a.id()));
            }
        }
        return List.copyOf(ids);
    }

    private List<String> genresOfPlaylist(Playlist p) {
        Set<String> ids = new HashSet<>();
        for (String trackId : p.trackIds()) {
            Song s = songById.get(trackId);
            if (s != null) {
                ids.add(s.genreId());
            }
        }
        return List.copyOf(ids);
    }

    private Map<String, Double> computeAlbumPopularity() {
        Map<String, Double> out = new HashMap<>();
        for (Album a : albums) {
            List<Song> tracks = songsByAlbum.getOrDefault(a.id(), List.of());
            double avg = tracks.isEmpty() ? 0 : tracks.stream().mapToInt(Song::popularity).average().orElse(0);
            out.put(a.id(), avg);
        }
        return Map.copyOf(out);
    }

    // ----------------------------------------------------------------- accessors

    public List<Genre> genres() { return genres; }
    public Genre genre(String id) { return genreById.get(id); }
    public List<Artist> artists() { return artists; }
    public Artist artist(String id) { return artistById.get(id); }
    public List<Album> albums() { return albums; }
    public Album album(String id) { return albumById.get(id); }
    public List<Song> songs() { return songs; }
    public Song song(String id) { return songById.get(id); }
    public List<Playlist> playlists() { return playlists; }
    public Playlist playlist(String id) { return playlistById.get(id); }
    public List<Playlist> editorialPlaylists() { return editorialPlaylists; }
    public List<Station> stations() { return stations; }
    public Station station(String id) { return stationById.get(id); }
    public List<LyricLine> lyrics(String songId) { return lyrics.get(songId); }

    public List<Song> songsByPopularity() { return songsByPopularity; }
    public List<Album> albumsByDate() { return albumsByDate; }
    public List<Artist> artistsByListeners() { return artistsByListeners; }
    public List<Song> songsOfArtist(String artistId) { return songsByArtist.getOrDefault(artistId, List.of()); }
    public List<Song> featuredSongsOf(String artistId) { return songsByFeatured.getOrDefault(artistId, List.of()); }
    public List<Song> songsOfGenre(String genreId) { return songsByGenre.getOrDefault(genreId, List.of()); }
    public List<Song> tracksOfAlbum(String albumId) { return songsByAlbum.getOrDefault(albumId, List.of()); }
    public List<Album> albumsOfArtist(String artistId) { return albumsByArtist.getOrDefault(artistId, List.of()); }
    public List<Album> albumsOfGenre(String genreId) { return albumsByGenre.getOrDefault(genreId, List.of()); }
    public List<Album> albumsFeaturing(String artistId) { return albumsByFeatured.getOrDefault(artistId, List.of()); }
    public List<Playlist> editorialContaining(String artistId) { return editorialByArtist.getOrDefault(artistId, List.of()); }
    public List<Playlist> editorialOfGenre(String genreId) { return editorialByGenre.getOrDefault(genreId, List.of()); }
    public double albumPopularity(String albumId) { return albumPopularity.getOrDefault(albumId, 0.0); }
    public String latestReleaseDate() { return latestReleaseDate; }
}
