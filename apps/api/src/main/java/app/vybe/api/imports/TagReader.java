package app.vybe.api.imports;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.jaudiotagger.audio.AudioFile;
import org.jaudiotagger.audio.AudioFileIO;
import org.jaudiotagger.tag.FieldKey;
import org.jaudiotagger.tag.Tag;
import org.jaudiotagger.tag.images.Artwork;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Iterator;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.TimeUnit;
import java.util.logging.Level;

/**
 * Reads embedded tags, cover art and duration from an audio file. jaudiotagger handles ID3 (mp3),
 * MP4 atoms (m4a/aac), FLAC, Ogg Vorbis and WAV. When it cannot read a file (raw ADTS AAC, Opus, a
 * damaged header) and {@code ffprobe} is on the PATH, ffprobe supplies the duration and text tags.
 * Missing values come back empty; callers apply the filename / "Unknown Artist" fallbacks.
 */
@Component
public class TagReader {

    private static final Logger log = LoggerFactory.getLogger(TagReader.class);

    /** What could be read from a file. Strings are trimmed and never null; numbers are 0 when absent. */
    public record AudioTags(String title, String artist, String album, String albumArtist, int trackNumber,
                            int discNumber, Integer year, String genre, long durationMs, byte[] cover) {
    }

    private final ObjectMapper json = new ObjectMapper();
    private final String ffprobe = findOnPath("ffprobe");

    static {
        // jaudiotagger logs every frame it parses at INFO through java.util.logging.
        java.util.logging.Logger.getLogger("org.jaudiotagger").setLevel(Level.SEVERE);
    }

    public AudioTags read(Path file, AudioFormat format) {
        AudioTags tags = null;
        if (format.tagReaderExt() != null) {
            tags = readWithJaudiotagger(file.toFile(), format.tagReaderExt());
        }
        if ((tags == null || tags.durationMs() <= 0) && ffprobe != null) {
            AudioTags probed = readWithFfprobe(file);
            tags = tags == null ? probed : merge(tags, probed);
        }
        return tags != null ? tags : new AudioTags("", "", "", "", 0, 0, null, "", 0, null);
    }

    /** True when the ffprobe fallback is available. */
    public boolean hasFfprobe() {
        return ffprobe != null;
    }

    private AudioTags readWithJaudiotagger(File file, String ext) {
        try {
            AudioFile af = AudioFileIO.readAs(file, ext);
            long durationMs = 0;
            if (af.getAudioHeader() != null) {
                double precise = af.getAudioHeader().getPreciseTrackLength();
                durationMs = precise > 0 ? Math.round(precise * 1000) : af.getAudioHeader().getTrackLength() * 1000L;
            }
            Tag tag = af.getTag();
            if (tag == null) {
                return new AudioTags("", "", "", "", 0, 0, null, "", durationMs, null);
            }
            byte[] cover = null;
            try {
                Artwork art = tag.getFirstArtwork();
                if (art != null && art.getBinaryData() != null && art.getBinaryData().length > 0) {
                    cover = art.getBinaryData();
                }
            } catch (RuntimeException e) {
                log.debug("no readable artwork in {}: {}", file.getName(), e.toString());
            }
            return new AudioTags(
                    field(tag, FieldKey.TITLE), field(tag, FieldKey.ARTIST), field(tag, FieldKey.ALBUM),
                    field(tag, FieldKey.ALBUM_ARTIST), leadingInt(field(tag, FieldKey.TRACK)),
                    leadingInt(field(tag, FieldKey.DISC_NO)), year(field(tag, FieldKey.YEAR)),
                    cleanGenre(field(tag, FieldKey.GENRE)), durationMs, cover);
        } catch (Exception | LinkageError e) {
            log.debug("jaudiotagger could not read {}: {}", file.getName(), e.toString());
            return null;
        }
    }

