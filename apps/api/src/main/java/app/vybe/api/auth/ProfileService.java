package app.vybe.api.auth;

import app.vybe.api.error.ApiException;
import app.vybe.api.model.Playlist;
import app.vybe.api.model.User;
import app.vybe.api.playlists.PlaylistRepository;
import app.vybe.api.playlists.PlaylistService;
import app.vybe.api.common.Timestamps;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.regex.Pattern;

/** Editable account details, public profiles and listener follows. */
@Service
public class ProfileService {

    public record PublicUser(String id, String displayName, String avatarColor, String createdAt) { }
    public record Profile(PublicUser user, long followers, long following, boolean isFollowing, boolean isMe,
                          List<Playlist> playlists) { }

    private static final Pattern COLOR = Pattern.compile("#[0-9a-fA-F]{6}");
    private final UserRepository users;
    private final PlaylistRepository playlistRows;
    private final PlaylistService playlists;

    public ProfileService(UserRepository users, PlaylistRepository playlistRows, PlaylistService playlists) {
        this.users = users;
        this.playlistRows = playlistRows;
        this.playlists = playlists;
    }

    @Transactional
    public User update(User me, String displayName, String avatarColor) {
        String name = displayName == null ? me.displayName() : displayName.strip();
        if (name.isEmpty() || name.length() > 60) throw ApiException.badRequest("validation", "Display name must be 1-60 characters");
        String color = avatarColor == null ? me.avatarColor() : avatarColor;
        if (!COLOR.matcher(color).matches()) throw ApiException.badRequest("validation", "Avatar colour must be a #rrggbb hex value");
        users.updateProfile(me.id(), name, color);
        return users.findById(me.id()).orElseThrow();
    }

    public Profile profile(User viewer, String userId) {
        User u = users.findById(userId).orElseThrow(() -> ApiException.notFound("No such listener"));
        boolean isMe = viewer != null && viewer.id().equals(u.id());
        List<Playlist> lists = playlistRows.findByUser(u.id()).stream()
                .filter(r -> isMe || r.isPublic())
                .map(r -> playlists.toPlaylist(r, playlistRows.trackIds(r.id())))
                .toList();
        return new Profile(new PublicUser(u.id(), u.displayName(), u.avatarColor(), u.createdAt()),
                users.followers(u.id()), users.following(u.id()),
                viewer != null && !isMe && users.isFollowing(viewer.id(), u.id()), isMe, lists);
    }

    @Transactional
    public Profile follow(User me, String userId) {
        if (me.id().equals(userId)) throw ApiException.badRequest("validation", "You can't follow yourself");
        users.findById(userId).orElseThrow(() -> ApiException.notFound("No such listener"));
        users.follow(me.id(), userId, Timestamps.now());
        return profile(me, userId);
    }

    @Transactional
    public Profile unfollow(User me, String userId) {
        users.unfollow(me.id(), userId);
        return profile(me, userId);
    }

    public List<String> followingIds(String userId) {
        return users.followingIds(userId);
    }
}
