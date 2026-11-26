package app.vybe.api.world;

import app.vybe.api.model.Song;

import java.util.List;
import java.util.Map;

/** Published after the background builder has gathered the home shelves (shelf id -> songs). */
public record WorldWarmedEvent(Map<String, List<Song>> songsByShelf) {
}
