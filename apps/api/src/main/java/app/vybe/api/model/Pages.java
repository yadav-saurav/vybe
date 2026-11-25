package app.vybe.api.model;

import com.fasterxml.jackson.annotation.JsonInclude;

import java.util.List;

/**
 * Composite response bodies for the detail endpoints. Each record mirrors the corresponding
 * TS interface in packages/shared (AlbumPage, ArtistPage, PlaylistPage, StationPlayback, ...).
 */
public final class Pages {

    private Pages() {
    }

    public record AlbumPage(Album album, List<Song> tracks, List<Album> moreByArtist, List<Album> youMightAlsoLike) {
    }

    public record ArtistPage(
            Artist artist,
            Album latestRelease,
            List<Song> topSongs,
            List<Album> albums,
            List<Album> singlesAndEps,
            List<Album> appearsOn,
            List<Playlist> playlists,
            List<Artist> similarArtists) {

        public ArtistPage {
            topSongs = List.copyOf(topSongs);
            albums = List.copyOf(albums);
            singlesAndEps = List.copyOf(singlesAndEps);
            appearsOn = List.copyOf(appearsOn);
            playlists = List.copyOf(playlists);
            similarArtists = List.copyOf(similarArtists);
        }
    }

    public record PlaylistPage(Playlist playlist, List<Song> tracks, List<Playlist> moreLikeThis) {
    }

    public record StationPlayback(Station station, List<Song> tracks) {
    }

    public record Genres(List<Genre> genres) {
    }

    public record Songs(List<Song> songs) {
    }

    public record SongWrapper(Song song) {
    }

    public record Lyrics(List<LyricLine> lines) {
    }

    public record Albums(List<Album> albums) {
    }

    public record Artists(List<Artist> artists) {
    }

    public record Playlists(List<Playlist> playlists) {
    }

    public record Items(List<ContentItem> items) {
    }

    public record Entries(List<HistoryEntry> entries) {
    }

    public record Suggestions(List<SearchSuggestion> suggestions) {
    }

    public record Ok(boolean ok) {
        public static final Ok YES = new Ok(true);
    }

    public record Health(boolean ok) {
    }

    /** {@code user} is always present, as {@code null} when anonymous. */
    @JsonInclude(JsonInclude.Include.ALWAYS)
    public record UserWrapper(User user) {
    }

    public record PlaylistWrapper(Playlist playlist) {
    }
}
