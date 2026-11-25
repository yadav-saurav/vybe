package app.vybe.api.model;

import java.util.List;

/**
 * Mirrors {@code Playlist}. {@code kind} is editorial, personal-mix or user.
 * {@code ownerId} is only set for user playlists.
 */
public record Playlist(
        String id,
        String kind,
        String name,
        String curatorName,
        String description,
        String shortDescription,
        Artwork artwork,
        List<String> trackIds,
        long durationMs,
        String updatedAt,
        boolean isPublic,
        String ownerId,
        Boolean isCollaborative) {

    public Playlist {
        trackIds = trackIds == null ? List.of() : List.copyOf(trackIds);
    }

    public Playlist withTracks(List<String> newTrackIds, long newDurationMs, String newUpdatedAt, Artwork newArtwork) {
        return new Playlist(id, kind, name, curatorName, description, shortDescription, newArtwork,
                newTrackIds, newDurationMs, newUpdatedAt, isPublic, ownerId, isCollaborative);
    }
}
