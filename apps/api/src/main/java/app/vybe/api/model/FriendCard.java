package app.vybe.api.model;

/** A followed listener's latest public play: shown in the "Friends Are Listening" Home row. */
public record FriendCard(String userId, String displayName, String avatarColor, String playedAt, ContentItem item) {
}
