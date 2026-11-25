# Vybe content catalog

All content is original and generated: invented artists, albums, songs, lyrics, playlists, stations, abstract artwork and synthesized audio. No real artists, titles, lyrics or brands are used.

## Counts (current generation)

| Item | Count |
| --- | --- |
| Genres | 12 |
| Artists | 32 (2 to 4 per genre) |
| Albums | 55: 30 albums (6 to 10 tracks), 10 EPs (4 to 5), 15 singles (1 to 2) |
| Songs | 306 (`so_0001` to `so_0306`), 128 s to 214 s, all with synthesized audio |
| Songs with lyrics | 170 (56%), 6,195 lyric lines |
| Explicit albums | 17 |
| Albums released after 2026-09-01 | 12 (latest 2026-11-20) |
| Editorial playlists | 36 (`pl_ed_001` to `pl_ed_036`), 15 to 40 tracks each |
| Stations | 16: 3 live, 9 genre, 4 artist |
| Artwork files | 549 WebP (183 images at 1000, 400 and 160 px) |
| Audio files | 306 M4A (AAC 128 kbps stereo, 44.1 kHz, faststart) |

Media size: about 850 MB of audio and 35 MB of artwork (about 925 MB in total). Total audio runtime is about 14.6 hours.

## Regenerate

From the repository root:

    python3 scripts/generate_catalog.py    # about 11 minutes on 4 cores
    python3 scripts/validate_catalog.py    # checks references, files, durations, lyrics and palettes

The generator is deterministic (`SEED = 20261125`). Test mode is available with `VYBE_LIMIT=N` (audio for the first N songs only) and `VYBE_OUT=<dir>` (write everything elsewhere).

Outputs: `data/catalog.json`, `data/lyrics.json`, `data/media/art/`, `data/media/audio/`. Media is gitignored.

## Notes

- Audio is synthesized (chords, bass, drums, pads, lead melody, reverb, lo-fi crackle where it applies). There are no sung vocals. Lyrics are timed text, shown in sections, and are not sung.
- Durations are measured with ffprobe after AAC encoding. Lyric end times are clamped to the encoded duration.
- Palettes: `bgColor` is the dominant colour from 8-colour quantization. `textColor1` is pure white or pure black, whichever contrasts more. `textColor2` is `textColor1` mixed 64% toward `bgColor`. `textColor3` is the most saturated palette colour, nudged toward black or white until contrast is at least 4.5:1.
- Loudness: mean level is about -16 dBFS RMS, which approximates -14 LUFS. Peaks are soft-limited below 0 dBFS.
