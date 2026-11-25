package app.vybe.api.model;

/** Square artwork with a precomputed palette. Mirrors {@code Artwork} in packages/shared. */
public record Artwork(
        String url,
        int width,
        int height,
        String bgColor,
        String textColor1,
        String textColor2,
        String textColor3) {
}