    private AudioTags readWithFfprobe(Path file) {
        try {
            Process p = new ProcessBuilder(ffprobe, "-v", "quiet", "-print_format", "json",
                    "-show_format", "-show_streams", file.toString())
                    .redirectErrorStream(false)
                    .redirectError(ProcessBuilder.Redirect.DISCARD)
                    .start();
            byte[] out;
            try (InputStream in = p.getInputStream()) {
                out = in.readNBytes(1 << 20);
            }
            if (!p.waitFor(15, TimeUnit.SECONDS)) {
                p.destroyForcibly();
                return null;
            }
            JsonNode root = json.readTree(out);
            JsonNode format = root.path("format");
            long durationMs = Math.round(format.path("duration").asDouble(0) * 1000);
            Map<String, String> t = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
            collectTags(format.path("tags"), t);
            for (JsonNode stream : root.path("streams")) {
                if (durationMs <= 0) {
                    durationMs = Math.round(stream.path("duration").asDouble(0) * 1000);
                }
                collectTags(stream.path("tags"), t);
            }
            return new AudioTags(t.getOrDefault("title", "").trim(), t.getOrDefault("artist", "").trim(),
                    t.getOrDefault("album", "").trim(),
                    t.getOrDefault("album_artist", t.getOrDefault("albumartist", "")).trim(),
                    leadingInt(t.getOrDefault("track", "")), leadingInt(t.getOrDefault("disc", "")),
                    year(t.getOrDefault("date", t.getOrDefault("year", ""))),
                    cleanGenre(t.getOrDefault("genre", "")), Math.max(0, durationMs), null);
        } catch (IOException e) {
            log.debug("ffprobe failed for {}: {}", file.getFileName(), e.toString());
            return null;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return null;
        }
    }

    private static void collectTags(JsonNode tags, Map<String, String> out) {
        if (!tags.isObject()) {
            return;
        }
        for (Iterator<Map.Entry<String, JsonNode>> it = tags.fields(); it.hasNext(); ) {
            Map.Entry<String, JsonNode> e = it.next();
            out.putIfAbsent(e.getKey(), e.getValue().asText(""));
        }
    }

    /** Fills blanks in {@code a} from {@code b}. */
    private static AudioTags merge(AudioTags a, AudioTags b) {
        if (b == null) {
            return a;
        }
        return new AudioTags(or(a.title(), b.title()), or(a.artist(), b.artist()), or(a.album(), b.album()),
                or(a.albumArtist(), b.albumArtist()), a.trackNumber() > 0 ? a.trackNumber() : b.trackNumber(),
                a.discNumber() > 0 ? a.discNumber() : b.discNumber(), a.year() != null ? a.year() : b.year(),
                or(a.genre(), b.genre()), a.durationMs() > 0 ? a.durationMs() : b.durationMs(),
                a.cover() != null ? a.cover() : b.cover());
    }

    private static String or(String a, String b) {
        return a == null || a.isBlank() ? (b == null ? "" : b) : a;
    }

    private static String field(Tag tag, FieldKey key) {
        try {
            String v = tag.getFirst(key);
            return v == null ? "" : v.trim();
        } catch (RuntimeException e) {
            return "";
        }
    }

    /** "3/12" → 3; "" → 0. */
    static int leadingInt(String s) {
        if (s == null) {
            return 0;
        }
        String t = s.trim();
        int end = 0;
        while (end < t.length() && end < 6 && Character.isDigit(t.charAt(end))) {
            end++;
        }
        return end == 0 ? 0 : Integer.parseInt(t.substring(0, end));
    }

    /** "2024-05-01" or "2024" → 2024 when plausible. */
    static Integer year(String s) {
        int y = leadingInt(s == null ? "" : s.length() > 4 ? s.substring(0, 4) : s);
        return y >= 1000 && y <= 9999 ? y : null;
    }

    /** ID3v1 style "(17)" or "(17)Rock" genres keep only the readable part. */
    static String cleanGenre(String g) {
        if (g == null) {
            return "";
        }
        String t = g.trim().replaceAll("^\\(\\d+\\)", "").trim();
        return t.length() > 60 ? t.substring(0, 60) : t;
    }

    private static String findOnPath(String exe) {
        String path = System.getenv("PATH");
        if (path == null) {
            return null;
        }
        for (String dir : path.split(File.pathSeparator)) {
            if (dir.isBlank()) {
                continue;
            }
            Path candidate = Path.of(dir, exe);
            if (Files.isRegularFile(candidate) && Files.isExecutable(candidate)) {
                return candidate.toString();
            }
        }
        return null;
    }

    @Override
    public String toString() {
        return "TagReader[ffprobe=" + (ffprobe == null ? "none" : ffprobe.toLowerCase(Locale.ROOT)) + "]";
    }
}
