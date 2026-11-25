package app.vybe.api.auth;

import app.vybe.api.catalog.CatalogStore;
import app.vybe.api.history.HistoryRepository;
import app.vybe.api.model.ContentItem;
import app.vybe.api.model.FriendCard;
import app.vybe.api.model.Song;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * "Friends Are Listening": the latest play of each followed listener who opted in to sharing.
 * Only catalog songs from the last 7 days are exposed; imported (private) files never are.
 */
@Service
public class FriendsService {

    private static final int MAX_FRIENDS = 40;
    private static final int MAX_CARDS = 12;
    private static final int LOOKBACK_DAYS = 7;

    private final UserRepository users;
    private final HistoryRepository history;
    private final CatalogStore catalog;
    private final app.vybe.api.world.WorldSongStore worldSongs;

    public FriendsService(UserRepository users, HistoryRepository history, CatalogStore catalog, app.vybe.api.world.WorldSongStore worldSongs) {
        this.worldSongs = worldSongs;
        this.users = users;
        this.history = history;
        this.catalog = catalog;
    }

    public boolean sharing(String userId) {
        return users.shareActivity(userId);
    }

    public void setSharing(String userId, boolean share) {
        users.setShareActivity(userId, share);
    }

    public List<FriendCard> activity(String userId) {
        String since = OffsetDateTime.now(ZoneOffset.UTC).minusDays(LOOKBACK_DAYS).toString();
        List<FriendCard> cards = new ArrayList<>();
        for (UserRepository.UserRow friend : users.sharingFollowees(userId, MAX_FRIENDS)) {
            for (HistoryRepository.PlayRow play : history.recent(friend.id(), 20)) {
                Song s = app.vybe.api.world.WorldService.isWorldId(play.songId()) ? worldSongs.get(play.songId()) : catalog.song(play.songId());
                if (s == null || play.playedAt().compareTo(since) < 0) {
                    continue; // imported or unknown song, or too old: look at the next most recent play
                }
                cards.add(new FriendCard(friend.id(), friend.displayName(), friend.avatarColor(), play.playedAt(), ContentItem.song(s)));
                break;
            }
        }
        cards.sort(Comparator.comparing(FriendCard::playedAt).reversed());
        return cards.size() > MAX_CARDS ? cards.subList(0, MAX_CARDS) : cards;
    }
}
