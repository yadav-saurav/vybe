package app.vybe.api.model;

/**
 * Hydrated shelf item, serialized as {@code {"type":"album","data":{...}}}.
 * The {@code data} payload is always one of Song, Album, Playlist, Artist or Station.
 */
public record ContentItem(String type, Object data) {

    public static ContentItem song(Song s) {
        return new ContentItem("song", s);
    }

    public static ContentItem album(Album a) {
        return new ContentItem("album", a);
    }

    public static ContentItem playlist(Playlist p) {
        return new ContentItem("playlist", p);
    }

    public static ContentItem artist(Artist a) {
        return new ContentItem("artist", a);
    }

    public static ContentItem station(Station s) {
        return new ContentItem("station", s);
    }
}
