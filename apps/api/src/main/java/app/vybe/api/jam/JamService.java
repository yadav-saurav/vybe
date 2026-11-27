package app.vybe.api.jam;

import app.vybe.api.catalog.CatalogStore;
import app.vybe.api.error.ApiException;
import app.vybe.api.model.Song;
import app.vybe.api.model.User;
import app.vybe.api.world.WorldService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;

/**
 * Jam: listen together. A Jam is a shared queue and one shared playhead that every listener's
 * player follows. State lives in memory (a Jam is a live session, not data worth keeping) and every
 * change is pushed to listeners over Server-Sent Events.
 *
 * <p>The playhead is stored as an anchor ({@code positionMs} at {@code updatedAt}) so each client can
 * compute where the song is right now without the server ticking: position = positionMs +
 * (playing ? now - updatedAt : 0).
 */
@Service
public class JamService {

    private static final Logger log = LoggerFactory.getLogger(JamService.class);

    static final int MAX_QUEUE = 500;
    static final int MAX_LISTENERS = 20;
    /** "Previous" restarts the song when more than this much of it has played. */
    static final long RESTART_THRESHOLD_MS = 3000;
    /** A guest with no open connection for this long has left. */
    static final long GUEST_GRACE_MS = 2 * 60_000;
    /** A Jam whose host has no open connection for this long ends. */
    static final long HOST_GRACE_MS = 10 * 60_000;

    private static final char[] CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();
    private static final SecureRandom RANDOM = new SecureRandom();

    private final CatalogStore catalog;
    private final WorldService world;
    private final Map<String, Jam> jams = new ConcurrentHashMap<>();
    private final Map<String, String> jamOfUser = new ConcurrentHashMap<>();
    private LongSupplier clock = System::currentTimeMillis;

    public JamService(CatalogStore catalog, WorldService world) {
        this.catalog = catalog;
        this.world = world;
    }

    /** Tests move time forward without sleeping. */
    void setClock(LongSupplier clock) {
        this.clock = clock;
    }

    // ---------------------------------------------------------------- wire types

    public record Entry(String entryId, Song song, String addedBy, String addedById) {
    }

    public record Listener(String id, String displayName, String avatarColor, boolean isHost, boolean online) {
    }

    public record View(String code, String hostId, String hostName, boolean guestsCanControl,
                       List<Entry> queue, int index, long positionMs, boolean playing,
                       long serverTime, long version, List<Listener> listeners, boolean ended) {
    }

    public record Start(List<String> songIds, Integer index, Long positionMs, Boolean playing) {
    }

    public record Control(String action, Long positionMs, Integer index) {
    }

    public record AddSongs(List<String> songIds, String position) {
    }

    public record Settings(Boolean guestsCanControl) {
    }

    // ---------------------------------------------------------------- model

    private static final class Member {
        final User user;
        int connections;
        long lastSeen;

        Member(User user, long now) {
            this.user = user;
            this.lastSeen = now;
        }
    }

    private final class Jam {
        final String code;
        final String hostId;
        final Map<String, Member> members = new LinkedHashMap<>();
        final List<Entry> queue = new ArrayList<>();
        final Map<SseEmitter, Member> emitters = new ConcurrentHashMap<>();
        int entrySeq;
        int index;
        long positionMs;
        long updatedAt;
        boolean playing;
        boolean guestsCanControl = true;
        long version;
        boolean ended;

        Jam(String code, String hostId) {
            this.code = code;
            this.hostId = hostId;
        }

        Entry entry(Song song, User by) {
            return new Entry(code.toLowerCase() + "-" + (++entrySeq), song, by.displayName(), by.id());
        }

        long now() {
            return clock.getAsLong();
        }

        long position(long now) {
            long p = positionMs + (playing ? Math.max(0, now - updatedAt) : 0);
            Song s = current();
            return s == null ? 0 : Math.min(p, s.durationMs());
        }

        Song current() {
            return index >= 0 && index < queue.size() ? queue.get(index).song() : null;
        }

        /** Re-anchor the playhead at {@code pos} as of now. */
        void anchor(long pos, boolean play) {
            positionMs = Math.max(0, pos);
            playing = play && current() != null;
            updatedAt = now();
        }

