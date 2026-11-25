package app.vybe.api.auth;

import app.vybe.api.error.ApiException;
import app.vybe.api.imports.ImportService;
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

    /** A listener in search results or follower lists, with whether the viewer follows them. */
    public record ListenerCard(String id, String displayName, String avatarColor, boolean isFollowing, boolean isMe) { }

    public record AccountSettings(boolean shareActivity, boolean isDemo) { }
    public record PublicUser(String id, String displayName, String avatarColor, String createdAt) { }
    public record Profile(PublicUser user, long followers, long following, boolean isFollowing, boolean isMe,
                          List<Playlist> playlists) { }

    private static final Pattern COLOR = Pattern.compile("#[0-9a-fA-F]{6}");
    private final UserRepository users;
    private final PlaylistRepository playlistRows;
    private final PlaylistService playlists;
    private final AuthService auth;
    private final ImportService imports;
    private final FriendsService friends;
    private final DemoGuard demo;

    public ProfileService(UserRepository users, PlaylistRepository playlistRows, PlaylistService playlists,
                          AuthService auth, ImportService imports, FriendsService friends, DemoGuard demo) {
        this.users = users;
        this.playlistRows = playlistRows;
        this.playlists = playlists;
        this.auth = auth;
        this.imports = imports;
        this.friends = friends;
        this.demo = demo;
    }

    @Transactional
    public User update(User me, String displayName, String avatarColor) {
        demo.forbid(me, "edit its profile");
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
                .map(r -> playlists.toPlaylist(r, playlistRows.trackIds(r.id()), viewer == null ? null : viewer.id()))
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

    /** Permanently deletes the account, its data and its imported files after re-checking the password. */
    public void deleteAccount(User me, String password) {
        demo.forbid(me, "be deleted");
        auth.requirePassword(me, password);
        imports.deleteAllFor(me.id());
        auth.deleteUser(me.id());
    }

    public AccountSettings settings(User me) {
        return new AccountSettings(friends.sharing(me.id()), demo.isDemo(me));
    }

    public AccountSettings updateSettings(User me, Boolean shareActivity) {
        if (shareActivity != null) friends.setSharing(me.id(), shareActivity);
        return settings(me);
    }

    private List<ListenerCard> cards(User viewer, List<UserRepository.UserRow> rows) {
        String me = viewer == null ? null : viewer.id();
        java.util.Set<String> followed = users.followedAmong(me, rows.stream().map(UserRepository.UserRow::id).toList());
        return rows.stream().map(r -> new ListenerCard(r.id(), r.displayName(), r.avatarColor(), followed.contains(r.id()), r.id().equals(me))).toList();
    }

    public List<ListenerCard> search(User viewer, String query) {
        String q = query == null ? "" : query.strip();
        if (q.length() < 2) return List.of();
        return cards(viewer, users.searchByName(q.length() > 60 ? q.substring(0, 60) : q, viewer == null ? null : viewer.id(), 20));
    }

    public List<ListenerCard> followers(User viewer, String userId) {
        users.findById(userId).orElseThrow(() -> ApiException.notFound("No such listener"));
        return cards(viewer, users.followersOf(userId, 200));
    }

    public List<ListenerCard> following(User viewer, String userId) {
        users.findById(userId).orElseThrow(() -> ApiException.notFound("No such listener"));
        return cards(viewer, users.followingOf(userId, 200));
    }
}
