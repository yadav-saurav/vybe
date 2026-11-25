import { beforeEach, describe, expect, it } from 'vitest';
import type { Song } from '@vybe/shared';
import { usePlayer, selectUpcoming } from './player';

const art = { url: '/a.webp', width: 1, height: 1, bgColor: '#000000', textColor1: '#fff', textColor2: '#eee', textColor3: '#ddd' };
const song = (n: number): Song => ({
  id: `so_${n}`, title: `Song ${n}`, artist: { id: 'ar_1', name: 'Artist' }, featuring: [], album: { id: 'al_1', title: 'Album' },
  genreId: 'pop', trackNumber: n, discNumber: 1, durationMs: 200_000 + n, isExplicit: false, hasLyrics: true, audioUrl: `/api/stream/so_${n}`,
  artwork: art, releaseDate: '2026-01-01', bpm: 100, mood: 'chill', energy: 0.5, popularity: 50, composer: 'X',
});
const songs = (...ns: number[]) => ns.map(song);
const ids = (items: { song: Song }[]) => items.map((q) => q.song.id);
const P = () => usePlayer.getState();
const cur = () => P().current?.song.id;
const ctx = { type: 'album' as const, id: 'al_1', title: 'Album' };

beforeEach(() => {
  usePlayer.setState(usePlayer.getInitialState(), true);
  usePlayer.setState({ current: null, history: [], userQueue: [], contextQueue: [], contextOriginal: [], autoplay: [], shuffle: false, repeat: 'off', autoplayEnabled: true, positionMs: 0, seekRequest: null, isPlaying: false });
});

describe('play order', () => {
  it('plays a list from the start index and queues the rest in order', () => {
    P().playSongs(songs(1, 2, 3, 4), 1, ctx);
    expect(cur()).toBe('so_2');
    expect(ids(P().contextQueue)).toEqual(['so_3', 'so_4']);
    expect(P().isPlaying).toBe(true);
    expect(P().durationMs).toBe(song(2).durationMs);
    expect(P().context).toEqual(ctx);
  });

  it('next walks the context, pushing to history', () => {
    P().playSongs(songs(1, 2, 3), 0, ctx);
    const t0 = P().loadToken;
    P().next();
    expect(cur()).toBe('so_2');
    expect(ids(P().history)).toEqual(['so_1']);
    expect(P().loadToken).toBe(t0 + 1);
  });

  it('starting a new list keeps the previous song in history and resets autoplay', () => {
    P().playSongs(songs(1, 2), 0, ctx);
    P().setAutoplaySongs(songs(9));
    P().playSongs(songs(5, 6), 0, { type: 'playlist', id: 'pl' });
    expect(ids(P().history)).toEqual(['so_1']);
    expect(P().autoplay).toEqual([]);
  });

  it('ignores empty lists', () => {
    P().playSongs([], 0, ctx);
    expect(P().current).toBeNull();
  });

  it('gives every queue item a unique uid, even for duplicate songs', () => {
    P().playSongs(songs(1, 1, 1), 0, ctx);
    P().playNext(songs(1));
    const uids = [P().current!.uid, ...P().contextQueue.map((q) => q.uid), ...P().userQueue.map((q) => q.uid)];
    expect(new Set(uids).size).toBe(4);
  });
});

describe('playNext / playLater', () => {
  it('playNext goes to the front of the user queue, playLater to the back; both before context', () => {
    P().playSongs(songs(1, 2, 3), 0, ctx);
    P().playLater(songs(10));
    P().playNext(songs(20, 21));
    P().playLater(songs(11));
    expect(ids(P().userQueue)).toEqual(['so_20', 'so_21', 'so_10', 'so_11']);
    expect(ids(selectUpcoming(P()))).toEqual(['so_20', 'so_21', 'so_10', 'so_11', 'so_2', 'so_3']);
    P().next();
    expect(cur()).toBe('so_20');
    expect(P().current?.source).toBe('user');
    P().next(); P().next(); P().next();
    expect(cur()).toBe('so_11');
    P().next();
    expect(cur()).toBe('so_2');
  });

  it('starts playback when nothing is playing', () => {
    P().playNext(songs(7));
    expect(cur()).toBe('so_7');
    expect(P().context?.type).toBe('queue');
    usePlayer.setState(usePlayer.getInitialState(), true);
    usePlayer.setState({ current: null, history: [] });
    P().playLater(songs(8, 9));
    expect(cur()).toBe('so_8');
    expect(ids(P().contextQueue)).toEqual(['so_9']);
  });
});

