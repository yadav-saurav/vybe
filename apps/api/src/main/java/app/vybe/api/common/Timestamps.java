package app.vybe.api.common;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

/**
 * Fixed-width UTC timestamps ({@code 2026-11-25T01:02:03.456Z}). Fixed width makes lexicographic
 * ordering equal chronological ordering, which the SQL ORDER BY clauses rely on.
 */
public final class Timestamps {

    private static final DateTimeFormatter FORMAT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);

    private Timestamps() {
    }

    public static String format(Instant instant) {
        return FORMAT.format(instant);
    }

    public static String now() {
        return format(Instant.now());
    }
}