        View view() {
            long now = now();
            Member host = members.get(hostId);
            List<Listener> listeners = members.values().stream()
                    .map(m -> new Listener(m.user.id(), m.user.displayName(), m.user.avatarColor(),
                            m.user.id().equals(hostId), m.connections > 0))
                    .toList();
            return new View(code, hostId, host == null ? "" : host.user.displayName(), guestsCanControl,
                    List.copyOf(queue), index, position(now), playing, now, version, listeners, ended);
        }
    }

    // ---------------------------------------------------------------- queries

    public Optional<View> current(User user) {
        String code = jamOfUser.get(user.id());
        Jam jam = code == null ? null : jams.get(code);
        if (jam == null) {
            return Optional.empty();
        }
        synchronized (jam) {
            return Optional.of(jam.view());
        }
    }

    /** Anyone signed in may look at a Jam before joining (the join page shows who is hosting). */
    public View get(String code) {
        Jam jam = find(code);
        synchronized (jam) {
            return jam.view();
        }
    }

    // ---------------------------------------------------------------- lifecycle

    public View start(User host, Start req) {
        leaveCurrent(host);
        List<Song> songs = catalogSongs(req == null ? null : req.songIds());
        String code = newCode();
        Jam jam = new Jam(code, host.id());
        synchronized (jam) {
            jam.members.put(host.id(), new Member(host, jam.now()));
            for (Song s : songs) {
                jam.queue.add(jam.entry(s, host));
            }
            int index = req != null && req.index() != null ? req.index() : 0;
            jam.index = songs.isEmpty() ? 0 : Math.max(0, Math.min(index, songs.size() - 1));
            jam.anchor(req != null && req.positionMs() != null ? req.positionMs() : 0,
                    req == null || req.playing() == null || req.playing());
            jams.put(code, jam);
            jamOfUser.put(host.id(), code);
            log.info("Jam {} started by {} with {} songs", code, host.id(), songs.size());
            return changed(jam);
        }
    }

    public View join(User user, String code) {
        Jam jam = find(code);
        String previous = jamOfUser.get(user.id());
        if (previous != null && !previous.equals(jam.code)) {
            leaveCurrent(user); // never hold two Jam locks at once
        }
        synchronized (jam) {
            if (jam.ended) {
                throw ApiException.notFound("This Jam has ended or the link is wrong.");
            }
            if (!jam.members.containsKey(user.id())) {
                if (jam.members.size() >= MAX_LISTENERS) {
                    throw ApiException.conflict("jam_full", "This Jam is full (" + MAX_LISTENERS + " listeners).");
                }
                jam.members.put(user.id(), new Member(user, jam.now()));
                jamOfUser.put(user.id(), jam.code);
            }
            return changed(jam);
        }
    }

    /** Guests leave quietly; when the host leaves, the Jam ends for everyone. */
    public void leave(User user, String code) {
        Jam jam = find(code);
        synchronized (jam) {
            if (!jam.members.containsKey(user.id())) {
                return;
            }
            if (jam.hostId.equals(user.id())) {
                end(jam);
                return;
            }
            jam.members.remove(user.id());
            jamOfUser.remove(user.id(), jam.code);
            changed(jam);
        }
    }

    private void leaveCurrent(User user) {
        String code = jamOfUser.get(user.id());
        if (code != null && jams.containsKey(code)) {
            leave(user, code);
        }
        jamOfUser.remove(user.id());
    }

    private void end(Jam jam) {
        jam.ended = true;
        jams.remove(jam.code);
        for (String id : jam.members.keySet()) {
            jamOfUser.remove(id, jam.code);
        }
        changed(jam);
        for (SseEmitter e : List.copyOf(jam.emitters.keySet())) {
            jam.emitters.remove(e);
            e.complete();
        }
        log.info("Jam {} ended", jam.code);
    }

    // ---------------------------------------------------------------- playback and queue

