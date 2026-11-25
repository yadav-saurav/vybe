package app.vybe.api.model;

import java.util.List;
import java.util.Map;

/**
 * Mirrors {@code LibraryState}. Lists are ordered by date added, newest first.
 * {@code addedAt} maps every id in the library to its ISO timestamp.
 * {@code artistIds} lists every artist in the library (followed or derived from saved music);
 * {@code followedArtistIds} lists only explicit follows, so unfollowing is always reversible.
 */
public record LibraryState(
        List<String> songIds,
        List<String> albumIds,
        List<String> playlistIds,
        List<String> artistIds,
        List<String> followedArtistIds,
        List<String> lovedIds,
        Map<String, String> addedAt) {

    public LibraryState {
        songIds = List.copyOf(songIds);
        albumIds = List.copyOf(albumIds);
        playlistIds = List.copyOf(playlistIds);
        artistIds = List.copyOf(artistIds);
        followedArtistIds = List.copyOf(followedArtistIds);
        lovedIds = List.copyOf(lovedIds);
        addedAt = Map.copyOf(addedAt);
    }
}
