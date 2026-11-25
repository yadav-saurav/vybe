package app.vybe.api.model;

import java.util.List;

public record PageResponse(String title, List<Shelf> shelves) {
    public PageResponse {
        shelves = List.copyOf(shelves);
    }
}
