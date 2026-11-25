#!/usr/bin/env python3
"""Vybe content catalog generator.

Everything here is ORIGINAL and generated: invented artists, albums, songs,
lyrics, playlists, stations, abstract artwork and synthesized audio.

Usage (from the repo root):
    python3 scripts/generate_catalog.py

Writes:
    data/catalog.json            domain model (see packages/shared/src/index.ts)
    data/lyrics.json             { songId: LyricLine[] } for songs with hasLyrics
    data/media/art/*.webp        <id>.webp (1000px), <id>_400.webp, <id>_160.webp
    data/media/audio/*.m4a       AAC 96k stereo 44.1 kHz, +faststart

Test mode (optional environment variables):
    VYBE_LIMIT=N   render audio for the first N songs only
    VYBE_OUT=DIR   write catalog, lyrics and media under DIR instead of data/
"""
import os

os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")

import json
import math
import random
import subprocess
import sys
import time
import zlib
from datetime import date, timedelta
from multiprocessing import Pool
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(os.environ.get("VYBE_OUT", ROOT / "data"))
ART_DIR = OUT / "media" / "art"
AUDIO_DIR = OUT / "media" / "audio"
LIMIT = int(os.environ.get("VYBE_LIMIT", "0") or 0)

SEED = 20261125
SR = 44100
N_ART = 1000
WORKERS = 4
DEJAVU_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
DEJAVU_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
TARGET_RMS_DB = -15.5  # approximates -14 LUFS for this material (checked with ffmpeg volumedetect)

# ----------------------------------------------------------------------------
# Static, hand-written content
# ----------------------------------------------------------------------------

GENRES = [
    dict(id="pop", name="Pop", color="#ff3d7f", art=["#ff3d7f", "#ffd23f", "#ff8fb1", "#3b1d6e"],
         bpm=(100, 124), moods=["upbeat", "romantic", "energetic", "chill"], base_pop=74, style="pop",
         drums="pop", swing=False, bass="pluck", comp="pluck", comp_voice="pluck", lead="tri",
         pad="saw", seventh=False, lp=False, vinyl=False, instr="bright synth plucks and tight claps",
         feel="glossy hooks"),
    dict(id="hiphop", name="Hip-Hop", color="#ffb000", art=["#ffb000", "#1f1f1f", "#f25f5c", "#e8e1c9"],
         bpm=(82, 96), moods=["energetic", "dark", "upbeat", "chill"], base_pop=70, style="hiphop",
         drums="hiphop", swing=True, bass="808", comp="none", comp_voice="tri", lead="bell",
         pad="soft", seventh=True, lp=False, vinyl=False, instr="booming 808s and dusty sample-style keys",
         feel="head-nodding grooves"),
    dict(id="rnb", name="R&B", color="#9d4edd", art=["#9d4edd", "#f4a6c8", "#5a189a", "#ffd6a5"],
         bpm=(72, 92), moods=["romantic", "chill", "melancholy", "dreamy"], base_pop=66, style="rnb",
         drums="rnb", swing=True, bass="pluck", comp="rhodes", comp_voice="rhodes", lead="rhodes",
         pad="soft", seventh=True, lp=False, vinyl=False, instr="warm electric pianos and soft pads",
         feel="smooth, close-up grooves"),
    dict(id="electronic", name="Electronic", color="#00e5ff", art=["#00e5ff", "#ff00aa", "#0d0221", "#7cfc00"],
         bpm=(118, 130), moods=["energetic", "upbeat", "dark", "dreamy"], base_pop=62, style="electronic",
         drums="electronic", swing=False, bass="saw_off", comp="none", comp_voice="pluck", lead="saw_lead",
         pad="saw", seventh=False, lp=False, vinyl=False, instr="detuned saw pads and pulsing basslines",
         feel="four-on-the-floor momentum"),
    dict(id="rock", name="Rock", color="#e63946", art=["#e63946", "#f1faee", "#1d3557", "#a8dadc"],
         bpm=(110, 150), moods=["energetic", "dark", "upbeat", "melancholy"], base_pop=60, style="rock",
         drums="rock", swing=False, bass="pluck", comp="strum", comp_voice="fuzz", lead="fuzz",
         pad="soft", seventh=False, lp=False, vinyl=False, instr="overdriven guitar tones and big toms",
         feel="loud, direct choruses"),
    dict(id="indie", name="Indie", color="#2ec4b6", art=["#2ec4b6", "#f6bd60", "#f7ede2", "#84a59d"],
         bpm=(104, 128), moods=["chill", "upbeat", "melancholy", "romantic"], base_pop=58, style="indie",
         drums="indie", swing=False, bass="pluck", comp="strum", comp_voice="tri", lead="tri",
         pad="soft", seventh=False, lp=False, vinyl=False, instr="jangly guitars and bendy melodies",
         feel="homemade, bittersweet charm"),
    dict(id="jazz", name="Jazz", color="#f4a261", art=["#f4a261", "#e76f51", "#264653", "#f1faee"],
         bpm=(92, 140), moods=["chill", "romantic", "upbeat", "dreamy"], base_pop=45, style="jazz",
         drums="jazz", swing=True, bass="walk", comp="piano", comp_voice="piano", lead="piano",
         pad="soft", seventh=True, lp=False, vinyl=False, instr="upright bass lines and brushed drums",
         feel="loose, conversational phrasing"),
    dict(id="classical", name="Classical", color="#7b8cde", art=["#7b8cde", "#f3ede0", "#2b2d42", "#d8c3a5"],
         bpm=(66, 96), moods=["focus", "dreamy", "melancholy", "romantic"], base_pop=40, style="classical",
         drums=None, swing=False, bass="cello", comp="piano_arp", comp_voice="piano", lead="piano",
         pad="strings", seventh=False, lp=False, vinyl=False, instr="piano arpeggios and string swells",
         feel="chamber-sized arrangements"),
    dict(id="country", name="Country", color="#c77d2e", art=["#c77d2e", "#f6d58e", "#7f4f24", "#e9c46a"],
         bpm=(94, 122), moods=["upbeat", "romantic", "chill", "melancholy"], base_pop=60, style="country",
         drums="country", swing=False, bass="pluck", comp="strum", comp_voice="tri", lead="fiddle",
         pad="soft", seventh=False, lp=False, vinyl=False, instr="strummed acoustic guitars and fiddle-like leads",
         feel="front-porch storytelling"),
    dict(id="latin", name="Latin", color="#ff6b35", art=["#ff6b35", "#ffc857", "#e4572e", "#2a9d8f"],
         bpm=(92, 104), moods=["upbeat", "energetic", "romantic", "chill"], base_pop=70, style="latin",
         drums="latin", swing=False, bass="pluck", comp="pluck", comp_voice="pluck", lead="tri",
         pad="soft", seventh=False, lp=False, vinyl=False, instr="syncopated percussion and nylon-string plucks",
         feel="sunny, rhythmic movement"),
    dict(id="ambient", name="Ambient", color="#3a86ff", art=["#3a86ff", "#8ecae6", "#023047", "#cdb4db"],
         bpm=(66, 80), moods=["dreamy", "chill", "focus"], base_pop=35, style="ambient",
         drums=None, swing=False, bass="sine", comp="none", comp_voice="bell", lead="bell",
         pad="strings", seventh=False, lp=False, vinyl=False, instr="slow evolving pads and distant bells",
         feel="weightless, unhurried space"),
    dict(id="lofi", name="Lo-Fi", color="#8ac926", art=["#8ac926", "#ffca8a", "#6d597a", "#b5838d"],
         bpm=(76, 92), moods=["chill", "focus", "dreamy", "melancholy"], base_pop=50, style="lofi",
         drums="lofi", swing=True, bass="808", comp="rhodes", comp_voice="rhodes", lead="rhodes",
         pad="soft", seventh=True, lp=True, vinyl=True, instr="dusty drums, tape-warped keys and vinyl crackle",
         feel="study-room warmth"),
]
GENRE_BY_ID = {g["id"]: g for g in GENRES}
GENRE_IDS_EXPECTED = ["pop", "hiphop", "rnb", "electronic", "rock", "indie", "jazz", "classical",
                      "country", "latin", "ambient", "lofi"]
assert [g["id"] for g in GENRES] == GENRE_IDS_EXPECTED

# name, genres, origin (fictional)
ARTIST_SPECS = [
    ("Mira Solenne", ["pop", "rnb"], "Ardwick Vale, Velmark"),
    ("Kade Okonn", ["hiphop"], "Port Merrow, Kestria"),
    ("Juno Ashdown", ["indie"], "Lantern Cove, Aubrenne"),
    ("Vesper Lane", ["pop", "indie"], "Halvard, Norlund"),
    ("Sable & the Kites", ["indie", "rock"], "Quillmoor, Tessaria"),
    ("Tomas Velo", ["latin"], "Calvera Bay, Maronne"),
    ("Odessa Brink", ["rnb", "hiphop"], "Saltmere, Velmark"),
    ("Lio Marrow", ["electronic"], "Drevia Docks, Corvanda"),
    ("Neon Harbor Collective", ["electronic"], "Cael Harbor, Ostrand"),
    ("Idris Fenwick", ["jazz"], "Orrin Falls, Norlund"),
    ("Hanna Quill", ["jazz"], "Brenmoor, Aubrenne"),
    ("The Pale Meridians", ["rock"], "Dunmarrow, Ostrand"),
    ("Rook & Ember", ["rock", "country"], "Ash Flats, Kestria"),
    ("Ondine Vask", ["pop"], "Velmere, Halcyra"),
    ("Remy Holloway", ["country"], "Red Mesa Junction, Kestria"),
    ("June Calloway", ["country", "indie"], "Willow Ford, Velmark"),
    ("Pilar Acuna", ["latin"], "Sol Marrow, Maronne"),
    ("Dario Sendra", ["latin"], "Verrano Bay, Maronne"),
    ("Yara Mosca", ["latin", "rnb"], "Ilsara, Drevia"),
    ("Sora Yamada", ["ambient"], "Kiritown, Halcyra"),
    ("Hollow Oak Ensemble", ["ambient"], "Fennick Glade, Norlund"),
    ("Ines Halverson", ["classical"], "Ostermere, Ostrand"),
    ("Anton Vireo", ["classical", "ambient"], "Harrowmere, Corvanda"),
    ("The Clockwork Quartet", ["classical", "jazz"], "Brassmoor, Aubrenne"),
    ("Miso Parlor", ["lofi"], "Lantern Mews, Halcyra"),
    ("Penny Lamplight", ["lofi", "rnb"], "Maple Quay, Velmark"),
    ("Tide & Tallow", ["lofi"], "Gullhaven, Ostrand"),
    ("Oren Kestrel", ["hiphop"], "Stonebridge, Kestria"),
    ("Zuri Maren", ["hiphop"], "Ember Row, Norlund"),
    ("Bex Ottoline", ["electronic"], "Glasshaven, Halcyra"),
    ("Gaspard Lune", ["jazz"], "Pellmoor, Aubrenne"),
    ("Wren Abernathy", ["ambient", "lofi"], "Marrow Hills, Tessaria"),
]

LABELS = ["Vybe Originals", "Lantern Row Records", "Halcyon Tape Co.", "North Quill Music",
          "Driftwood Audio", "Paper Lantern Sound"]

CITIES = ["Saltmere", "Marrowgate", "Orrin Falls", "Cael Harbor", "Brenmoor", "Lumen Bay", "Dunmarrow",
          "Glasshaven", "Pellmoor", "Willow Ford", "Ember Row", "Kiritown", "Stonebridge", "Verrano Bay"]
ADJ = ["Velvet", "Silver", "Hollow", "Neon", "Paper", "Golden", "Quiet", "Distant", "Crooked", "Electric",
       "Amber", "Midnight", "Salt", "Glass", "Wild", "Pale", "Lucky", "Indigo", "Copper", "Gentle",
       "Broken", "Burning", "Slow", "Static", "Feral", "Honey", "Tidal", "Hushed", "Cobalt", "Ivory",
       "Restless", "Sunlit", "Ember", "Phantom", "Willow", "Atlas", "Ruby", "Scarlet", "Paradise", "Lilac"]
