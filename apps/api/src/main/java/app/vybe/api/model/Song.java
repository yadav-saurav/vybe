package app.vybe.api.model;

import java.util.List;

/** Mirrors {@code Song}. {@code mood} is one of the {@code Mood} strings in packages/shared. */
public record Song(
        String id,
        String title,
        ArtistRef artist,
        List<ArtistRef> featuring,
        AlbumRef album,
        String genreId,
        int trackNumber,
        int discNumber,
        long durationMs,
        boolean isExplicit,
        boolean hasLyrics,
        String audioUrl,
        Artwork artwork,
        String releaseDate,
        int bpm,
        String mood,
        double energy,
        int popularity,
        String composer) {

    public Song {
        featuring = featuring == null ? List.of() : List.copyOf(featuring);
    }
}
