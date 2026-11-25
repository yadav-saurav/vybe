import { describe, expect, it } from 'vitest';
import type { JamView } from '../lib/api';
import { canControl, sharedPosition } from './jam';

const song = { durationMs: 200_000 } as JamView['queue'][number]['song'];
const view = (over: Partial<JamView> = {}): JamView => ({
  code: 'ABC234', hostId: 'u_host', hostName: 'Host', guestsCanControl: true,
  queue: [{ entryId: 'e1', song, addedBy: 'Host', addedById: 'u_host' }], index: 0,
  positionMs: 10_000, playing: true, serverTime: 1_000_000, version: 1, listeners: [], ended: false, ...over,
});

describe('jam sync', () => {
  it('advances the shared playhead with server time while playing', () => {
    // local clock 5 s behind the server
    expect(sharedPosition(view(), 5_000, 1_000_000 - 5_000 + 3_000)).toBe(13_000);
  });
  it('holds still while paused and never runs past the end of the song', () => {
    expect(sharedPosition(view({ playing: false }), 0, 9_999_999)).toBe(10_000);
    expect(sharedPosition(view(), 0, 1_000_000 + 999_000)).toBe(200_000);
  });
  it('lets the host always control and guests only when allowed', () => {
    expect(canControl(view({ guestsCanControl: false }), 'u_host')).toBe(true);
    expect(canControl(view({ guestsCanControl: false }), 'u_guest')).toBe(false);
    expect(canControl(view(), 'u_guest')).toBe(true);
    expect(canControl(null, 'u_host')).toBe(false);
  });
});