NOUN = ["Harbor", "Engine", "Orchard", "Satellite", "Parade", "Lighthouse", "Carousel", "Monsoon", "Compass",
        "Ferris", "Balcony", "Thunder", "Garden", "Mirror", "Signal", "Canyon", "Meadow", "Subway", "Rooftop",
        "Anchor", "Comet", "Driftwood", "Moonlight", "Gravity", "Horizon", "Pier", "Lantern", "Skyline",
        "Thistle", "Circuit", "Notebook", "Fable", "Overpass", "Riverbed", "Vinyl", "Pylon", "Cathedral",
        "Arcade", "Kingdom", "Postcard", "Lemonade", "Caravan", "Orbit"]
VING = ["Chasing", "Falling", "Dancing", "Drifting", "Waking", "Burning", "Spinning", "Holding", "Running",
        "Breaking", "Fading", "Rising", "Wandering", "Calling", "Leaving", "Dreaming", "Glowing", "Sinking",
        "Sailing", "Counting"]
VERBS = ["Holds", "Breaks", "Keeps", "Answers", "Returns", "Hums", "Turns", "Lingers"]
PLACE = ["Marlow", "Eastbrook", "Harrow Lane", "Calla Street", "Ashgrove", "Cinder Hill", "Pell Street",
         "Vesta Park", "Northfield", "Duskwater", "Lowell Court", "Tidewater"]
FIRST = ["Elin", "Marco", "Sefa", "Doran", "Liesl", "Kenta", "Ruth", "Piet", "Anouk", "Tobiah", "Imke", "Ravi"]
LAST = ["Varga", "Mollin", "Tessier", "Ardent", "Okafor-Lind", "Brandt", "Sorel", "Haddad", "Quintal",
        "Nakagawa", "Fenn", "Odegard"]
TRAITS = ["slow-burning hooks", "tactile drum programming", "cinematic string swells", "hazy analog warmth",
          "syncopated rhythms", "unhurried piano lines", "wide, open choruses", "close, intimate textures",
          "bright, restless grooves", "patient, layered arrangements"]
BIO_TEMPLATES = [
    "{name} started out sketching ideas in {city}, and the work has grown bolder every year. Known for {t1} and {t2}, the {genre} project has built a loyal following without ever sounding like anyone else.",
    "Raised around {fam}, {name} came to music late and then all at once. The sound is built on {t1}, with {t2} pulled forward in every arrangement.",
    "From {city} to a wider audience, {name} keeps a {genre} sensibility at heart. Expect {t1}, a touch of {t2}, and songs that feel like they were always there.",
]
FAMILIES = ["record collectors", "church choir singers", "night-shift dockworkers", "a houseful of pianists",
            "radio enthusiasts", "marching-band musicians", "poets and printers"]
NOTE_TEMPLATES = [
    "{title} is a {mood} record that moves between {genre} shapes and open, quiet space.",
    "Recorded over {n} sessions in {city}, it leans on {instr} and unhurried arrangements.",
    "Listen for the second half, where the arrangements loosen and the {genre} edges show.",
    "Built around one idea, it keeps returning to the same hook from a new angle.",
    "Sequenced for long evenings, it opens bright and lets the mood settle as it goes.",
]
MOOD_WORDS = {"chill": "easygoing", "upbeat": "bright", "melancholy": "wistful", "energetic": "high-voltage",
              "romantic": "tender", "dreamy": "hazy", "dark": "brooding", "focus": "steady"}

# Playlist specs: name, filter, order, size, curator, description, shortDescription
PLAYLISTS = [
    ("Pop Essentials", ("genre", "pop"), "pop", 25, "Vybe Pop", "The biggest pop songs we keep coming back to, from bright openers to late-night anthems.", "Bright hooks and big choruses."),
    ("Hip-Hop Essentials", ("genre", "hiphop"), "pop", 25, "Vybe Hip-Hop", "Heavy low end, sharp verses and beats that keep your head moving.", "Boom-bap and booming 808s."),
    ("R&B Essentials", ("genre", "rnb"), "pop", 25, "Vybe R&B", "Smooth grooves and close-up vocals for slow dances and quiet kitchens.", "Silky grooves, close-up moods."),
    ("Electronic Essentials", ("genre", "electronic"), "pop", 25, "Vybe Electronic", "Pulsing basslines, bright synths and floor-ready momentum.", "Synths built for the floor."),
    ("Rock Essentials", ("genre", "rock"), "pop", 25, "Vybe Rock", "Loud guitars, big drums and choruses you can shout along to.", "Guitars up front."),
    ("Indie Essentials", ("genre", "indie"), "pop", 25, "Vybe Indie", "Jangly guitars, honest lyrics and the small songs that grow on you.", "Homemade and heartfelt."),
    ("Jazz Essentials", ("genre", "jazz"), "pop", 25, "Vybe Jazz", "Brushed drums, walking basslines and piano that talks back.", "Loose and lively."),
    ("Classical Essentials", ("genre", "classical"), "pop", 25, "Vybe Classical", "Chamber-sized pieces with piano and strings, sized for real listening.", "Chamber music for every day."),
    ("Country Essentials", ("genre", "country"), "pop", 25, "Vybe Country", "Strummed guitars, fiddle melodies and stories from the back roads.", "Front-porch favorites."),
    ("Latin Essentials", ("genre", "latin"), "pop", 25, "Vybe Latin", "Syncopated percussion and sunny melodies from our Latin roster.", "Rhythm and sunshine."),
    ("Ambient Essentials", ("genre", "ambient"), "pop", 25, "Vybe Ambient", "Slow pads and distant bells for thinking, drifting and sleeping.", "Space to breathe."),
    ("Lo-Fi Essentials", ("genre", "lofi"), "pop", 25, "Vybe Lo-Fi", "Dusty drums, tape-warm keys and a little vinyl crackle.", "Study-room warmth."),
    ("Chill Mix", ("moods", ["chill"]), "shuffle", 30, "Vybe Mood", "Easy listening for slow afternoons and open windows.", "Easy, unhurried, warm."),
    ("Focus Flow", ("moods", ["focus"]), "shuffle", 32, "Vybe Mood", "Steady, instrumental tracks for long stretches of deep work.", "Quiet focus, no distractions."),
    ("Late Night Drive", ("moods", ["dark", "energetic"]), "shuffle", 28, "Vybe Mood", "Headlights, empty roads and songs that keep the engine humming.", "Empty roads, loud speakers."),
    ("Workout Fuel", ("moods", ["energetic", "upbeat"]), "shuffle", 30, "Vybe Mood", "Fast tempos and hard-hitting drums for the final set.", "Fast, hard, relentless."),
    ("Sunday Slow", ("moods", ["romantic", "chill", "melancholy"]), "shuffle", 24, "Vybe Mood", "A slow morning, a warm mug and a playlist that never rushes.", "No rush, all morning."),
    ("Morning Coffee", ("moods", ["chill", "upbeat"]), "shuffle", 22, "Vybe Mood", "Bright, gentle songs for the first hour of the day.", "Gentle start, bright finish."),
    ("Rainy Window", ("moods", ["melancholy", "dreamy"]), "shuffle", 26, "Vybe Mood", "Grey skies, a cup of tea and songs that sit with you.", "Grey skies, soft songs."),
    ("Golden Hour", ("moods", ["romantic", "upbeat"]), "shuffle", 24, "Vybe Mood", "Warm light and loose evenings, from the first drink to the last song.", "Warm light, loose evenings."),
    ("Heartache Diary", ("moods", ["melancholy", "romantic"]), "shuffle", 26, "Vybe Mood", "Songs for the parts of the story that hurt a little, and then a little less.", "Songs for slow heartbreak."),
    ("Dance Floor Heat", ("moods", ["energetic"]), "shuffle", 34, "Vybe Mood", "Four-on-the-floor, big drops and nothing that slows the room down.", "Keep the floor moving."),
    ("Road Trip Mix", ("moods", ["upbeat", "energetic"]), "shuffle", 36, "Vybe Mood", "Windows down, sunglasses on, and a playlist built for long highways.", "Windows down, volume up."),
    ("Party Starter", ("moods", ["upbeat"]), "shuffle", 30, "Vybe Mood", "Big openers, singalong choruses and the songs that get the first round going.", "The night starts here."),
    ("Vybe Today", None, "pop", 30, "Vybe Editorial", "The songs everyone is playing right now, sorted by how much they are moving.", "Today's biggest songs."),
    ("New Music Friday", None, "new", 25, "Vybe Editorial", "Every Friday, the freshest releases from across the catalog.", "The newest songs, fresh out."),
    ("A-List Pop", ("genre", "pop"), "pop", 20, "Vybe Pop", "Our most-loved pop tracks, picked by the team and the charts together.", "The best of pop, in order."),
    ("A-List Indie", ("genre", "indie"), "pop", 20, "Vybe Indie", "The indie songs we keep recommending to friends.", "The indie picks we swear by."),
    ("A-List Hip-Hop", ("genre", "hiphop"), "pop", 20, "Vybe Hip-Hop", "Verses, hooks and drums that hold up on repeat.", "Hip-hop we keep replaying."),
    ("A-List Electronic", ("genre", "electronic"), "pop", 20, "Vybe Electronic", "Club-ready records and wide, cinematic synth work.", "Electronic at full volume."),
    ("Fresh Finds Latin", ("genres", ["latin"]), "new", 18, "Vybe Latin", "New Latin releases with rhythms that move from the first bar.", "Newly added rhythms."),
    ("Sound of the Year", None, "pop", 40, "Vybe Editorial", "Forty tracks that defined the year on Vybe, in order of popularity.", "The songs that defined the year."),
    ("Vybe Discovery", ("genres", ["indie", "lofi", "rnb", "country"]), "shuffle", 30, "Vybe Editorial", "A mixed bag of songs that deserve a second listen.", "Songs worth a second listen."),
    ("Night Shift Jazz", ("genre", "jazz"), "shuffle", 24, "Vybe Jazz", "Late sets, warm piano and brushed drums for the small hours.", "Late sets and warm piano."),
    ("Velvet Hours", ("moods", ["romantic", "dreamy", "chill"]), "shuffle", 28, "Vybe Mood", "Soft lights and slow songs for the hours after dinner.", "Soft lights, slow songs."),
    ("Acoustic Afternoons", ("genres", ["country", "indie", "jazz"]), "shuffle", 26, "Vybe Editorial", "Strings, pianos and warm voices for an easy afternoon.", "Acoustic and easygoing."),
]
assert len(PLAYLISTS) == 36

# name, tagline, kind, seed (genre id / artist name / None), art genre
STATIONS = [
    ("Vybe 1", "Around-the-clock picks from the whole catalog", "live", None, "pop"),
    ("Vybe Hits", "The biggest songs right now, all day", "live", None, "pop"),
    ("Vybe Chill", "Gentle songs for every hour, all night", "live", None, "ambient"),
    ("Pop Rush", "Chart-friendly hooks, nonstop", "genre", "pop", "pop"),
    ("Hip-Hop Heat", "Head-nod beats and sharp verses", "genre", "hiphop", "hiphop"),
    ("Soul Lounge", "Smooth grooves for late evenings", "genre", "rnb", "rnb"),
    ("Circuit Dreams", "Four-on-the-floor from the dance floor", "genre", "electronic", "electronic"),
    ("Loud Floor", "Guitars up front, no apologies", "genre", "rock", "rock"),
    ("Smoke Room", "Late sets with warm piano and brushes", "genre", "jazz", "jazz"),
    ("Dust Road", "Front-porch songs and open highways", "genre", "country", "country"),
    ("Calle Sol", "Sunny rhythms from around the map", "genre", "latin", "latin"),
    ("Study Tape", "Dusty drums for your next chapter", "genre", "lofi", "lofi"),
    ("Mira Solenne Radio", "Endless picks inspired by Mira Solenne", "artist", "Mira Solenne", "pop"),
    ("Idris Fenwick Station", "Piano-led jazz from Idris Fenwick", "artist", "Idris Fenwick", "jazz"),
    ("Hollow Oak Radio", "Long, quiet songs from Hollow Oak Ensemble", "artist", "Hollow Oak Ensemble", "ambient"),
    ("Kade Okonn Station", "Hard-hitting hip-hop from Kade Okonn", "artist", "Kade Okonn", "hiphop"),
]
assert len(STATIONS) == 16

