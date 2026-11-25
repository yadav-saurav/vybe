package app.vybe.api.model;

/** Mirrors {@code PlayHistoryEntry & { song: Song }}. */
public record HistoryEntry(
        String songId,
        String playedAt,
        ContentType contextType,
        String contextId,
        Song song) {
}