describe('previous (3 second rule)', () => {
  it('restarts the track when more than 3s in', () => {
    P().playSongs(songs(1, 2), 0, ctx);
    P().next();
    usePlayer.setState({ positionMs: 3500 });
    const tok = P().loadToken;
    P().previous();
    expect(cur()).toBe('so_2');
    expect(P().seekRequest?.ms).toBe(0);
    expect(P().positionMs).toBe(0);
    expect(P().loadToken).toBe(tok);
  });

  it('goes back to the previous track within the first 3s and requeues the current one', () => {
    P().playSongs(songs(1, 2, 3), 0, ctx);
    P().next();
    usePlayer.setState({ positionMs: 2000 });
    P().previous();
    expect(cur()).toBe('so_1');
    expect(ids(P().contextQueue)).toEqual(['so_2', 'so_3']);
    expect(P().history).toEqual([]);
  });

  it('returns a user-queued song to the user queue', () => {
    P().playSongs(songs(1, 2), 0, ctx);
    P().playNext(songs(5));
    P().next();
    P().previous();
    expect(cur()).toBe('so_1');
    expect(ids(P().userQueue)).toEqual(['so_5']);
    expect(ids(P().contextQueue)).toEqual(['so_2']);
  });

  it('restarts when there is no history', () => {
    P().playSongs(songs(1, 2), 0, ctx);
    P().previous();
    expect(cur()).toBe('so_1');
    expect(P().seekRequest?.ms).toBe(0);
  });

  it('consecutive restart requests are distinct', () => {
    P().playSongs(songs(1), 0, ctx);
    P().previous();
    const a = P().seekRequest;
    P().previous();
    expect(P().seekRequest).not.toBe(a);
    expect(P().seekRequest!.token).not.toBe(a!.token);
  });
});

describe('shuffle', () => {
  it('shuffles the remaining context and restores the original order (after the current song) when turned off', () => {
    const list = songs(1, 2, 3, 4, 5, 6, 7, 8, 9, 10);
    P().playSongs(list, 2, ctx);
    const before = ids(P().contextQueue);
    let differs = false;
    for (let i = 0; i < 10 && !differs; i++) {
      P().toggleShuffle();
      expect(P().shuffle).toBe(true);
      expect(ids(P().contextQueue).sort()).toEqual([...before].sort());
      differs = ids(P().contextQueue).join() !== before.join();
      P().toggleShuffle();
      expect(P().shuffle).toBe(false);
      expect(ids(P().contextQueue)).toEqual(before);
    }
    expect(differs).toBe(true);
  });

  it('unshuffle continues after the current song even when a user-queued song is playing', () => {
    P().playSongs(songs(1, 2, 3, 4, 5), 0, ctx);
    P().toggleShuffle();
    P().playNext(songs(9));
    P().next(); // plays so_9 (user)
    P().toggleShuffle();
    expect(ids(P().contextQueue)).toEqual(['so_2', 'so_3', 'so_4', 'so_5']);
  });

  it('play with shuffle picks a random start and keeps all songs', () => {
    P().playSongs(songs(1, 2, 3, 4), 0, ctx, { shuffle: true });
    expect(P().shuffle).toBe(true);
    expect([cur()!, ...ids(P().contextQueue)].sort()).toEqual(['so_1', 'so_2', 'so_3', 'so_4']);
    P().toggleShuffle();
    const idx = Number(cur()!.split('_')[1]);
    const all = songs(1, 2, 3, 4).map((x) => x.id);
    expect(ids(P().contextQueue)).toEqual([...all.slice(idx), ...all.slice(0, idx - 1)]);
  });
});