# Lyrics: original lines grouped by theme (8 themes, 32 lines each)
THEME_LINES = {
    "city": [
        "Neon hums across the bridge tonight",
        "Taxi lights are stitching up the rain",
        "Every window holds a different song",
        "Subway breath rolls up through the grate",
        "We counted towers from the fire escape",
        "The avenue keeps humming to itself",
        "Pavement shines like someone spilled a sky",
        "Downtown wakes up wearing borrowed light",
        "I know these streets by how they sound at three",
        "Crosswalk chimes are calling out my name",
        "Riverside, the cranes are standing guard",
        "A kiosk plays a song I half forgot",
        "We chased the bus through lanes of orange glow",
        "Rooftop radios trade static for a beat",
        "The city never sleeps, it only leans back",
        "Stairwell echoes carry every laugh",
        "Ferry horns drift past the glass towers",
        "Bike bells ring like small quick hearts",
        "Let the traffic write our story out loud",
        "Hold my hand where the concrete turns to gold",
        "Market lanterns swinging over tin",
        "Every block's a chorus waiting on its word",
        "We sold our daylight for a corner view",
        "Streetlamps blink like they're trying to confess",
        "The skyline leans in close to hear us talk",
        "Scooters hum a lullaby to the curb",
        "Late-night diner, coffee burning gold",
        "We wander where the metro lines run thin",
        "Balconies hang their laundry like flags",
        "Sirens fade and the saxophone takes over",
        "Our city is a mixtape with no end",
        "Glass doors open, spilling warm perfume",
        "Keep the lights on for the ones still out",
    ],
    "summer": [
        "Sun pours honey on the open road",
        "Barefoot on the boardwalk, sticky hands",
        "Ice cream drips on the warm stone steps",
        "We left the windows open to the breeze",
        "Radios on the porch, the screen door sings",
        "Salt in our hair and dust in every seam",
        "The lake was glass until we broke it wide",
        "Cicadas keep their tempo through the heat",
        "Golden afternoon is stretching slow",
        "Hammock swaying under the lemon trees",
        "Chasing fireflies down the orchard row",
        "Melted hours, nothing left to save",
        "We fell asleep on the warm hood of the car",
        "Every sunset borrows a little more",
        "Lemonade and laughter in the grass",
        "The coast road curls like a ribbon undone",
        "Sandals slapping on the dock at noon",
        "July forgets the calendar entirely",
        "Your sundress catches all the bright",
        "We danced until the streetlamps blinked on",
        "Cutoffs, sunburn, a radio in the bay",
        "Heat shimmer rises off the asphalt dreams",
        "Let the summer last a little longer",
        "Watermelon sweet, we grin like kids",
        "Wheat fields roll in long gold waves",
        "Sprinklers tick across the sleepy yard",
        "We count the stars from the cooling roof",
        "Pick the peaches, drop them in the sun",
        "Our footprints fade the moment water hits the sand",
        "Heat lightning stitches up the dusk",
        "Porch light, moths, and one more slow song",
        "The whole week tastes like cherry and salt",
        "Long light, long grass, long way home",
    ],
    "heartbreak": [
        "Your coffee cup still sits beside the sink",
        "I keep the good parts and I burn the rest",
        "We said forever like it was a small thing",
        "Your jacket hangs on a hook that's not mine",
        "Every song I hear is one you didn't write",
        "I learned to sleep on my side of the cold",
        "The text is still unsent, the drafts still stacked",
        "You left the hallway light on for no one",
        "I rehearse the goodbye in the mirror's glass",
        "We were a lovely mistake we kept repeating",
        "The silence fits you better than your name",
        "Between the lines I kept on reading you",
        "Your handwriting still lives on the fridge door",
        "I tried to hate you, but the ache was kind",
        "Ghosts in the kitchen humming half a tune",
        "We folded up our summer like a map",
        "Broken clocks keep running on your time",
        "Tell me the reasons I already know",
        "I'm learning how to breathe in smaller rooms",
        "Your name is a bruise I keep pressing",
        "Back door open, the rain walks in alone",
        "I kept your voice on a voicemail for a year",
        "The bed is wide and I still take the edge",
        "Ask the moon, she saw the whole thing fall",
        "We were brave until we weren't anymore",
        "Your side of the closet, empty and humming",
        "I owe the mirror an apology too",
        "Stitch the hem of me, I'm coming undone",
        "You were the question I stopped asking",
        "Let the old songs play and let them hurt",
        "Some nights I'm fine, some nights the old ache wins",
        "I'm the last light left on in the house",
    ],
    "ambition": [
        "Sharpen every doubt into a plan",
        "They said the top was crowded, so I climbed",
        "Scribble the dream on the back of a receipt",
        "Hunger is a map I read by heart",
        "Pull the blinds, start the engine, go",
        "Built a ladder out of every no",
        "Show me the window and I'll break the glass",
        "Tomorrow's already waiting by the door",
        "Counting steps until the sky gives way",
        "Nobody hands you the keys, you take them",
        "Every late night is a down payment on the morning",
        "Gold in my teeth and fire in my chest",
        "Write the names that doubted, then forget them",
        "Louder than the room, I still make space",
        "Let the engines roar and let the crowd decide",
        "Rise up from the basement with a crown of wire",
        "I'm stacking bricks of who I'm going to be",
        "Fingers on the sketchbook, ink on every page",
        "You can call it reckless, I call it timing",
        "Eyes on the summit, feet on the broken stairs",
        "Ten thousand drafts before the one that shines",
        "Carry the fire, don't let the wind decide",
        "Ambition is a shadow with a plan",
        "Who's going to tell me no while I'm still moving?",
        "The horizon's just a door I haven't opened",
        "Sign the contract with my own two hands",
        "Trade the sleep for something I can keep",
        "Every rejection is a rehearsal for the yes",
        "Blueprints on the floor and dust on the ledge",
        "Set the clock an hour early, make the call",
        "Shine like you already own the room",
        "Walk in like the lights were built for you",
    ],
    "dreams": [
        "Drift into the color the night leaves behind",
        "Floating over rooftops made of paper stars",
        "A silver whale swims through the afterglow",
        "Some doors open only when you're asleep",
        "The garden grows in reverse, from sky to soil",
        "Time folds like a letter, soft at the edges",
        "I dreamed the ocean kept its own clock",
        "Clouds came down to rest on our shoulders",
        "Lanterns float above the sleeping town",
        "Every star I wished on wrote a note back",
        "The melody arrives before the words do",
        "We walked through the wallpaper into May",
        "A staircase made of music rises up",
        "Let the colors melt and find their shape",
        "Silver moths learn how to speak in light",
        "Blue hours hum a song no one has heard",
        "I was a fox, I was a flame, I was the tide",
        "The sky is a pool, let's dive in slow",
        "Mirrors hold the rooms we never built",
        "Carry the glow in your hands like a seed",
        "The lighthouse keeper sings to passing dreams",
        "Gravity forgot us on the stairs of cloud",
        "Hush now, the constellations are rearranging",
        "Under the velvet hush of the other side",
        "Pale gardens bloom in the corner of my eye",
        "Ghost trains whistle softly through the fog",
        "A key that opens every sleeping house",
        "Paint the ceiling with the shape of waves",
        "Half awake, the world tastes like honey",
        "We rode the comet to the edge of morning",
        "Dissolve the edges, let the outline go",
        "Soft static, a radio in a sea of stars",
    ],
    "night": [
        "Streetlights hum a lullaby to the empty road",
        "Midnight pools in every open window",
        "The moon hangs low like an old lantern",
        "Headlights sweep the ceiling, slow and gold",
        "Three a.m. and every thought is loud",
        "Shadows stretch like cats across the floor",
        "Bass drum heartbeat through the cellar wall",
        "Dark water lapping at the dock's old wood",
        "The city burns in quiet, cold blue neon",
        "Let the night go on and on and on",
        "Turn the volume up and close the curtains",
        "We're wide awake in the hour nobody claims",
        "Stars are scattered like spilled sugar tonight",
        "Pulse of the club rolls down the alley",
        "Keep the windows down and the rearview dark",
        "Lamp by the couch, a book I never finish",
        "Whisper it low, the house is listening",
        "Neon fingerprints on the window glass",
        "Hold my wrist and count the streetlight beats",
        "Dim the room, the record starts to hiss",
        "Every corner hides a secret song",
        "The dark is kind to those who stay up late",
        "Velvet hours, velvet smoke, velvet skin",
        "We drive without a destination in the dark",
        "Bruised purple sky above the rooftop bar",
        "Candles drip their wax in slow bright tears",
        "Nothing matters till the sun comes back",
        "I see the sunrise in the corner of my eye",
        "Our shadows dance beneath the broken sign",
        "Turn it up until the bones begin to hum",
        "Midnight taxi, one more bridge to cross",
        "The night air tastes of rain and copper coins",
    ],
    "rain": [
        "Rain taps out a rhythm on the tin roof",
        "Puddles hold the sky like broken glass",
        "Umbrellas bloom like flowers on the street",
        "Drizzle on the windshield, wipers keeping time",
        "Grey clouds carry all the things we said",
        "The gutter sings a song about the storm",
        "Thunder rolls across the valley floor",
        "Window fogged, I draw your name in steam",
        "Rain on the awning, coffee going cold",
        "Water knocks at every closed-up door",
        "Let it pour, I've got nowhere to be",
        "Drops race each other down the glass",
        "The sky is crying softly on the bay",
        "Soaked to the bone and laughing at the sky",
        "Puddle reflections wobble, then they're gone",
        "The storm arrives like an old friend knocking",
        "Thunder in the distance, a slow drum",
        "Sweater sleeves pulled over my hands",
        "Grey morning light sneaks through the blinds",
        "Rainwater runs in silver through the grate",
        "We listened to the weather through the wall",
        "Mist rolls up the hills and fills the streets",
        "Every raindrop keeps a little of the sea",
        "Under the awning, we're the only dry things here",
        "Slow rain on the bridge, your hand in mine",
        "The lamp is on, the storm can knock all night",
        "Cold glass, warm tea, the rhythm of the rain",
        "Sky spills open on the sleeping park",
        "Dripping eaves and a cat that's finally quiet",
        "Clouds hang low and hum like old machines",
        "Rain washes the chalk off the sidewalk",
        "Wind pushes the drizzle sideways, soft",
    ],
    "home": [
        "Kettle whistles in the quiet kitchen",
        "Old couch, new blanket, the same old view",
        "Porch light flickers, come on inside",
        "Mom's recipe on a stained index card",
        "Hallway floorboards know my footsteps well",
        "Front door key still hangs by the hook",
        "We painted every wall a different hue",
        "Family photos crooked on the stairs",
        "Dinner's on the table, let's eat slow",
        "Shoes by the entrance, sweaters on the chair",
        "Fireplace crackle and a cup of something sweet",
        "Garden gate creaks like it's saying hi",
        "Home is wherever you leave the light on",
        "Wooden table scarred with years of tea",
        "Window seat, a book, a sleepy cat",
        "Coming back to where the rooms still breathe",
        "Laundry humming in the back room",
        "The radio's on low, the house is warm",
        "Blankets folded like a map of rest",
        "Three steps down and the lamp's still on",
        "Kitchen light spilling out to the lawn",
        "Every corner smells like cinnamon and rain",
        "We hung the clock that never kept good time",
        "Stay a little longer, the coffee's warm",
        "Back porch swing creaks out a lullaby",
        "The small house holds the biggest things",
        "Keys in the bowl and boots in the hall",
        "Slippers by the bed and the dog asleep",
        "Patchwork quilt that's seen a thousand nights",
        "Every crack in the ceiling has a story",
        "Our names are carved into the doorframe still",
        "Come on home, the table's set for two",
    ],
}
HOOKS = {
    "city": [
        ["Take me downtown where the lights won't sleep", "Every window shines a different dream",
         "Hold on tight, we're riding the midnight train", "Sing it loud, the city's ours tonight"],
        ["Concrete glow and a heartbeat in the street", "Dance with me 'til morning finds our feet",
         "Neon rivers running through the bones", "Bring the whole block home"],
    ],
    "summer": [
        ["Golden days and the radio up high", "Summer wraps us up and sends us out",
         "Hold the sunlight, let the heat unwind", "Nothing lasts, so we dance it out"],
        ["Barefoot in the wheat, we're running free", "Sunburn kisses, lemon-sky goodbyes",
         "Catch the wave and let it carry you", "Summer, summer, don't say goodbye"],
    ],
    "heartbreak": [
        ["I keep your letters folded in my chest", "Every promise that you never kept",
         "Turn the light off, let the quiet in", "Let me go, let me forget"],
        ["Empty chair and a cup gone cold", "Your name still hangs above the door",
         "I'll tell the story like I'm stronger now", "But I'm still counting, still counting more"],
    ],
    "ambition": [
        ["Climb until the ceiling breaks apart", "Every scar's a rung beneath my feet",
         "Give me the fire, give me the stage", "I'm writing my name across the morning sky"],
        ["Cross the line and never look behind", "Build a kingdom out of breathless nights",
         "Hands on the wheel and eyes on the sun", "Nothing's too high, nothing's too far"],
    ],
    "dreams": [
        ["Drift with me to the silver sea", "Where the stars are sleeping in the trees",
         "Close your eyes and let the light come in", "We're floating somewhere in between"],
        ["Lantern hearts and paper wings", "Dreaming louder than the world can sing",
         "Fall up into the velvet blue", "I'll meet you where the dreamers go"],
    ],
    "night": [
        ["Turn it up and let the midnight glow", "Bass line pulsing through the floor",
         "Hands up high in the dark we shine", "Every star is watching, one more time"],
        ["Velvet sky and the city hum", "Keep the engine running, let it come",
         "Don't say goodnight, the night's still young", "We're brightest when the sun is gone"],
    ],
    "rain": [
        ["Rain keeps falling on the window pane", "Washing out the color from the street",
         "Stand with me beneath the broken sky", "Let the rain come, let it wash us clean"],
        ["Storm clouds rolling, drum and sigh", "Hold my hand and don't let go",
         "Puddles shining like a silver map", "Lead me home through the grey and gold"],
    ],
    "home": [
        ["Come on home, the light is on", "Shoes at the door and the kettle humming",
         "Every room is holding us tonight", "This is where the heart keeps coming home"],
        ["Hang the lanterns, leave the door ajar", "Warm bread and a melody we know",
         "Ten years of this, a thousand little things", "Home is the sound of the kitchen hum"],
    ],
}
MOOD_THEMES = {
    "chill": ["summer", "home", "rain"],
    "upbeat": ["summer", "city", "ambition"],
    "melancholy": ["heartbreak", "rain", "home"],
    "energetic": ["ambition", "city", "night"],
    "romantic": ["summer", "home", "heartbreak"],
    "dreamy": ["dreams", "night", "rain"],
    "dark": ["night", "heartbreak", "city"],
    "focus": [],
}
MODE_BY_MOOD = {
    "chill": ["dorian", "major"], "upbeat": ["major", "mixolydian"], "melancholy": ["minor", "dorian"],
    "energetic": ["mixolydian", "major"], "romantic": ["major", "lydian"], "dreamy": ["lydian", "dorian"],
    "dark": ["minor"], "focus": ["major"],
}
SCALES = {
    "major": [0, 2, 4, 5, 7, 9, 11], "minor": [0, 2, 3, 5, 7, 8, 10], "dorian": [0, 2, 3, 5, 7, 9, 10],
    "mixolydian": [0, 2, 4, 5, 7, 9, 10], "lydian": [0, 2, 4, 6, 7, 9, 11],
}
PROGRESSIONS = [[0, 4, 5, 3], [0, 5, 3, 4], [5, 3, 0, 4], [0, 3, 4, 4], [5, 4, 3, 4], [0, 5, 1, 4],
                [0, 2, 3, 1], [0, 6, 5, 4], [3, 0, 4, 5], [0, 4, 1, 5]]
