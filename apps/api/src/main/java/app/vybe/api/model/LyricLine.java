package app.vybe.api.model;

/** Empty {@code text} denotes an instrumental gap. */
public record LyricLine(long startMs, long endMs, String text) {
}
