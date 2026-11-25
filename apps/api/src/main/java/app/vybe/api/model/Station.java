package app.vybe.api.model;

/** Mirrors {@code Station}. {@code kind} is live, genre, artist or song. */
public record Station(
        String id,
        String name,
        String tagline,
        String kind,
        String seedId,
        Artwork artwork) {
}