RHYTHMS = [[1, 1, 0.5, 0.5, 1, 2, 1, 1], [0.5, 0.5, 1, 1, 1.5, 0.5, 1, 2], [2, 1, 1, 2, 2],
           [1.5, 0.5, 1, 1, 2, 2], [1, 0.5, 0.5, 1, 1, 1, 1, 2]]
DRUM_PATTERNS = {
    "pop": {"kick": [0, 8, 10], "snare": [4, 12], "hat": [0, 2, 4, 6, 8, 10, 12, 14], "crash": [0]},
    "indie": {"kick": [0, 8], "snare": [4, 12], "hat": [2, 6, 10, 14], "crash": [0]},
    "rock": {"kick": [0, 8, 10], "snare": [4, 12], "hat": [0, 2, 4, 6, 8, 10, 12, 14], "crash": [0]},
    "country": {"kick": [0, 10], "snare": [4, 12], "hat": [0, 4, 8, 12]},
    "latin": {"kick": [0, 6, 10], "rim": [3, 6, 10, 12], "hat": [0, 2, 4, 6, 8, 10, 12, 14]},
    "electronic": {"kick": [0, 4, 8, 12], "clap": [4, 12], "hat": [2, 6, 10, 14], "crash": [0]},
    "hiphop": {"kick": [0, 7, 10], "snare": [4, 12], "ghost": [15], "hat": [0, 2, 4, 6, 8, 10, 12, 14]},
    "rnb": {"kick": [0, 7, 11], "snare": [4, 12], "hat": [0, 2, 4, 6, 8, 10, 12, 14]},
    "lofi": {"kick": [0, 8, 11], "snare": [4, 12], "ghost": [7, 15], "hat": [0, 2, 4, 6, 8, 10, 12, 14]},
    "jazz": {"ride": [0, 6, 8, 14], "brush": [4, 12], "kick": [0]},
}
ELEM = {  # element -> (sample name, base velocity)
    "kick": ("kick", 0.9), "snare": ("snare", 0.5), "ghost": ("snare", 0.2), "brush": ("snare", 0.22),
    "hat": ("hat", 0.2), "clap": ("clap", 0.35), "rim": ("rim", 0.35), "crash": ("crash", 0.22),
    "ride": ("ride", 0.2),
}
VOICE_LEVEL = {"tri": 0.55, "saw_lead": 0.4, "fuzz": 0.4, "piano": 0.6, "rhodes": 0.5, "bell": 0.5,
               "pluck": 0.6, "fiddle": 0.5, "808": 0.9, "saw_off": 0.5, "cello": 0.5, "sine": 0.7}
# Lyric timing and instrumental sections use these:
SECTION_LEVELS = {  # pad gain, drum level, lead probability per 2-bar unit
    "intro": (0.5, 0.0, 0.35), "verse": (0.6, 0.7, 0.5), "chorus": (0.75, 1.0, 1.0),
    "bridge": (0.6, 0.5, 0.7), "outro": (0.5, 0.4, 0.4),
}


# ----------------------------------------------------------------------------
# Small helpers
# ----------------------------------------------------------------------------

def hex2rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def rgb2hex(c):
    return "#%02x%02x%02x" % tuple(int(max(0, min(255, round(v)))) for v in c)


def lum(c):
    def ch(v):
        v = v / 255.0
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(x) for x in c)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def mix_rgb(a, b, t):
    return tuple(a[i] * (1 - t) + b[i] * t for i in range(3))


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12.0)


def spitch(scale, i):
    return scale[i % 7] + 12 * (i // 7)


def iso(d):
    return d.isoformat()


def rand_date(rng, a, b):
    span = (b - a).days
    return a + timedelta(days=rng.randrange(span + 1))


def unique_title(rng, used):
    for _ in range(1000):
        r = rng.random()
        if r < 0.3:
            t = f"{rng.choice(ADJ)} {rng.choice(NOUN)}"
        elif r < 0.44:
            t = f"{rng.choice(NOUN)} of {rng.choice(NOUN)}"
        elif r < 0.58:
            t = f"{rng.choice(VING)} {rng.choice(NOUN)}"
        elif r < 0.70:
            t = f"The {rng.choice(NOUN)} {rng.choice(VERBS)}"
        elif r < 0.82:
            t = f"{rng.choice(NOUN)} in {rng.choice(PLACE)}"
        elif r < 0.90:
            t = f"Still {rng.choice(ADJ)}"
        else:
            t = f"{rng.choice(ADJ)} {rng.choice(NOUN)} {rng.choice(NOUN)}"
        if t not in used:
            used.add(t)
            return t
    raise RuntimeError("title pool exhausted")


def make_bio(rng, name, genre_names):
    tpl = rng.choice(BIO_TEMPLATES)
    t1, t2 = rng.sample(TRAITS, 2)
    return tpl.format(name=name, city=rng.choice(CITIES), t1=t1, t2=t2, fam=rng.choice(FAMILIES),
                      genre=" / ".join(g.lower() for g in genre_names))


def album_note(rng, title, genre_name, mood, city):
    s = [rng.choice(NOTE_TEMPLATES).format(title=title, mood=MOOD_WORDS[mood], genre=genre_name.lower(),
                                           n=rng.randint(2, 6), city=city,
                                           instr=rng.choice(["piano and tape hiss", "bright synths",
                                                             "brushed drums and bass", "acoustic guitar",
                                                             "warm analog keys", "string swells"]))]
    s.append(rng.choice(NOTE_TEMPLATES[1:]).format(title=title, mood=MOOD_WORDS[mood], genre=genre_name.lower(),
                                                   n=rng.randint(2, 6), city=city, instr="layered textures"))
    return " ".join(s[:2])


def random_parts(rng, nbars):
    parts, rem = [], nbars
    while rem > 0:
        p = 2 if (rem >= 2 and rng.random() < 0.55) else 1
        parts.append(p)
        rem -= p
    return parts


def song_lyrics(rng, sections, bpm, mood):
    """Return LyricLine dicts covering the whole song, or None when no lyrics."""
    themes = MOOD_THEMES[mood]
    if not themes:
        return None
    bar_ms = 240000.0 / bpm
    pool = [line for th in themes for line in THEME_LINES[th]]
    rng.shuffle(pool)
    ptr = [0]
    hook = rng.choice(HOOKS[rng.choice(themes)])

    def take(k):
        out = []
        for _ in range(k):
            out.append(pool[ptr[0] % len(pool)])
            ptr[0] += 1
        return out

    lines = []

    def emit(start_bar, parts, texts):
        b = start_bar
        for p, tx in zip(parts, texts):
            lines.append({"startMs": round(b * bar_ms), "endMs": round((b + p) * bar_ms), "text": tx})
            b += p

    def gap(start_bar, nb):
        lines.append({"startMs": round(start_bar * bar_ms), "endMs": round((start_bar + nb) * bar_ms), "text": ""})

    bar = 0
    for name, nb in sections:
        if name in ("intro", "outro"):
            gap(bar, nb)
        elif name == "verse":
            parts = random_parts(rng, nb)
            emit(bar, parts, take(len(parts)))
        elif name == "chorus":
            parts = [2] * (nb // 2)
            emit(bar, parts, [hook[k % len(hook)] for k in range(len(parts))])
        elif name == "bridge":
            if nb >= 8:
                gap(bar, 4)
                parts = random_parts(rng, nb - 4)
                emit(bar + 4, parts, take(len(parts)))
            else:
                parts = random_parts(rng, nb)
                emit(bar, parts, take(len(parts)))
        bar += nb
    return lines


# ----------------------------------------------------------------------------
# Artwork
# ----------------------------------------------------------------------------

def rgba(c, a=255):
    return (int(c[0]), int(c[1]), int(c[2]), int(a))


def layer_draw(img, fn, blur=0):
    lay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    fn(ImageDraw.Draw(lay))
    if blur:
        lay = lay.filter(ImageFilter.GaussianBlur(blur))
    return Image.alpha_composite(img, lay)


def st_electronic(img, rng, c):
    vx, vy = N_ART * 0.5, N_ART * 0.52

    def draw(d):
        for i in range(-14, 15):
            x = N_ART * 0.5 + i * N_ART * 0.09
            d.line([(vx, vy), (x, N_ART)], fill=rgba(c[1], 230), width=3)
        for k in range(1, 14):
            y = vy + (N_ART - vy) * (k / 13.0) ** 2
            d.line([(0, y), (N_ART, y)], fill=rgba(c[2], 200), width=2)
        d.ellipse([vx - 230, vy - 420, vx + 230, vy + 40], fill=rgba(c[0], 235))

    img = layer_draw(img, draw, blur=9)
    return layer_draw(img, draw, blur=0)


def st_jazz(img, rng, c):
    ink = (16, 16, 16)
    img = Image.new("RGBA", img.size, rgba(c[0]))
    j = lambda v: v + rng.uniform(-30, 30)

    def draw(d):
        d.ellipse([j(120), j(170), j(120) + 620, j(170) + 620], fill=rgba(c[1]))
        d.polygon([(j(560), 950), (j(950), 330), (j(950), 950)], fill=rgba(c[2]))
        d.rectangle([j(80), j(700), j(420), j(920)], fill=rgba(c[3]))
        d.pieslice([450, 40, 980, 570], start=180, end=360, fill=rgba(ink))
        d.line([(0, 820), (N_ART, 620)], fill=rgba(ink), width=12)

    return layer_draw(img, draw)


def st_ambient(img, rng, c):
    def draw(d):
        for _ in range(7):
            x, y = rng.uniform(0, N_ART), rng.uniform(0, N_ART)
            r = rng.uniform(180, 420)
            d.ellipse([x - r, y - r, x + r, y + r], fill=rgba(c[rng.integers(len(c))], 110))

    return layer_draw(img, draw, blur=90)


def st_rock(img, rng, c):
    img = Image.alpha_composite(img, Image.new("RGBA", img.size, (12, 10, 10, 130)))

    def bars(d):
        for k in range(-6, 12):
            x0 = k * N_ART / 7.0 + rng.uniform(-40, 40)
            d.polygon([(x0, 0), (x0 + 70, 0), (x0 + 70 + N_ART * 0.6, N_ART), (x0 + N_ART * 0.6, N_ART)],
                      fill=rgba(c[1], 200 if k % 2 else 110))

    img = layer_draw(img, bars)

    def dots(d):
        step = 26
        for y in range(0, N_ART, step):
            for x in range(0, N_ART, step):
                r = 3 + 9 * ((x + y) / (2.0 * N_ART))
                d.ellipse([x - r, y - r, x + r, y + r], fill=rgba(c[2], 170))

    return layer_draw(img, dots)


def st_pop(img, rng, c):
    def draw(d):
        d.ellipse([N_ART * 0.15, N_ART * 0.2, N_ART * 0.85, N_ART * 0.9], fill=rgba(c[1]))
        d.pieslice([-N_ART * 0.2, N_ART * 0.55, N_ART * 0.6, N_ART * 1.35], start=180, end=360,
                   fill=rgba(c[2]))
        d.rectangle([N_ART * 0.72, 0, N_ART * 0.82, N_ART], fill=rgba(c[3], 230))

    return layer_draw(img, draw)


def st_hiphop(img, rng, c):
    cx, cy = N_ART * rng.uniform(0.3, 0.7), N_ART * rng.uniform(0.3, 0.7)

    def draw(d):
        for i in range(12, 0, -1):
            r = i * N_ART / 26.0
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=rgba(c[1] if i % 2 else c[2], 230))
        for j in range(7):
            h = N_ART * rng.uniform(0.2, 0.7)
            x = N_ART * 0.1 + j * N_ART * 0.12
            d.rectangle([x, N_ART - h, x + N_ART * 0.07, N_ART], fill=rgba(c[3], 235))

    return layer_draw(img, draw)


def st_rnb(img, rng, c):
    def draw(d):
        for _ in range(5):
            r = N_ART * rng.uniform(0.25, 0.55)
            x, y = N_ART * rng.uniform(0.2, 0.8), N_ART * rng.uniform(0.2, 0.8)
            d.ellipse([x - r, y - r, x + r, y + r], outline=rgba(c[2], 190), width=8)

    return layer_draw(img, draw, blur=2)


def st_indie(img, rng, c):
    def draw(d):
        for k in range(7):
            cx, cy = rng.uniform(0, N_ART), rng.uniform(0, N_ART)
            w, h = rng.uniform(200, 520), rng.uniform(160, 380)
            a = rng.uniform(0, math.pi)
            pts = []
            for dx, dy in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2)):
                pts.append((cx + dx * math.cos(a) - dy * math.sin(a), cy + dx * math.sin(a) + dy * math.cos(a)))
            d.polygon(pts, fill=rgba(c[k % len(c)], 225))

    return layer_draw(img, draw)


