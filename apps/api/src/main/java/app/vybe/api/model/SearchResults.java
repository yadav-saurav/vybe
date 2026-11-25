package app.vybe.api.model;

import java.util.List;

/** Mirrors {@code SearchResults}. */
public record SearchResults(
        String term,
        List<ContentItem> top,
        List<Song> songs,
        List<Album> albums,
        List<Artist> artists,
        List<Playlist> playlists,
        List<Station> stations) {
}
