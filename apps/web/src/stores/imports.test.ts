import { describe, expect, it } from 'vitest';
import { precheck, summarize } from './imports';
import { albumHref, artistHref, isImported } from '../lib/imports';
import type { Song } from '@vybe/shared';

describe('import helpers', () => {
  it('summarizes a batch like the toast copy', () => {
    expect(summarize(12, ['unsupported format'])).toBe('12 imported, 1 skipped (unsupported format)');
    expect(summarize(2, [])).toBe('2 imported');
    expect(summarize(0, ['unsupported format', 'already imported', 'unsupported format']))
      .toBe('0 imported, 3 skipped (2 unsupported format, 1 already imported)');
    expect(summarize(1, [], 1)).toBe('1 imported, 1 failed');
  });

  it('rejects unsupported, empty and oversized files before uploading', () => {
    const f = (name: string, size: number) => ({ name, size }) as File;
    expect(precheck(f('tone.m4a', 1000))).toBeUndefined();
    expect(precheck(f('TONE.FLAC', 1000))).toBeUndefined();
    expect(precheck(f('notes.txt', 1000))).toBe('unsupported format');
    expect(precheck(f('tone.mp3', 0))).toBe('empty file');
    expect(precheck(f('tone.wav', 50 * 1024 * 1024 + 1))).toBe('too large (max 50 MB)');
  });

  it('links imported songs to the Imported page instead of album and artist pages', () => {
    const base = { id: 'so_0001', artist: { id: 'ar_001', name: 'A' }, album: { id: 'al_001', title: 'B' } } as Song;
    const imp = { ...base, id: 'im_abcdefghijkm', source: 'import', artist: { id: 'imar_a', name: 'Sample Artist' } } as Song;
    expect(isImported(base)).toBe(false);
    expect(isImported(imp)).toBe(true);
    expect(albumHref(base)).toBe('/album/al_001?i=so_0001');
    expect(albumHref(imp)).toBe('/library/imported?i=im_abcdefghijkm');
    expect(artistHref(imp)).toBe('/library/imported?q=Sample%20Artist');
  });
});