def st_classical(img, rng, c):
    base = Image.new("RGBA", img.size, rgba((244, 238, 225)))

    def draw(d):
        cx, cy = N_ART * 0.62, N_ART * 0.42
        for r in range(40, 900, 60):
            d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=rgba(c[1], 200), width=3)
        for y in range(120, N_ART, 70):
            d.line([(0, y), (N_ART, y)], fill=rgba((40, 40, 50), 150), width=2)
        d.ellipse([cx - 70, cy - 70, cx + 70, cy + 70], fill=rgba(c[0]))

    return layer_draw(base, draw)


def st_country(img, rng, c):
    phase = rng.uniform(0, 6.28)

    def draw(d):
        hy = N_ART * 0.62
        d.ellipse([N_ART * 0.3, hy - N_ART * 0.22, N_ART * 0.7, hy + N_ART * 0.18], fill=rgba(c[2], 245))
        pts = [(0, N_ART)]
        for x in range(0, N_ART + 1, 10):
            pts.append((x, hy + 40 * math.sin(x / N_ART * math.pi * 2.2 + phase)))
        pts.append((N_ART, N_ART))
        d.polygon(pts, fill=rgba(c[3]))

    return layer_draw(img, draw)


def st_latin(img, rng, c):
    def draw(d):
        cx, cy, R = N_ART * 0.5, N_ART * 0.42, N_ART * 0.3
        for k in range(24):
            a0 = k * 2 * math.pi / 24
            a1 = a0 + math.pi / 24
            d.polygon([(cx, cy), (cx + 1800 * math.cos(a0), cy + 1800 * math.sin(a0)),
                       (cx + 1800 * math.cos(a1), cy + 1800 * math.sin(a1))], fill=rgba(c[1], 110))
        d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=rgba(c[2], 250))
        for w in range(5):
            y0 = N_ART * 0.66 + w * N_ART * 0.06
            pts = [(x, y0 + N_ART * 0.03 * math.sin(x / N_ART * 2 * math.pi * 1.5 + w)) for x in range(0, N_ART + 1, 8)]
            pts += [(N_ART, N_ART), (0, N_ART)]
            d.polygon(pts, fill=rgba(c[(w % 2) + 1], 170))

    return layer_draw(img, draw)


def st_lofi(img, rng, c):
    def draw(d):
        s = N_ART / 4.0
        for i in range(4):
            for j in range(4):
                if rng.random() < 0.55:
                    col = c[rng.integers(len(c))]
                    d.rectangle([i * s + 8, j * s + 8, (i + 1) * s - 8, (j + 1) * s - 8], fill=rgba(col, 200))
        d.rectangle([N_ART * 0.58, N_ART * 0.12, N_ART * 0.9, N_ART * 0.5], outline=rgba((30, 30, 30), 220), width=10)
        d.line([(N_ART * 0.74, N_ART * 0.12), (N_ART * 0.74, N_ART * 0.5)], fill=rgba((30, 30, 30), 220), width=8)
        d.line([(N_ART * 0.58, N_ART * 0.31), (N_ART * 0.9, N_ART * 0.31)], fill=rgba((30, 30, 30), 220), width=8)

    return layer_draw(img, draw, blur=1)


STYLE_FN = {"pop": st_pop, "hiphop": st_hiphop, "rnb": st_rnb, "electronic": st_electronic, "rock": st_rock,
            "indie": st_indie, "jazz": st_jazz, "classical": st_classical, "country": st_country,
            "latin": st_latin, "ambient": st_ambient, "lofi": st_lofi}


def palette_info(img):
    small = img.convert("RGB").resize((200, 200), Image.BILINEAR)
    q = small.quantize(colors=8, method=Image.Quantize.MEDIANCUT)
    pal = q.getpalette()
    counts = sorted(q.getcolors(), reverse=True)

    def col(idx):
        return tuple(pal[idx * 3: idx * 3 + 3])

    bg = col(counts[0][1])
    cands = [col(i) for _, i in counts[1:]]
    cands.sort(key=lambda c: -max(c) + min(c))  # most saturated first
    accent = cands[0] if cands else ((255, 255, 255) if lum(bg) < 0.18 else (0, 0, 0))
    ref = (255, 255, 255) if lum(bg) < 0.18 else (0, 0, 0)
    for _ in range(80):  # aim slightly above 4.5 so rounding to hex still passes
        if contrast(accent, bg) >= 4.6:
            break
        accent = mix_rgb(accent, ref, 0.08)
    t1 = (255, 255, 255) if contrast((255, 255, 255), bg) >= contrast((0, 0, 0), bg) else (0, 0, 0)
    t2 = mix_rgb(t1, bg, 0.64)  # 64% of the way toward bgColor
    return {"bgColor": rgb2hex(bg), "textColor1": rgb2hex(t1), "textColor2": rgb2hex(t2),
            "textColor3": rgb2hex(accent)}, t1


def wrap_text(d, text, font, max_w):
    words, lines, cur = text.split(), [], ""
    for w in words:
        test = (cur + " " + w).strip()
        if d.textlength(test, font=font) <= max_w or not cur:
            cur = test
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def draw_title(img, text, color, big=True):
    d = ImageDraw.Draw(img)
    sizes = range(150, 30, -6) if big else range(64, 28, -4)
    maxw = 860 if big else 880
    for size in sizes:
        font = ImageFont.truetype(DEJAVU_BOLD if big else DEJAVU_REG, size)
        lines = wrap_text(d, text, font, maxw)
        if len(lines) <= (4 if big else 2):
            break
    lh = int(size * 1.05)
    y = N_ART - 70 - lh * len(lines)
    if big:
        y = N_ART - 80 - lh * len(lines)
    for ln in lines:
        d.text((70, y), ln, font=font, fill=color)
        y += lh


def render_art(job):
    """Render one 1000px cover plus 400px and 160px variants. Returns (id, palette dict)."""
    img_id, kind, gid = job["id"], job["kind"], job["genre"]
    title = job.get("title")
    rng = np.random.default_rng([SEED, 77, zlib.crc32(img_id.encode())])
    g = GENRE_BY_ID[gid]
    cols = [hex2rgb(h) for h in g["art"]] + [(245, 245, 240), (18, 18, 22)]
    order = rng.permutation(len(g["art"]))
    c = [cols[i] for i in order] + [cols[4], cols[5]]
    c = [np.array(x, np.float32) for x in c]
    if kind == "classical":
        c = [np.array(x, np.float32) for x in [cols[0], cols[1], cols[2], cols[3]]] + c[4:]

    yy, xx = np.meshgrid(np.linspace(0, 1, N_ART, dtype=np.float32), np.linspace(0, 1, N_ART, dtype=np.float32),
                         indexing="ij")
    if kind == "artist":
        dist = np.sqrt((xx - 0.5) ** 2 + (yy - 0.4) ** 2) * 1.3
        t = np.clip(dist, 0, 1)[..., None]
        base = c[0] * (1 - t) + c[1] * t
    else:
        ang = rng.uniform(0, 2 * np.pi)
        t = np.clip((xx - 0.5) * np.cos(ang) + (yy - 0.5) * np.sin(ang) + 0.5, 0, 1)[..., None]
        base = c[0] * (1 - t) + c[1] * t
    for _ in range(int(rng.integers(3, 6))):
        cx, cy = rng.uniform(0, 1), rng.uniform(0, 1)
        r = rng.uniform(0.12, 0.4)
        a = rng.uniform(0.35, 0.8)
        w = (np.exp(-(((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * r * r))) * a)[..., None]
        base = base * (1 - w) + c[rng.integers(2, len(c))] * w
    img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).convert("RGBA")

    if kind == "artist":
        def sil(d):
            d.ellipse([N_ART * 0.36, N_ART * 0.2, N_ART * 0.64, N_ART * 0.5], fill=rgba(c[2], 235))
            d.ellipse([N_ART * 0.14, N_ART * 0.55, N_ART * 0.86, N_ART * 1.12], fill=rgba(c[2], 235))
            for k in range(4):
                r = N_ART * (0.5 + 0.09 * k)
                d.arc([N_ART * 0.5 - r, N_ART * 0.4 - r, N_ART * 0.5 + r, N_ART * 0.4 + r], 200, 340,
                      fill=rgba(c[3], 170), width=5)
        img = layer_draw(img, sil, blur=3)
    elif kind in ("playlist", "station"):
        def arcs(d):
            for k in range(6):
                r = N_ART * (0.3 + 0.12 * k)
                d.ellipse([N_ART * 0.78 - r, N_ART * 0.12 - r, N_ART * 0.78 + r, N_ART * 0.12 + r],
                          outline=rgba(c[2], 120), width=6)
        img = layer_draw(img, arcs)
    elif kind == "hero":
        img = STYLE_FN[g["style"]](img, rng, c)
        img = layer_draw(img, lambda d: d.rectangle([0, N_ART * 0.7, N_ART, N_ART], fill=rgba(c[0], 110)))
    else:
        img = STYLE_FN[g["style"]](img, rng, c)

    grain = rng.normal(0, 6.0, (N_ART, N_ART, 1)).astype(np.float32)
    arr = np.clip(np.asarray(img.convert("RGB"), np.float32) + grain, 0, 255).astype(np.uint8)
    img = Image.fromarray(arr).convert("RGBA")

    pal, text_col = palette_info(img)
    if kind in ("playlist", "station") and title:
        draw_title(img, title, text_col, big=True)
    elif kind == "album" and title and job.get("text"):
        draw_title(img, title, text_col, big=False)

    out = img.convert("RGB")
    out.save(ART_DIR / f"{img_id}.webp", "WEBP", quality=82)
    for s in (400, 160):
        out.resize((s, s), Image.LANCZOS).save(ART_DIR / f"{img_id}_{s}.webp", "WEBP", quality=82)
    return img_id, pal


