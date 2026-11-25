package app.vybe.api.model;

import java.util.List;

/** Mirrors {@code Album}. {@code type} is one of album, single, ep, compilation. */
public record Album(
        String id,
        String title,
        ArtistRef artist,
        String type,
        String genreId,
        String releaseDate,
        String copyright,
        String editorialNotes,
        String recordLabel,
        boolean isExplicit,
        Artwork artwork,
        List<String> trackIds,
        long durationMs) {

    public Album {
        trackIds = trackIds == null ? List.of() : List.copyOf(trackIds);
    }
}
