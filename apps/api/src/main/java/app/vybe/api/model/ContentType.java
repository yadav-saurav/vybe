package app.vybe.api.model;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

/** Content type tag used by history contexts, library and search. */
public enum ContentType {
    SONG("song"),
    ALBUM("album"),
    PLAYLIST("playlist"),
    ARTIST("artist"),
    STATION("station");

    private final String value;

    ContentType(String value) {
        this.value = value;
    }

    @JsonValue
    public String value() {
        return value;
    }

    /** Parses a wire value; returns null for null or unknown input. */
    @JsonCreator
    public static ContentType fromValue(String raw) {
        if (raw == null) {
            return null;
        }
        for (ContentType t : values()) {
            if (t.value.equals(raw)) {
                return t;
            }
        }
        return null;
    }
}