# ----------------------------------------------------------------------------
# Audio synthesis
# ----------------------------------------------------------------------------

_DRUMS = {}


def drum_bank():
    if _DRUMS:
        return _DRUMS
    r = np.random.default_rng(SEED + 5)

    def tt(sec):
        return np.arange(int(sec * SR)) / SR

    def hp_noise(n):
        return np.diff(r.standard_normal(n + 1))

    t = tt(0.45)
    f = 45 + 110 * np.exp(-t * 30)
    kick = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)
    t = tt(0.28)
    snare = r.standard_normal(len(t)) * 0.5 * np.exp(-t * 24) + 0.5 * np.sin(2 * np.pi * 190 * t) * np.exp(-t * 32)
    t = tt(0.07)
    hat = hp_noise(len(t)) * 0.5 * np.exp(-t * 70)
    t = tt(0.22)
    clap = r.standard_normal(len(t)) * (0.6 * np.exp(-t * 40) + 0.5 * np.exp(-np.clip(t - 0.012, 0, None) * 35)
                                        * (t > 0.012))
    t = tt(0.04)
    rim = np.sin(2 * np.pi * 1700 * t) * np.exp(-t * 160) * 0.6
    t = tt(1.2)
    crash = hp_noise(len(t)) * np.exp(-t * 2.5) * 0.7
    t = tt(0.5)
    ride = hp_noise(len(t)) * np.exp(-t * 7) * 0.8 + 0.2 * np.sin(2 * np.pi * 3300 * t) * np.exp(-t * 12)
    _DRUMS.update(kick=kick, snare=snare, hat=hat, clap=clap, rim=rim, crash=crash, ride=ride)
    return _DRUMS


def env_note(n, attack=0.005, release=0.05, tau=None):
    t = np.arange(n) / SR
    e = np.exp(-t / tau) if tau else np.ones(n)
    a = min(n, max(1, int(attack * SR)))
    e[:a] *= np.linspace(0.0, 1.0, a)
    r = min(n, int(release * SR))
    if r > 0:
        e[n - r:] *= np.linspace(1.0, 0.0, r)
    return e


def osc_sine(f, n):
    return np.sin(2 * np.pi * f * np.arange(n) / SR)


def osc_saw(f, n, H=10):
    H = max(1, min(H, int(0.45 * SR / f)))
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k in range(1, H + 1):
        out += np.sin(2 * np.pi * k * f * t) / k
    return out * (2 / np.pi)


def osc_tri(f, n):
    t = np.arange(n) / SR
    out = np.zeros(n)
    k, sg = 1, 1.0
    while k <= 15 and k * f < 0.45 * SR:
        out += sg * np.sin(2 * np.pi * k * f * t) / (k * k)
        sg, k = -sg, k + 2
    return out * 0.81


def osc_tri_vib(f, n):
    t = np.arange(n) / SR
    fi = f * (1 + 0.006 * np.sin(2 * np.pi * 5.2 * t) * np.minimum(1, t / 0.4))
    ph = 2 * np.pi * np.cumsum(fi) / SR
    out = np.zeros(n)
    k, sg = 1, 1.0
    while k <= 15 and k * f < 0.45 * SR:
        out += sg * np.sin(k * ph) / (k * k)
        sg, k = -sg, k + 2
    return out * 0.81


def osc_piano(f, n):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k, amp in ((1, 1.0), (2, 0.45), (3, 0.25), (4, 0.14), (5, 0.08), (6, 0.05)):
        if k * f > 0.45 * SR:
            break
        out += amp * np.exp(-t * 1.2 * (1 + 0.9 * (k - 1))) * np.sin(2 * np.pi * k * f * t)
    return out


def osc_rhodes(f, n):
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) * np.exp(-t * 2.2)
            + 0.35 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t * 4.5)
            + 0.08 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t * 9))


def osc_bell(f, n):
    t = np.arange(n) / SR
    out = np.sin(2 * np.pi * f * t) * np.exp(-t * 1.2)
    if 2.76 * f < 0.45 * SR:
        out += 0.45 * np.sin(2 * np.pi * 2.76 * f * t) * np.exp(-t * 2.4)
    if 5.4 * f < 0.45 * SR:
        out += 0.18 * np.sin(2 * np.pi * 5.4 * f * t) * np.exp(-t * 4.5)
    return out


def osc_pluck(f, n):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for k in range(1, 6):
        if k * f > 0.45 * SR:
            break
        out += np.sin(2 * np.pi * k * f * t) / k * np.exp(-t * (4 + 3 * k))
    return out


def osc_808(f, n):
    t = np.arange(n) / SR
    fi = f * (1 + 0.5 * np.exp(-t * 40))
    return np.sin(2 * np.pi * np.cumsum(fi) / SR) * np.exp(-t * 2.2)


def voice(kind, f, dur):
    n = max(2, int(dur * SR))
    if kind == "pluck":
        s, e = osc_pluck(f, n), env_note(n, 0.002, 0.04)
    elif kind == "tri":
        s, e = osc_tri(f, n), env_note(n, 0.006, 0.08)
    elif kind == "fiddle":
        s, e = osc_tri_vib(f, n), env_note(n, 0.03, 0.1)
    elif kind == "saw_lead":
        s, e = osc_saw(f, n, 8), env_note(n, 0.01, 0.06)
    elif kind == "fuzz":
        s, e = np.tanh(2.2 * osc_saw(f, n, 10)), env_note(n, 0.004, 0.08)
    elif kind == "piano":
        s, e = osc_piano(f, n), env_note(n, 0.002, 0.06)
    elif kind == "rhodes":
        s, e = osc_rhodes(f, n), env_note(n, 0.003, 0.12)
    elif kind == "bell":
        s, e = osc_bell(f, n), env_note(n, 0.002, 0.08)
    elif kind == "808":
        s, e = osc_808(f, n), env_note(n, 0.002, 0.1)
    elif kind == "saw_off":
        s, e = osc_saw(f, n, 6), env_note(n, 0.003, 0.05, tau=0.22)
    elif kind == "cello":
        s, e = osc_saw(f, n, 6) * 0.8, env_note(n, 0.05, 0.15)
    else:  # sine
        s, e = osc_sine(f, n), env_note(n, 0.03, 0.3)
    return s * e * VOICE_LEVEL.get(kind, 0.6)


def pad_stereo(freqs, n, attack, H, cache):
    key = (tuple(round(f, 2) for f in freqs), n, attack, H)
    if key in cache:
        return cache[key]
    L, R = np.zeros(n), np.zeros(n)
    for f in freqs:
        L += osc_saw(f * 2 ** (-7 / 1200), n, H)
        R += osc_saw(f * 2 ** (7 / 1200), n, H)
    e = env_note(n, attack, 0.5)
    out = np.stack([L * e, R * e]) * (0.7 / len(freqs))
    cache[key] = out
    return out


def add_mono(bus, sig, pos, pan=0.0, gain=1.0):
    if pos < 0 or pos >= bus.shape[1]:
        return
    m = min(len(sig), bus.shape[1] - pos)
    if m <= 0:
        return
    th = (pan + 1) * np.pi / 4
    bus[0, pos:pos + m] += (sig[:m] * gain * np.cos(th)).astype(np.float32)
    bus[1, pos:pos + m] += (sig[:m] * gain * np.sin(th)).astype(np.float32)


def add_stereo(bus, sig2, pos, gain=1.0):
    if pos < 0 or pos >= bus.shape[1]:
        return
    m = min(sig2.shape[1], bus.shape[1] - pos)
    bus[:, pos:pos + m] += (sig2[:, :m] * gain).astype(np.float32)


def fft_conv(x, h, block=32768):
    n_fft = 1 << int(np.ceil(np.log2(block + len(h) - 1)))
    H = np.fft.rfft(h, n_fft)
    out = np.zeros(len(x) + len(h) - 1)
    for i in range(0, len(x), block):
        seg = x[i:i + block].astype(np.float64)
        y = np.fft.irfft(np.fft.rfft(seg, n_fft) * H, n_fft)
        L = len(seg) + len(h) - 1
        out[i:i + L] += y[:L]
    return out[:len(x)]


def make_phrase(rng, rhythm, deg0):
    out, d = [], int(deg0)
    for b in rhythm:
        d = int(min(9, max(0, d + int(rng.choice([-2, -1, -1, 1, 1, 2, 3, -3])))))
        out.append((d, float(b)))
    return out