describe('repeat', () => {
  it('cycles off → all → one → off', () => {
    expect(P().repeat).toBe('off');
    P().cycleRepeat(); expect(P().repeat).toBe('all');
    P().cycleRepeat(); expect(P().repeat).toBe('one');
    P().cycleRepeat(); expect(P().repeat).toBe('off');
  });

  it('repeat one replays the current track on end, but next still advances', () => {
    P().playSongs(songs(1, 2), 0, ctx);
    usePlayer.setState({ repeat: 'one' });
    const tok = P().loadToken;
    P()._onEnded();
    expect(cur()).toBe('so_1');
    expect(P().loadToken).toBe(tok);
    expect(P().seekRequest?.ms).toBe(0);
    expect(P().isPlaying).toBe(true);
    P().next();
    expect(cur()).toBe('so_2');
  });

  it('repeat all wraps around to the start of the context', () => {
    P().playSongs(songs(1, 2, 3), 0, ctx);
    usePlayer.setState({ repeat: 'all' });
    P()._onEnded(); P()._onEnded();
    expect(cur()).toBe('so_3');
    P()._onEnded();
    expect(cur()).toBe('so_1');
    expect(ids(P().contextQueue)).toEqual(['so_2', 'so_3']);
    expect(P().isPlaying).toBe(true);
  });

  it('repeat all keeps unshuffle working after wrapping', () => {
    P().playSongs(songs(1, 2, 3, 4), 0, ctx);
    usePlayer.setState({ repeat: 'all' });
    P().toggleShuffle();
    P().next(); P().next(); P().next(); P().next(); // wraps (reshuffled)
    P().toggleShuffle();
    const idx = Number(cur()!.split('_')[1]);
    const all = songs(1, 2, 3, 4).map((x) => x.id);
    expect(ids(P().contextQueue)).toEqual([...all.slice(idx), ...all.slice(0, idx - 1)]);
  });

  it('repeat all takes precedence over autoplay', () => {
    P().playSongs(songs(1), 0, ctx);
    P().setAutoplaySongs(songs(50));
    usePlayer.setState({ repeat: 'all' });
    P().next();
    expect(cur()).toBe('so_1');
  });
});

describe('skipToQueueItem', () => {
  it('skips into the user queue, sending skipped items to history', () => {
    P().playSongs(songs(1, 2, 3), 0, ctx);
    P().playLater(songs(10, 11, 12));
    P().skipToQueueItem(P().userQueue[1].uid);
    expect(cur()).toBe('so_11');
    expect(ids(P().userQueue)).toEqual(['so_12']);
    expect(ids(P().contextQueue)).toEqual(['so_2', 'so_3']);
    expect(ids(P().history)).toEqual(['so_1', 'so_10']);
  });

  it('skips into the context queue, consuming the user queue', () => {
    P().playSongs(songs(1, 2, 3, 4), 0, ctx);
    P().playLater(songs(10));
    P().skipToQueueItem(P().contextQueue[1].uid);
    expect(cur()).toBe('so_3');
    expect(P().userQueue).toEqual([]);
    expect(ids(P().contextQueue)).toEqual(['so_4']);
    expect(P().durationMs).toBe(song(3).durationMs);
  });

  it('skips into autoplay and replays from history', () => {
    P().playSongs(songs(1, 2), 0, ctx);
    P().setAutoplaySongs(songs(50, 51));
    P().skipToQueueItem(P().autoplay[1].uid);
    expect(cur()).toBe('so_51');
    expect(P().contextQueue).toEqual([]);
    expect(P().autoplay).toEqual([]);
    const h = P().history.find((q) => q.song.id === 'so_1')!;
    P().skipToQueueItem(h.uid);
    expect(cur()).toBe('so_1');
    expect(P().history.at(-1)?.song.id).toBe('so_51');
  });

  it('ignores unknown uids', () => {
    P().playSongs(songs(1, 2), 0, ctx);
    const before = P().current;
    P().skipToQueueItem('nope');
    expect(P().current).toBe(before);
  });
});

