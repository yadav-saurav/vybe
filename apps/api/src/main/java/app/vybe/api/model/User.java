package app.vybe.api.model;

/** Public user representation. The password hash never leaves the persistence layer. */
public record User(String id, String email, String displayName, String avatarColor, String createdAt) {
}