def render_song(task):
    t_wall = time.time()
    sid, idx = task["id"], task["idx"]
    g = GENRE_BY_ID[task["genre"]]
    bpm, mood, sections = task["bpm"], task["mood"], task["sections"]
    rng = np.random.default_rng([SEED, 1001, idx])
    beat = 60.0 / bpm
    bar_s = 4 * beat
    bar_map = []
    for name, nb in sections:
        for lb in range(nb):
            bar_map.append((name, lb, nb))
    total_bars = len(bar_map)
    musical_n = int(round(total_bars * bar_s * SR))
    N = musical_n + int(1.5 * SR)
    dry = np.zeros((2, N), np.float32)
    send = np.zeros((2, N), np.float32)
    bank = drum_bank()

    key = int(rng.integers(12))
    scale = SCALES[MODE_BY_MOOD[mood][int(rng.integers(len(MODE_BY_MOOD[mood])))]]
    prog = PROGRESSIONS[int(rng.integers(len(PROGRESSIONS)))]
    pad_base, bass_base = 48 + key, 36 + key
    comp_base, lead_base = 60 + key, 60 + key
    hook = make_phrase(rng, RHYTHMS[int(rng.integers(len(RHYTHMS)))], rng.integers(2, 7))
    pad_kind = {"saw": ("saw", 0.12, 10), "soft": ("soft", 0.25, 5), "strings": ("strings", 0.45, 8)}[g["pad"]]
    cache = {}
    lead_pan = float(rng.uniform(-0.35, 0.35))
    swing_off = 0.07

    def chord_midi(d, base):
        idx_list = [d, d + 2, d + 4] + ([d + 6] if g["seventh"] else [])
        return [base + (spitch(scale, i) % 12) for i in idx_list]

    def play_phrase(phrase, unit_beat, kind, gain_dry, gain_send):
        b = 0.0
        for deg, dur in phrase:
            m = lead_base + spitch(scale, deg)
            pos = int(round((unit_beat + b) * beat * SR))
            sig = voice(kind, midi_hz(m), dur * beat * 0.92)
            add_mono(dry, sig, pos, pan=lead_pan, gain=gain_dry)
            add_mono(send, sig, pos, pan=lead_pan, gain=gain_send)
            b += dur

    bar_n = int(round(bar_s * SR))
    for gb in range(total_bars):
        sname, lb, sec_len = bar_map[gb]
        p_pad, p_drum, p_lead = SECTION_LEVELS[sname]
        bar_beat0 = gb * 4.0
        d = prog[lb % len(prog)]
        nxt_root = prog[(lb + 1) % len(prog)]

        # Pads (every bar, slightly overlapping the next bar)
        pads = pad_stereo([midi_hz(m) for m in chord_midi(d, pad_base)], bar_n + int(0.3 * SR),
                          pad_kind[1], pad_kind[2], cache)
        pos_bar = int(round(gb * bar_s * SR))
        add_stereo(dry, pads, pos_bar, gain=p_pad * 0.9)
        add_stereo(send, pads, pos_bar, gain=p_pad * 1.1)

        # Bass
        if sname != "intro" or g["bass"] == "sine":
            root = bass_base + (spitch(scale, d) % 12)
            style = g["bass"]
            if style == "808":
                for bt in (0.0, 2.5):
                    add_mono(dry, voice("808", midi_hz(root), 1.5), int(round((bar_beat0 + bt) * beat * SR)), gain=0.55)
            elif style == "pluck":
                for k in range(8):
                    m = root + (12 if k in (3, 7) else 0)
                    add_mono(dry, voice("pluck", midi_hz(m), 0.4), int(round((bar_beat0 + k * 0.5) * beat * SR)), gain=0.5)
            elif style == "saw_off":
                for bt in (0.5, 1.5, 2.5, 3.5):
                    add_mono(dry, voice("saw_off", midi_hz(root), 0.3), int(round((bar_beat0 + bt) * beat * SR)), gain=0.5)
            elif style == "walk":
                tones = [root, root + (4 if scale[2] - scale[0] == 4 else 3), root + 7,
                         bass_base + (spitch(scale, nxt_root) % 12) - 1]
                for k, m in enumerate(tones):
                    add_mono(dry, voice("pluck", midi_hz(m - 12), 0.9), int(round((bar_beat0 + k) * beat * SR)), gain=0.5)
            elif style == "cello":
                for bt in (0.0, 2.0):
                    add_mono(dry, voice("cello", midi_hz(root), 1.9), int(round((bar_beat0 + bt) * beat * SR)), gain=0.6)
            else:  # sine / long bass
                if lb % 2 == 0:
                    add_mono(dry, voice("sine", midi_hz(root - 12), 2 * beat * 4), int(round(bar_beat0 * beat * SR)), gain=0.6)

        # Comping
        comp = g["comp"]
        if comp != "none" and not (sname == "intro" and comp != "piano_arp"):
            cm = [m + 12 for m in chord_midi(d, comp_base - 12)]
            cv = g["comp_voice"]
            if comp == "strum":
                for bt in (0.0, 2.0):
                    for k, m in enumerate(cm):
                        pos = int(round((bar_beat0 + bt) * beat * SR + k * 0.012 * SR))
                        add_mono(dry, voice(cv, midi_hz(m), 1.6 * beat), pos, pan=0.2 * k - 0.3, gain=0.35)
            elif comp == "pluck":
                for k in range(8):
                    m = cm[(k * 2) % len(cm)] if k % 2 == 0 else cm[(k + 1) % len(cm)]
                    add_mono(dry, voice("pluck", midi_hz(m), 0.4 * beat), int(round((bar_beat0 + k * 0.5) * beat * SR)),
                             pan=-0.25 if k % 2 else 0.25, gain=0.4)
            elif comp == "rhodes":
                for bt in (1.5, 3.0):
                    for m in cm:
                        add_mono(dry, voice("rhodes", midi_hz(m), 1.5 * beat), int(round((bar_beat0 + bt) * beat * SR)),
                                 pan=-0.2, gain=0.3)
            elif comp == "piano":
                for bt in (1.0, 2.5, 3.5):
                    for m in cm:
                        add_mono(dry, voice("piano", midi_hz(m), 1.2 * beat), int(round((bar_beat0 + bt) * beat * SR)),
                                 pan=0.3, gain=0.25)
            elif comp == "piano_arp":
                for k in range(8):
                    m = cm[k % len(cm)] + (12 if k >= 4 else 0)
                    pos = int(round((bar_beat0 + k * 0.5) * beat * SR))
                    add_mono(dry, voice("piano", midi_hz(m), 0.9 * beat), pos, pan=-0.2 * (k % 2) + 0.1, gain=0.35)
                    add_mono(send, voice("piano", midi_hz(m), 0.9 * beat), pos, pan=0.0, gain=0.3)

        # Drums
        pattern = DRUM_PATTERNS.get(g["drums"]) if g["drums"] else None
        if pattern and p_drum > 0:
            for elem, steps in pattern.items():
                if sname == "bridge" and elem in ("hat", "ghost", "crash", "ride"):
                    continue
                if sname == "outro" and (elem != "kick" or lb >= sec_len // 2):
                    continue
                if elem == "crash" and not (sname == "chorus" and lb == 0):
                    continue
                if elem == "crash" and sname == "chorus" and lb == 0:
                    steps = [0]
                sample, base_vel = ELEM[elem]
                for st in steps:
                    off = (st * 0.25 + (swing_off if (g["swing"] and st % 2 == 1) else 0.0)) * beat
                    pos = int(round((bar_beat0 * beat + off) * SR))
                    pan = 0.3 if st % 4 == 2 else -0.3 if elem in ("hat", "ride") else 0.0
                    vel = base_vel * p_drum * (0.85 + 0.3 * rng.random())
                    add_mono(dry, bank[sample], pos, pan=pan, gain=vel)

        # Lead: once per 2-bar unit
        if gb % 2 == 0 and g["lead"] != "none":
            unit_beat = bar_beat0
            lead_kind = {"tri": "tri", "bell": "bell", "rhodes": "rhodes", "piano": "piano", "fiddle": "fiddle",
                         "saw_lead": "saw_lead", "fuzz": "fuzz"}[g["lead"]]
            if sname == "chorus":
                play_phrase(hook, unit_beat, lead_kind, 0.42, 0.5)
            elif rng.random() < p_lead:
                rhythm = RHYTHMS[int(rng.integers(len(RHYTHMS)))]
                play_phrase(make_phrase(rng, rhythm, rng.integers(0, 6)), unit_beat, lead_kind, 0.38, 0.45)

    # Stereo reverb (block FFT convolution with a synthetic decaying IR)
    ir_len = int(1.2 * SR)
    tt = np.arange(ir_len) / SR
    ir = np.stack([rng.standard_normal(ir_len) * np.exp(-tt / 0.35),
                   rng.standard_normal(ir_len) * np.exp(-tt / 0.35)])
    ir /= np.sqrt((ir ** 2).sum(axis=1, keepdims=True))
    wet = np.stack([fft_conv(send[0], ir[0]), fft_conv(send[1], ir[1])])
    mix = dry.astype(np.float64) + 0.4 * wet
    mix = mix[:, :musical_n]

    if g["lp"]:  # lo-fi: gentle low-pass via windowed sinc (linear phase, delay compensated)
        M, fc = 511, 3600.0
        nidx = np.arange(M) - M // 2
        h = np.sinc(2 * fc / SR * nidx) * np.hanning(M)
        h /= h.sum()
        for ch in range(2):
            y = fft_conv(mix[ch], h)
            mix[ch] = np.concatenate([y[M // 2:], np.zeros(M // 2)])[:musical_n]
    if g["vinyl"]:  # crackle + hiss
        n_clicks = int(musical_n / SR * 18)
        for ch in range(2):
            pos = rng.integers(0, musical_n, n_clicks)
            mix[ch, pos] += rng.uniform(-0.12, 0.12, n_clicks)
        mix += rng.standard_normal((2, musical_n)) * 0.002

    # Fades, loudness normalisation, soft limiter
    f_in = int(0.03 * SR)
    mix[:, :f_in] *= np.linspace(0, 1, f_in)
    f_out = int(2.2 * SR)
    ramp = 0.5 * (1 + np.cos(np.pi * np.linspace(0, 1, f_out)))
    mix[:, -f_out:] *= ramp
    rms = np.sqrt(np.mean(mix ** 2)) + 1e-9
    mix *= (10 ** (TARGET_RMS_DB / 20.0)) / rms
    peak = float(np.max(np.abs(mix)))
    if peak > 0.95:
        mix = 0.95 * np.tanh(mix / 0.95)
    peak_out = float(np.max(np.abs(mix)))

    out_path = AUDIO_DIR / f"{sid}.m4a"
    pcm = np.ascontiguousarray(mix.T.astype("<f4")).tobytes()
    subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "f32le", "-ar", str(SR),
                    "-ac", "2", "-i", "pipe:0", "-c:a", "aac", "-b:a", "96k", "-ar", "44100", "-ac", "2",
                    "-movflags", "+faststart", str(out_path)], input=pcm, check=True)
    pr = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                         str(out_path)], capture_output=True, text=True, check=True)
    dur_ms = int(round(float(pr.stdout.strip()) * 1000))
    return {"id": sid, "durationMs": dur_ms, "plannedMs": int(round(musical_n / SR * 1000)),
            "peak": round(peak_out, 3), "secs": round(time.time() - t_wall, 2)}


# ----------------------------------------------------------------------------
# Catalog planning
# ----------------------------------------------------------------------------

def plan_structure(rng, bpm, target_s):
    bar_s = 240.0 / bpm
    best = None
    for I in (4, 8):
        for V in (8, 16):
            for C in (8, 16):
                for B in (8, 16):
                    for O in (4, 8):
                        total = I + 2 * V + 3 * C + B + O
                        dur = total * bar_s
                        ok = 121.0 <= dur <= 222.0
                        score = (0 if ok else 1, abs(dur - target_s) + rng.random() * 0.5)
                        if best is None or score < best[0]:
                            best = (score, (I, V, C, B, O))
    I, V, C, B, O = best[1]
    return [("intro", I), ("verse", V), ("chorus", C), ("verse", V), ("chorus", C), ("bridge", B),
            ("chorus", C), ("outro", O)]