    public View control(User user, String code, Control req) {
        Jam jam = find(code);
        synchronized (jam) {
            Member m = member(jam, user);
            String action = req == null || req.action() == null ? "" : req.action();
            // "ended" is a report from a player, not a command: any listener may send it, and only
            // the first report for the current song advances (the rest are stale and ignored).
            if (action.equals("ended")) {
                if (req.index() != null && req.index() == jam.index && jam.current() != null) {
                    advance(jam);
                    return changed(jam);
                }
                return jam.view();
            }
            requireControl(jam, m);
            long now = jam.now();
            switch (action) {
                case "play" -> jam.anchor(req.positionMs() != null ? req.positionMs() : jam.position(now), true);
                case "pause" -> jam.anchor(req.positionMs() != null ? req.positionMs() : jam.position(now), false);
                case "seek" -> {
                    if (req.positionMs() == null) {
                        throw ApiException.badRequest("invalid_request", "positionMs is required");
                    }
                    Song s = jam.current();
                    long max = s == null ? 0 : s.durationMs();
                    jam.anchor(Math.min(req.positionMs(), max), jam.playing);
                }
                case "next" -> advance(jam);
                case "previous" -> {
                    if (jam.position(now) > RESTART_THRESHOLD_MS || jam.index == 0) {
                        jam.anchor(0, jam.playing);
                    } else {
                        jam.index--;
                        jam.anchor(0, true);
                    }
                }
                case "jump" -> {
                    if (req.index() == null || req.index() < 0 || req.index() >= jam.queue.size()) {
                        throw ApiException.badRequest("invalid_request", "index is out of range");
                    }
                    jam.index = req.index();
                    jam.anchor(0, true);
                }
                default -> throw ApiException.badRequest("invalid_request", "Unknown action: " + action);
            }
            return changed(jam);
        }
    }

    private void advance(Jam jam) {
        if (jam.index + 1 < jam.queue.size()) {
            jam.index++;
            jam.anchor(0, true);
        } else {
            // End of the queue: stop at the start of the last song, like the solo player.
            jam.anchor(0, false);
        }
    }

    /** Every listener can add songs: that is the point of a Jam. */
    public View add(User user, String code, AddSongs req) {
        Jam jam = find(code);
        synchronized (jam) {
            member(jam, user);
            List<Song> songs = catalogSongs(req == null ? null : req.songIds());
            if (jam.queue.size() + songs.size() > MAX_QUEUE) {
                throw ApiException.conflict("jam_queue_full", "The Jam queue is full (" + MAX_QUEUE + " songs).");
            }
            boolean wasEmpty = jam.current() == null;
            List<Entry> entries = songs.stream().map(s -> jam.entry(s, user)).toList();
            if ("next".equals(req.position()) && !wasEmpty) {
                jam.queue.addAll(jam.index + 1, entries);
            } else {
                jam.queue.addAll(entries);
            }
            if (wasEmpty) {
                jam.index = 0;
                jam.anchor(0, true);
            }
            return changed(jam);
        }
    }

    /** Remove an upcoming song. The host can remove anything; guests their own additions or, with controls on, any. */
    public View remove(User user, String code, String entryId) {
        Jam jam = find(code);
        synchronized (jam) {
            Member m = member(jam, user);
            int i = -1;
            for (int k = 0; k < jam.queue.size(); k++) {
                if (jam.queue.get(k).entryId().equals(entryId)) {
                    i = k;
                    break;
                }
            }
            if (i < 0) {
                throw ApiException.notFound("That song is no longer in the Jam queue.");
            }
            if (i == jam.index) {
                throw ApiException.badRequest("invalid_request", "Skip the song that's playing instead of removing it.");
            }
            boolean own = jam.queue.get(i).addedById().equals(m.user.id());
            if (!own) {
                requireControl(jam, m);
            }
            jam.queue.remove(i);
            if (i < jam.index) {
                jam.index--;
            }
            return changed(jam);
        }
    }

    public View settings(User user, String code, Settings req) {
        Jam jam = find(code);
        synchronized (jam) {
            if (!jam.hostId.equals(user.id())) {
                throw ApiException.forbidden("Only the host can change Jam settings.");
            }
            if (req != null && req.guestsCanControl() != null) {
                jam.guestsCanControl = req.guestsCanControl();
            }
            return changed(jam);
        }
    }

    // ---------------------------------------------------------------- live updates

    public SseEmitter subscribe(User user, String code) {
        Jam jam = find(code);
        SseEmitter emitter = new SseEmitter(0L);
        synchronized (jam) {
            Member m = member(jam, user);
            m.connections++;
            m.lastSeen = jam.now();
            jam.emitters.put(emitter, m);
            Runnable gone = () -> disconnected(jam, emitter);
            emitter.onCompletion(gone);
            emitter.onTimeout(gone);
            emitter.onError(e -> gone.run());
            View v = m.connections == 1 ? changed(jam) : jam.view();
            send(jam, emitter, v);
        }
        return emitter;
    }