describe('remove / move / clear', () => {
  it('removes from any queue', () => {
    P().playSongs(songs(1, 2, 3), 0, ctx);
    P().playLater(songs(10));
    P().setAutoplaySongs(songs(50));
    P().removeFromQueue(P().contextQueue[0].uid);
    P().removeFromQueue(P().userQueue[0].uid);
    P().removeFromQueue(P().autoplay[0].uid);
    expect(ids(selectUpcoming(P()))).toEqual(['so_3']);
  });

  it('removed context songs do not come back on repeat all', () => {
    P().playSongs(songs(1, 2, 3), 0, ctx);
    usePlayer.setState({ repeat: 'all' });
    P().removeFromQueue(P().contextQueue[0].uid);
    P().next(); P().next();
    expect(cur()).toBe('so_1');
    expect(ids(P().contextQueue)).toEqual(['so_3']);
  });

  it('moves within the user queue and the context queue', () => {
    P().playSongs(songs(1, 2, 3, 4), 0, ctx);
    P().playLater(songs(10, 11, 12));
    P().moveInUserQueue(0, 2);
    expect(ids(P().userQueue)).toEqual(['so_11', 'so_12', 'so_10']);
    P().moveInContextQueue(2, 0);
    expect(ids(P().contextQueue)).toEqual(['so_4', 'so_2', 'so_3']);
  });

  it('clear empties all upcoming items but keeps the current song', () => {
    P().playSongs(songs(1, 2), 0, ctx);
    P().playLater(songs(10));
    P().clearQueue();
    expect(selectUpcoming(P())).toEqual([]);
    expect(cur()).toBe('so_1');
  });
});

describe('autoplay fallback and end of queue', () => {
  it('continues into autoplay songs when the context runs out', () => {
    P().playSongs(songs(1), 0, ctx);
    P().setAutoplaySongs(songs(50, 51));
    P()._onEnded();
    expect(cur()).toBe('so_50');
    expect(P().current?.source).toBe('autoplay');
    expect(P().isPlaying).toBe(true);
    P().appendAutoplaySongs(songs(52));
    expect(ids(P().autoplay)).toEqual(['so_51', 'so_52']);
  });

  it('does not use autoplay when disabled, and hides it from upcoming', () => {
    P().playSongs(songs(1), 0, ctx);
    P().setAutoplaySongs(songs(50));
    P().setAutoplayEnabled(false);
    expect(selectUpcoming(P())).toEqual([]);
    P()._onEnded();
    expect(cur()).toBe('so_1');
    expect(P().isPlaying).toBe(false);
  });

  it('stops at the start of the last song at the end of everything', () => {
    P().playSongs(songs(1, 2), 0, ctx);
    P()._onEnded();
    usePlayer.setState({ positionMs: 199_000 });
    P()._onEnded();
    expect(cur()).toBe('so_2');
    expect(P().isPlaying).toBe(false);
    expect(P().positionMs).toBe(0);
    expect(P().seekRequest?.ms).toBe(0);
  });

  it('previous from an autoplay song returns it to autoplay', () => {
    P().playSongs(songs(1), 0, ctx);
    P().setAutoplaySongs(songs(50, 51));
    P().next();
    P().previous();
    expect(cur()).toBe('so_1');
    expect(ids(P().autoplay)).toEqual(['so_50', 'so_51']);
  });
});