def build_plan(rng):
    artists = []
    for i, (name, gids, origin) in enumerate(ARTIST_SPECS):
        aid = f"ar_{i + 1:03d}"
        gnames = [GENRE_BY_ID[x]["name"] for x in gids]
        artists.append({
            "id": aid, "name": name, "genres": gids, "origin": origin,
            "bio": make_bio(rng, name, gnames),
            "bornOrFormed": str(rng.randint(2008, 2024)),
            "monthlyListeners": int(10 ** rng.uniform(4.3, 6.9)),
        })

    types = ["album"] * 30 + ["ep"] * 10 + ["single"] * 15
    rng.shuffle(types)
    new_idx = set(rng.sample(range(55), 12))
    used_titles = set()
    albums, songs = [], []
    for i in range(55):
        artist = artists[i % 32] if i < 32 else artists[rng.randrange(32)]
        gid = rng.choice(artist["genres"])
        g = GENRE_BY_ID[gid]
        typ = types[i]
        ntr = rng.randint(6, 10) if typ == "album" else (rng.randint(4, 5) if typ == "ep" else rng.randint(1, 2))
        if i in new_idx:
            rel = rand_date(rng, date(2026, 9, 2), date(2026, 11, 20))
        else:
            rel = rand_date(rng, date(2019, 1, 1), date(2026, 8, 31))
        title = unique_title(rng, used_titles)
        explicit = rng.random() < 0.25
        label = rng.choice(LABELS)
        city = rng.choice(CITIES)
        mood = rng.choice(g["moods"])
        alb = {
            "id": f"al_{i + 1:03d}", "title": title, "artist": artist, "type": typ, "genreId": gid,
            "releaseDate": iso(rel), "recordLabel": label, "isExplicit": explicit,
            "editorialNotes": album_note(rng, title, g["name"], mood, city),
            "copyright": f"℗ {rel.year} {label}", "trackIds": [], "durationMs": 0,
            "textOverlay": rng.random() < 0.35, "mood": mood,
        }
        albums.append(alb)
        for t in range(ntr):
            sid = f"so_{len(songs) + 1:04d}"
            gen_bpm = rng.randint(*g["bpm"])
            target_s = rng.uniform(128, 210)
            sections = plan_structure(rng, gen_bpm, target_s)
            total_bars = sum(nb for _, nb in sections)
            feat = []
            if rng.random() < 0.2:
                other = artists[rng.randrange(32)]
                if other["id"] != artist["id"]:
                    feat = [{"id": other["id"], "name": other["name"]}]
            smood = mood if rng.random() < 0.7 else rng.choice(g["moods"])
            energy_base = {"energetic": 0.82, "upbeat": 0.7, "dark": 0.55, "romantic": 0.45, "chill": 0.35,
                           "dreamy": 0.3, "melancholy": 0.32, "focus": 0.25}[smood]
            songs.append({
                "id": sid, "idx": len(songs) + 1, "title": unique_title(rng, used_titles),
                "album_index": i, "track": t + 1, "genre": gid, "artist": {"id": artist["id"], "name": artist["name"]},
                "featuring": feat, "bpm": gen_bpm, "mood": smood,
                "energy": round(min(0.98, max(0.05, energy_base + rng.gauss(0, 0.07))), 2),
                "popularity": int(min(99, max(5, g["base_pop"] + rng.randint(-18, 18) + (6 if t == 0 else 0)))),
                "composer": f"{rng.choice(FIRST)} {rng.choice(LAST)}",
                "sections": sections, "total_bars": total_bars, "release": iso(rel),
                "isExplicit": explicit, "hasLyrics": False, "explicit_pref": explicit,
            })

    # Lyrics eligibility: mood != focus and genre not ambient/classical
    for s in songs:
        eligible = s["mood"] != "focus" and s["genre"] not in ("ambient", "classical")
        s["hasLyrics"] = bool(eligible and rng.random() < 0.7)
    for s in songs:
        s["lyrics"] = song_lyrics(rng, s["sections"], s["bpm"], s["mood"]) if s["hasLyrics"] else None
        if s["hasLyrics"] and not s["lyrics"]:
            s["hasLyrics"] = False

    # Assign album track ids
    for s in songs:
        albums[s["album_index"]]["trackIds"].append(s["id"])

    # Editorial playlists
    playlists = []
    start_pl, end_pl = date(2026, 9, 1), date(2026, 11, 24)
    for k, (name, filt, order, size, curator, desc, short) in enumerate(PLAYLISTS):
        pool = list(songs)
        if filt:
            if filt[0] == "genre":
                pool = [s for s in songs if s["genre"] == filt[1]]
            elif filt[0] == "genres":
                pool = [s for s in songs if s["genre"] in filt[1]]
            elif filt[0] == "moods":
                pool = [s for s in songs if s["mood"] in filt[1]]
        if order == "pop":
            pool.sort(key=lambda s: (-s["popularity"], s["id"]))
        elif order == "new":
            pool.sort(key=lambda s: (s["release"], s["id"]), reverse=True)
        else:
            rng.shuffle(pool)
        if len(pool) < size:
            extra = sorted([s for s in songs if s not in pool], key=lambda s: (-s["popularity"], s["id"]))
            pool = pool + extra
        chosen = pool[:size]
        if name == "New Music Friday":
            upd = "2026-11-20T06:00:00Z"
        else:
            upd = f"{rand_date(rng, start_pl, end_pl).isoformat()}T{rng.randint(8, 20):02d}:00:00Z"
        art_genre = filt[1] if filt and filt[0] == "genre" else ("pop" if not filt else
                                                              (filt[1][0] if filt[0] == "genres" else "lofi"))
        playlists.append({"id": f"pl_ed_{k + 1:03d}", "name": name, "curator": curator, "description": desc,
                          "short": short, "trackIds": [s["id"] for s in chosen], "updated": upd,
                          "artGenre": art_genre if art_genre in GENRE_BY_ID else "pop"})

    # Stations
    stations = []
    artist_by_name = {a["name"]: a for a in artists}
    for k, (name, tagline, kind, seed, art_genre) in enumerate(STATIONS):
        st = {"id": f"st_{k + 1:03d}", "name": name, "tagline": tagline, "kind": kind, "artGenre": art_genre}
        if kind == "genre":
            st["seedId"] = seed
        elif kind == "artist":
            st["seedId"] = artist_by_name[seed]["id"]
        stations.append(st)

    return artists, albums, songs, playlists, stations


# ----------------------------------------------------------------------------
# Main
# ----------------------------------------------------------------------------

def artwork_obj(pal, img_id):
    return {"url": f"/media/art/{img_id}.webp", "width": N_ART, "height": N_ART, **pal}


def main():
    t0 = time.time()
    ART_DIR.mkdir(parents=True, exist_ok=True)
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    rng = random.Random(SEED)

    print("[1/5] planning catalog", flush=True)
    artists, albums, songs, playlists, stations = build_plan(rng)
    n_lyrics = sum(1 for s in songs if s["hasLyrics"])
    print(f"      artists={len(artists)} albums={len(albums)} songs={len(songs)} playlists={len(playlists)} "
          f"stations={len(stations)} lyrics={n_lyrics} ({100.0 * n_lyrics / len(songs):.0f}%)", flush=True)

    # Artwork jobs
    art_jobs = []
    for g in GENRES:
        art_jobs.append({"id": f"genre_{g['id']}", "kind": "tile", "genre": g["id"]})
    for a in artists:
        art_jobs.append({"id": a["id"], "kind": "artist", "genre": a["genres"][0]})
        art_jobs.append({"id": f"{a['id']}_hero", "kind": "hero", "genre": a["genres"][0]})
    for al in albums:
        art_jobs.append({"id": al["id"], "kind": "album", "genre": al["genreId"], "title": al["title"],
                         "text": al["textOverlay"]})
    for p in playlists:
        art_jobs.append({"id": p["id"], "kind": "playlist", "genre": p["artGenre"], "title": p["name"]})
    for st in stations:
        art_jobs.append({"id": st["id"], "kind": "station", "genre": st["artGenre"], "title": st["name"]})

    print(f"[2/5] rendering {len(art_jobs)} artworks", flush=True)
    palettes = {}
    with Pool(WORKERS) as pool:
        for k, (img_id, pal) in enumerate(pool.imap_unordered(render_art, art_jobs, chunksize=2)):
            palettes[img_id] = pal
            if (k + 1) % 40 == 0:
                print(f"      art {k + 1}/{len(art_jobs)}", flush=True)
    t_art = time.time()

    # Audio
    render_songs = songs[:LIMIT] if LIMIT else songs
    print(f"[3/5] synthesizing audio for {len(render_songs)} songs", flush=True)
    tasks = [{"id": s["id"], "idx": s["idx"], "genre": s["genre"], "bpm": s["bpm"], "mood": s["mood"],
              "sections": s["sections"]} for s in render_songs]
    results = {}
    with Pool(WORKERS) as pool:
        for k, r in enumerate(pool.imap_unordered(render_song, tasks, chunksize=1)):
            results[r["id"]] = r
            if (k + 1) % 25 == 0 or k + 1 == len(tasks):
                print(f"      audio {k + 1}/{len(tasks)} (last {r['id']} {r['durationMs']}ms in {r['secs']}s)",
                      flush=True)
    t_audio = time.time()

    # Assemble the catalog
    print("[4/5] assembling catalog.json and lyrics.json", flush=True)
    song_dur = {}
    for s in songs:
        if s["id"] in results:
            song_dur[s["id"]] = results[s["id"]]["durationMs"]
        else:
            song_dur[s["id"]] = int(round(sum(nb for _, nb in s["sections"]) * 240.0 / s["bpm"] * 1000))

    genres_out = []
    for g in GENRES:
        genres_out.append({"id": g["id"], "name": g["name"], "color": g["color"],
                           "artwork": artwork_obj(palettes[f"genre_{g['id']}"], f"genre_{g['id']}")})

    artists_out = []
    for a in artists:
        artists_out.append({
            "id": a["id"], "name": a["name"], "genreIds": a["genres"], "bio": a["bio"], "origin": a["origin"],
            "bornOrFormed": a["bornOrFormed"],
            "artwork": artwork_obj(palettes[a["id"]], a["id"]),
            "heroArtwork": artwork_obj(palettes[f"{a['id']}_hero"], f"{a['id']}_hero"),
            "monthlyListeners": a["monthlyListeners"],
        })

    albums_out = []
    for al in albums:
        dur = sum(song_dur[t] for t in al["trackIds"])
        albums_out.append({
            "id": al["id"], "title": al["title"], "artist": {"id": al["artist"]["id"], "name": al["artist"]["name"]},
            "type": al["type"], "genreId": al["genreId"], "releaseDate": al["releaseDate"],
            "copyright": al["copyright"], "editorialNotes": al["editorialNotes"], "recordLabel": al["recordLabel"],
            "isExplicit": al["isExplicit"], "artwork": artwork_obj(palettes[al["id"]], al["id"]),
            "trackIds": al["trackIds"], "durationMs": dur,
        })
    album_by_id = {a["id"]: a for a in albums_out}

    songs_out = []
    lyrics_out = {}
    for s in songs:
        al = album_by_id[f"al_{s['album_index'] + 1:03d}"]
        songs_out.append({
            "id": s["id"], "title": s["title"], "artist": s["artist"], "featuring": s["featuring"],
            "album": {"id": al["id"], "title": al["title"]}, "genreId": s["genre"], "trackNumber": s["track"],
            "discNumber": 1, "durationMs": song_dur[s["id"]], "isExplicit": s["isExplicit"],
            "hasLyrics": s["hasLyrics"], "audioUrl": f"/api/stream/{s['id']}",
            "artwork": al["artwork"], "releaseDate": s["release"], "bpm": s["bpm"], "mood": s["mood"],
            "energy": s["energy"], "popularity": s["popularity"], "composer": s["composer"],
        })
        if s["hasLyrics"]:
            # AAC trims a few ms at the tail, so clamp to the encoded duration
            dur = song_dur[s["id"]]
            lyrics_out[s["id"]] = [dict(ln, endMs=min(ln["endMs"], dur)) for ln in s["lyrics"]
                                   if ln["startMs"] < dur]

    playlists_out = []
    for p in playlists:
        dur = sum(song_dur[t] for t in p["trackIds"])
        playlists_out.append({
            "id": p["id"], "kind": "editorial", "name": p["name"], "curatorName": p["curator"],
            "description": p["description"], "shortDescription": p["short"],
            "artwork": artwork_obj(palettes[p["id"]], p["id"]), "trackIds": p["trackIds"], "durationMs": dur,
            "updatedAt": p["updated"], "isPublic": True,
        })

    stations_out = []
    for st in stations:
        o = {"id": st["id"], "name": st["name"], "tagline": st["tagline"], "kind": st["kind"],
             "artwork": artwork_obj(palettes[st["id"]], st["id"])}
        if "seedId" in st:
            o["seedId"] = st["seedId"]
        stations_out.append(o)

    catalog = {"version": 1, "genres": genres_out, "artists": artists_out, "albums": albums_out,
               "songs": songs_out, "playlists": playlists_out, "stations": stations_out}
    OUT.mkdir(parents=True, exist_ok=True)
    with open(OUT / "catalog.json", "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, indent=1)
    with open(OUT / "lyrics.json", "w", encoding="utf-8") as f:
        json.dump(lyrics_out, f, ensure_ascii=False, indent=1)
    print("[5/5] wrote", OUT / "catalog.json", "and", OUT / "lyrics.json", flush=True)
    total_bytes = sum(p.stat().st_size for p in OUT.rglob("*") if p.is_file())
    print(f"done: art {t_art - t0:.0f}s, audio {t_audio - t_art:.0f}s, total {time.time() - t0:.0f}s, "
          f"media+data {total_bytes / 1e6:.1f} MB", flush=True)


if __name__ == "__main__":
    sys.setrecursionlimit(10000)
    main()