    private void disconnected(Jam jam, SseEmitter emitter) {
        synchronized (jam) {
            Member m = jam.emitters.remove(emitter);
            if (m == null) {
                return;
            }
            m.connections = Math.max(0, m.connections - 1);
            m.lastSeen = jam.now();
            if (m.connections == 0 && !jam.ended) {
                changed(jam);
            }
        }
    }

    /** Heartbeat keeps proxies from closing idle streams; also prunes listeners who never came back. */
    @Scheduled(fixedDelay = 20_000, initialDelay = 20_000)
    public void sweep() {
        for (Jam jam : List.copyOf(jams.values())) {
            synchronized (jam) {
                long now = jam.now();
                Member host = jam.members.get(jam.hostId);
                if (host == null || (host.connections == 0 && now - host.lastSeen > HOST_GRACE_MS)) {
                    end(jam);
                    continue;
                }
                List<String> gone = jam.members.values().stream()
                        .filter(m -> !m.user.id().equals(jam.hostId) && m.connections == 0 && now - m.lastSeen > GUEST_GRACE_MS)
                        .map(m -> m.user.id())
                        .toList();
                for (String id : gone) {
                    jam.members.remove(id);
                    jamOfUser.remove(id, jam.code);
                }
                if (!gone.isEmpty()) {
                    changed(jam);
                }
                for (SseEmitter e : List.copyOf(jam.emitters.keySet())) {
                    try {
                        e.send(SseEmitter.event().comment("keep-alive"));
                    } catch (IOException | IllegalStateException ex) {
                        dropped(jam, e, ex);
                    }
                }
            }
        }
    }

    private View changed(Jam jam) {
        jam.version++;
        View v = jam.view();
        for (SseEmitter e : List.copyOf(jam.emitters.keySet())) {
            send(jam, e, v);
        }
        return v;
    }

    private void send(Jam jam, SseEmitter e, View v) {
        try {
            e.send(SseEmitter.event().name("jam").data(v));
        } catch (IOException | IllegalStateException ex) {
            dropped(jam, e, ex);
        }
    }

    /** A stream that can no longer be written to: forget it now rather than waiting for the container. */
    private void dropped(Jam jam, SseEmitter e, Exception ex) {
        disconnected(jam, e);
        try {
            e.completeWithError(ex);
        } catch (RuntimeException ignored) {
            // already closed
        }
    }

    // ---------------------------------------------------------------- helpers

    private Jam find(String code) {
        Jam jam = code == null ? null : jams.get(code.toUpperCase());
        if (jam == null) {
            throw ApiException.notFound("This Jam has ended or the link is wrong.");
        }
        return jam;
    }

    private Member member(Jam jam, User user) {
        Member m = jam.members.get(user.id());
        if (m == null) {
            throw ApiException.forbidden("Join the Jam first.");
        }
        return m;
    }

    private void requireControl(Jam jam, Member m) {
        if (!jam.guestsCanControl && !jam.hostId.equals(m.user.id())) {
            throw ApiException.forbidden("The host has turned off controls for guests.");
        }
    }

    /** Only public songs: imported files are private to the person who imported them. */
    private List<Song> catalogSongs(Collection<String> ids) {
        if (ids == null || ids.isEmpty()) {
            return List.of();
        }
        // Catalog songs and worldwide previews (both public); never imports, which are private.
        List<Song> songs = ids.stream().distinct()
                .filter(WorldService::isWorldId) // worldwide songs only
                .map(world::find)
                .filter(s -> s != null).limit(MAX_QUEUE).toList();
        if (songs.isEmpty()) {
            throw ApiException.badRequest("jam_unsupported_songs", "Imported songs are private, so they can't be played in a Jam.");
        }
        return songs;
    }

    private String newCode() {
        while (true) {
            StringBuilder sb = new StringBuilder(6);
            for (int i = 0; i < 6; i++) {
                sb.append(CODE_ALPHABET[RANDOM.nextInt(CODE_ALPHABET.length)]);
            }
            String code = sb.toString();
            if (!jams.containsKey(code)) {
                return code;
            }
        }
    }
}
