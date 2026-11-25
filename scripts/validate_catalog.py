#!/usr/bin/env python3
"""Validate data/catalog.json, data/lyrics.json and the generated media.

Usage (from the repo root): python3 scripts/validate_catalog.py
Exits with status 1 when any check fails.
"""
import json
import re
import subprocess
import sys
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
ART = DATA / "media" / "art"
AUDIO = DATA / "media" / "audio"
HEX = re.compile(r"^#[0-9a-f]{6}$")
GENRE_IDS = ['pop', 'hiphop', 'rnb', 'electronic', 'rock', 'indie', 'jazz', 'classical', 'country', 'latin',
             'ambient', 'lofi']
MOODS = {'chill', 'upbeat', 'melancholy', 'energetic', 'romantic', 'dreamy', 'dark', 'focus'}

errors = []


def check(cond, msg):
    if not cond:
        errors.append(msg)


def lum(rgb):
    def ch(v):
        v = v / 255.0
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(int(rgb[i:i + 2], 16)) for i in (1, 3, 5))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def ffprobe_ms(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, check=True).stdout.strip()
    return float(out) * 1000.0


def main():
    cat = json.loads((DATA / "catalog.json").read_text(encoding="utf-8"))
    lyrics = json.loads((DATA / "lyrics.json").read_text(encoding="utf-8"))
    check(cat.get("version") == 1, "version must be 1")

    def uniq(name, items):
        ids = [x["id"] for x in items]
        dup = [k for k, v in Counter(ids).items() if v > 1]
        check(not dup, f"duplicate {name} ids: {dup[:5]}")
        return {x["id"]: x for x in items}

    genres = uniq("genre", cat["genres"])
    artists = uniq("artist", cat["artists"])
    albums = uniq("album", cat["albums"])
    songs = uniq("song", cat["songs"])
    playlists = uniq("playlist", cat["playlists"])
    stations = uniq("station", cat["stations"])
    check(sorted(genres) == sorted(GENRE_IDS), "genre ids must match GENRE_IDS")

    # Artwork checks: files, dimensions, palette and contrast
    art_objs = []
    for g in genres.values():
        art_objs.append((f"genre_{g['id']}", g["artwork"]))
    for coll in (artists.values(), albums.values(), playlists.values(), stations.values()):
        for x in coll:
            art_objs.append((x["id"], x["artwork"]))
    for a in artists.values():
        art_objs.append((a["id"] + "_hero", a["heroArtwork"]))
    # artist portrait artwork uses the artist id; hero uses <id>_hero
    for gid, aw in art_objs:
        for suffix in ("", "_400", "_160"):
            check((ART / f"{gid}{suffix}.webp").exists(), f"missing art file {gid}{suffix}.webp")
    for aid, aw in art_objs:
        for k in ("bgColor", "textColor1", "textColor2", "textColor3"):
            check(bool(HEX.match(aw[k])), f"bad hex {k} on {aid}: {aw[k]}")
        if HEX.match(aw["bgColor"]) and HEX.match(aw["textColor1"]) and HEX.match(aw["textColor3"]):
            check(contrast(aw["textColor1"], aw["bgColor"]) >= 4.5, f"textColor1 contrast low on {aid}")
            check(contrast(aw["textColor3"], aw["bgColor"]) >= 4.5, f"textColor3 contrast low on {aid}")
        check(aw["url"] == f"/media/art/{aid}.webp" and aw["width"] == 1000 and aw["height"] == 1000,
              f"bad artwork url/size on {aid}")

    # Reference integrity
    for a in artists.values():
        for g in a["genreIds"]:
            check(g in genres, f"artist {a['id']} unknown genre {g}")
    for al in albums.values():
        check(al["artist"]["id"] in artists, f"album {al['id']} unknown artist")
        check(al["genreId"] in genres, f"album {al['id']} unknown genre")
        check(al["type"] in ("album", "single", "ep", "compilation"), f"album {al['id']} bad type")
        for t in al["trackIds"]:
            check(t in songs, f"album {al['id']} unknown track {t}")
    song_album = {}
    for s in songs.values():
        check(s["artist"]["id"] in artists, f"song {s['id']} unknown artist")
        for f_ in s["featuring"]:
            check(f_["id"] in artists, f"song {s['id']} unknown featuring {f_['id']}")
        check(s["genreId"] in genres, f"song {s['id']} unknown genre")
        check(s["album"]["id"] in albums, f"song {s['id']} unknown album")
        song_album[s["id"]] = s["album"]["id"]
        check(s["audioUrl"] == f"/api/stream/{s['id']}", f"song {s['id']} bad audioUrl")
        check(s["mood"] in MOODS, f"song {s['id']} bad mood")
        check(0 <= s["energy"] <= 1 and 0 <= s["popularity"] <= 100, f"song {s['id']} energy/popularity range")
        check(s["hasLyrics"] == (s["id"] in lyrics), f"song {s['id']} hasLyrics mismatch with lyrics.json")
    for al in albums.values():
        for t in al["trackIds"]:
            check(song_album.get(t) == al["id"], f"track {t} not pointing back to album {al['id']}")
    for p in playlists.values():
        check(p["kind"] == "editorial", f"playlist {p['id']} not editorial")
        for t in p["trackIds"]:
            check(t in songs, f"playlist {p['id']} unknown track {t}")
        check(15 <= len(p["trackIds"]) <= 40, f"playlist {p['id']} has {len(p['trackIds'])} tracks")
    for st in stations.values():
        if st["kind"] == "genre":
            check(st.get("seedId") in genres, f"station {st['id']} bad genre seed")
        elif st["kind"] == "artist":
            check(st.get("seedId") in artists, f"station {st['id']} bad artist seed")
        else:
            check("seedId" not in st, f"live station {st['id']} should not have seedId")
    for lid in lyrics:
        check(lid in songs, f"lyrics for unknown song {lid}")

    # Album titles unique
    titles = Counter(a["title"].lower() for a in albums.values())
    dups = [t for t, n in titles.items() if n > 1]
    check(not dups, f"duplicate album titles: {dups}")

    # Audio files and durations
    measured = {}
    for s in songs.values():
        path = AUDIO / f"{s['id']}.m4a"
        if not path.exists():
            errors.append(f"missing audio {path.name}")
            continue
        ms = ffprobe_ms(path)
        measured[s["id"]] = ms
        check(abs(ms - s["durationMs"]) <= 50, f"durationMs {s['durationMs']} vs ffprobe {ms:.0f} on {s['id']}")
        check(120000 <= s["durationMs"] <= 225000, f"song {s['id']} duration {s['durationMs']} outside 2:00-3:45")

    # Album and playlist durations equal the sum of tracks
    for al in albums.values():
        total = sum(songs[t]["durationMs"] for t in al["trackIds"] if t in songs)
        check(al["durationMs"] == total, f"album {al['id']} durationMs {al['durationMs']} != sum {total}")
    for p in playlists.values():
        total = sum(songs[t]["durationMs"] for t in p["trackIds"] if t in songs)
        check(p["durationMs"] == total, f"playlist {p['id']} durationMs != sum of tracks")

    # Lyrics: ordered, non-overlapping and in range
    for sid, lines in lyrics.items():
        if sid not in songs:
            continue
        dur = songs[sid]["durationMs"]
        prev_end = 0
        for ln in lines:
            check(0 <= ln["startMs"] < ln["endMs"] <= dur, f"lyric out of range in {sid}: {ln}")
            check(ln["startMs"] >= prev_end, f"lyric overlap/order in {sid} at {ln['startMs']}")
            check(isinstance(ln["text"], str), f"lyric text not string in {sid}")
            prev_end = ln["endMs"]

    # Summary
    n_lyrics = len(lyrics)
    new_rel = sum(1 for a in albums.values() if a["releaseDate"] > "2026-09-01")
    types = Counter(a["type"] for a in albums.values())
    tracks_per_type = defaultdict(list)
    for a in albums.values():
        tracks_per_type[a["type"]].append(len(a["trackIds"]))
    media_bytes = sum(p.stat().st_size for p in ART.glob("*.webp")) + sum(p.stat().st_size for p in AUDIO.glob("*.m4a"))
    durs = [s["durationMs"] for s in songs.values()]
    print("== Catalog summary ==")
    print(f"genres {len(genres)}, artists {len(artists)}, albums {len(albums)} "
          f"({types['album']} albums / {types['ep']} EPs / {types['single']} singles), songs {len(songs)}, "
          f"playlists {len(playlists)}, stations {len(stations)}")
    print(f"songs with lyrics {n_lyrics} ({100.0 * n_lyrics / len(songs):.0f}%), explicit albums "
          f"{sum(1 for a in albums.values() if a['isExplicit'])}, albums released after 2026-09-01: {new_rel}")
    print(f"song durations {min(durs) / 1000:.1f}s-{max(durs) / 1000:.1f}s, "
          f"total audio {sum(durs) / 3.6e6:.2f} h, media size {media_bytes / 1e6:.1f} MB")
    print(f"artwork files {len(list(ART.glob('*.webp')))}, audio files {len(list(AUDIO.glob('*.m4a')))}")
    if errors:
        print(f"\n{len(errors)} problem(s):")
        for e in errors[:60]:
            print("  -", e)
        sys.exit(1)
    print("\nALL CHECKS PASSED")


if __name__ == "__main__":
    main()
