package app.vybe.api.model;

import java.util.List;

public record Artist(
        String id,
        String name,
        List<String> genreIds,
        String bio,
        String origin,
        String bornOrFormed,
        Artwork artwork,
        Artwork heroArtwork,
        long monthlyListeners) {

    public Artist {
        genreIds = genreIds == null ? List.of() : List.copyOf(genreIds);
    }

    public ArtistRef ref() {
        return new ArtistRef(id, name);
    }
}