describe('stations, transport and settings', () => {
  it('plays a station and appends batches', () => {
    usePlayer.setState({ shuffle: true, repeat: 'all' });
    P().playStation('st_1', 'Hits', songs(1, 2));
    expect(P().context).toEqual({ type: 'station', id: 'st_1', title: 'Hits' });
    expect(P().shuffle).toBe(false);
    expect(P().repeat).toBe('off');
    P().appendStation(songs(3));
    expect(ids(P().contextQueue)).toEqual(['so_2', 'so_3']);
    expect(P().contextQueue[1].source).toBe('station');
  });

  it('toggles play only when something is loaded', () => {
    P().togglePlay();
    expect(P().isPlaying).toBe(false);
    P().playSongs(songs(1), 0, ctx);
    P().togglePlay();
    expect(P().isPlaying).toBe(false);
    P().play();
    expect(P().isPlaying).toBe(true);
  });

  it('clamps seeks to the duration', () => {
    P().playSongs(songs(1), 0, ctx);
    P().seek(-5);
    expect(P().seekRequest?.ms).toBe(0);
    P().seek(10_000_000);
    expect(P().seekRequest?.ms).toBe(song(1).durationMs);
  });

  it('clamps volume and handles mute', () => {
    P().setVolume(2); expect(P().volume).toBe(1);
    P().setVolume(0); expect(P().muted).toBe(true);
    P().toggleMute(); expect(P().muted).toBe(false); expect(P().volume).toBe(0.5);
    P().toggleMute(); expect(P().muted).toBe(true); expect(P().volume).toBe(0.5);
  });

  it('records engine errors and stops', () => {
    P().playSongs(songs(1), 0, ctx);
    P()._onError('boom');
    expect(P().error).toBe('boom');
    expect(P().isPlaying).toBe(false);
  });

  it('persists the session to localStorage (throttled, so continuous time updates still save)', async () => {
    P().playSongs(songs(1, 2), 0, ctx);
    // Simulate a stream of engine time updates faster than the throttle window.
    for (let i = 1; i <= 6; i++) { P()._onTime(i * 250, 200_000, 0); await new Promise((r) => setTimeout(r, 250)); }
    const saved = JSON.parse(localStorage.getItem('vybe:player:v1')!);
    expect(saved.current.song.id).toBe('so_1');
    expect(saved.contextQueue).toHaveLength(1);
    expect(saved.positionMs).toBeGreaterThan(0);
  });

  it('flushes the session on pagehide', () => {
    P().playSongs(songs(3), 0, ctx);
    P()._onTime(42_000, 200_000, 0);
    dispatchEvent(new Event('pagehide'));
    const saved = JSON.parse(localStorage.getItem('vybe:player:v1')!);
    expect(saved.current.song.id).toBe('so_3');
    expect(saved.positionMs).toBe(42_000);
  });
});

describe('sleep timer', () => {
  it('"after this song" stops at the end of the current song and loads the next one paused', () => {
    P().playSongs(songs(1, 2, 3), 0, ctx);
    P().setSleep('end');
    expect(P().sleepAtEnd).toBe(true);
    P()._onEnded();
    expect(cur()).toBe('so_2');
    expect(P().isPlaying).toBe(false);
    expect(P().sleepAtEnd).toBe(false);
    // The following song after resuming is a normal play-through again.
    P().play();
    P()._onEnded();
    expect(cur()).toBe('so_3');
    expect(P().isPlaying).toBe(true);
  });

  it('a manual skip does not consume "after this song"', () => {
    P().playSongs(songs(1, 2, 3), 0, ctx);
    P().setSleep('end');
    P().next();
    expect(cur()).toBe('so_2');
    expect(P().isPlaying).toBe(true);
    expect(P().sleepAtEnd).toBe(true);
  });

  it('timed sleep fires exactly once, after the deadline', () => {
    P().playSongs(songs(1, 2), 0, ctx);
    P().setSleep(15);
    const at = P().sleepEndsAt!;
    expect(at).toBeGreaterThan(Date.now() + 14 * 60_000);
    expect(P()._sleepDue(at - 1)).toBe(false);
    expect(P()._sleepDue(at)).toBe(true);
    expect(P()._sleepDue(at + 1000)).toBe(false);
    expect(P().sleepEndsAt).toBeNull();
  });

  it('setting one mode replaces the other, and null cancels', () => {
    P().setSleep('end');
    P().setSleep(30);
    expect(P().sleepAtEnd).toBe(false);
    expect(P().sleepEndsAt).not.toBeNull();
    P().setSleep('end');
    expect(P().sleepEndsAt).toBeNull();
    P().setSleep(null);
    expect(P().sleepAtEnd).toBe(false);
  });
});
