package app.vybe.api.model;

import java.util.List;
import java.util.Map;

/**
 * Mirrors {@code LibraryState}. Lists are ordered by date added, newest first.
 * {@code addedAt} maps every id in the library to its ISO timestamp.
 */
public record LibraryState(
        List<String> songIds,
        List<String> albumIds,
        List<String> playlistIds,
        List<String> artistIds,
        List<String> lovedIds,
        Map<String, String> addedAt) {

    public LibraryState {
        songIds = List.copyOf(songIds);
        albumIds = List.copyOf(albumIds);
        playlistIds = List.copyOf(playlistIds);
        artistIds = List.copyOf(artistIds);
        lovedIds = List.copyOf(lovedIds);
        addedAt = Map.copyOf(addedAt);
    }
}
