package app.vybe.api.imports;

import app.vybe.api.catalog.CatalogStore;
import app.vybe.api.common.Ids;
import app.vybe.api.common.Timestamps;
import app.vybe.api.config.VybeProperties;
import app.vybe.api.error.ApiException;
import app.vybe.api.model.AlbumRef;
import app.vybe.api.model.ArtistRef;
import app.vybe.api.model.Artwork;
import app.vybe.api.model.Song;
import app.vybe.api.playlists.PlaylistRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.unit.DataSize;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;

/**
 * Music a user imports from their own computer. Files are stored under
 * {@code <imports-dir>/<userId>/<id>.<ext>} (plus {@code <id>.jpg} for embedded cover art) and are
 * private: every read is scoped to the owner, and anything else answers 404.
 */
@Service
public class ImportService {

    public static final String SONG_PREFIX = "im_";
    public static final String ARTIST_PREFIX = "imar_";
    public static final String ALBUM_PREFIX = "imal_";
    public static final String UNKNOWN_ARTIST = "Unknown Artist";
    public static final String UNKNOWN_ALBUM = "Unknown Album";

    private static final Logger log = LoggerFactory.getLogger(ImportService.class);
    private static final Pattern BARE_ID = Pattern.compile("[a-z0-9]{12}");
    private static final Pattern SAFE_USER = Pattern.compile("[A-Za-z0-9_-]{1,64}");
    private static final int MAX_FILES = 200;

    public record Skipped(String name, String reason) {
    }

    public record UploadResult(List<Song> imported, List<Skipped> skipped) {
    }

    /** A track's audio file and its content type. */
    public record Audio(Resource resource, String mime, java.net.URI redirect) {
        Audio(Resource resource, String mime) { this(resource, mime, null); }
    }

    /** A track's artwork: the stored JPEG, or a generated gradient PNG. */
    public record Image(Resource resource, String mime, java.net.URI redirect) {
        Image(Resource resource, String mime) { this(resource, mime, null); }
    }

    private final ImportRepository repo;
    private final PlaylistRepository playlists;
    private final TagReader tags;
    private final CatalogStore catalog;
    private final Path root;
    private final long maxFileBytes;
    private final app.vybe.api.storage.BlobStore blobs;
    private static final java.time.Duration SIGNED_TTL = java.time.Duration.ofHours(2);

    public ImportService(ImportRepository repo, PlaylistRepository playlists, TagReader tags, CatalogStore catalog,
                         VybeProperties props,
                         @Value("${spring.servlet.multipart.max-file-size:50MB}") DataSize maxFileSize,
                         app.vybe.api.storage.BlobStore blobs) {
        this.blobs = blobs;
        this.repo = repo;
        this.playlists = playlists;
        this.tags = tags;
        this.catalog = catalog;
        this.root = props.importsDirectory();
        this.maxFileBytes = maxFileSize.toBytes();
    }

    // ------------------------------------------------------------------ ids

    public static boolean isImportId(String songId) {
        return songId != null && songId.startsWith(SONG_PREFIX);
    }

    /** "im_abc…" or "abc…" → "abc…" when well formed, else null. */
    static String bareId(String id) {
        if (id == null) {
            return null;
        }
        String bare = id.startsWith(SONG_PREFIX) ? id.substring(SONG_PREFIX.length()) : id;
        return BARE_ID.matcher(bare).matches() ? bare : null;
    }

    // ------------------------------------------------------------------ upload

    public UploadResult upload(String userId, List<MultipartFile> files) {
        if (files == null || files.isEmpty() || files.stream().allMatch(f -> f == null || f.isEmpty() && blank(f.getOriginalFilename()))) {
            throw ApiException.badRequest("no_files", "Choose one or more audio files to import");
        }
        if (files.size() > MAX_FILES) {
            throw ApiException.badRequest("too_many_files", "Import at most " + MAX_FILES + " files at a time");
        }
        Path dir = userDir(userId);
        try {
            Files.createDirectories(dir);
        } catch (IOException e) {
            throw new IllegalStateException("Cannot create import directory", e);
        }
        List<Song> imported = new ArrayList<>();
        List<Skipped> skipped = new ArrayList<>();
        for (MultipartFile file : files) {
            String name = displayName(file.getOriginalFilename());
            try {
                importOne(userId, dir, file, name).ifPresent(imported::add);
            } catch (SkipException e) {
                skipped.add(new Skipped(name, e.getMessage()));
            } catch (RuntimeException | IOException e) {
                log.warn("import of {} failed: {}", name, e.toString());
                skipped.add(new Skipped(name, "could not be read"));
            }
        }
        return new UploadResult(imported, skipped);
    }

    private static final class SkipException extends Exception {
        SkipException(String reason) {
            super(reason, null, false, false);
        }
    }

    private Optional<Song> importOne(String userId, Path dir, MultipartFile file, String name)
            throws IOException, SkipException {
        String ext = AudioFormat.extensionOf(name);
        AudioFormat format = AudioFormat.forExtension(ext).orElseThrow(() -> new SkipException("unsupported format"));
        if (file.getSize() > maxFileBytes) {
            throw new SkipException("too large (max " + (maxFileBytes / (1024 * 1024)) + " MB)");
        }
        if (file.getSize() == 0) {
            throw new SkipException("empty file");
        }
        Path temp = dir.resolve(".upload-" + Ids.random("", 12) + "." + ext);
        try {
            try (InputStream in = file.getInputStream()) {
                Files.copy(in, temp, StandardCopyOption.REPLACE_EXISTING);
            }
            byte[] head = new byte[AudioFormat.SNIFF_BYTES];
            int n;
            try (InputStream in = Files.newInputStream(temp)) {
                n = in.readNBytes(head, 0, head.length);
            }
            if (!format.matches(java.util.Arrays.copyOf(head, n))) {
                throw new SkipException("unsupported format");
            }
            long size = Files.size(temp);
            TagReader.AudioTags t = tags.read(temp, format);
            String title = clip(blank(t.title()) ? titleFromFilename(name) : t.title(), 200);
            String artist = clip(blank(t.artist()) ? UNKNOWN_ARTIST : t.artist(), 200);
            if (repo.isDuplicate(userId, size, title, artist)) {
                throw new SkipException("already imported");
            }

            String id = Ids.random("", 12);
            Files.move(temp, dir.resolve(id + "." + ext), StandardCopyOption.ATOMIC_MOVE);
            boolean hasArt = false;
            Palette.Colors colors = null;
            if (t.cover() != null) {
                try {
                    BufferedImage cover = ImageIO.read(new ByteArrayInputStream(t.cover()));
                    if (cover != null && cover.getWidth() > 0 && cover.getHeight() > 0) {
                        BufferedImage capped = Palette.capped(cover, Palette.MAX_COVER);
                        try (OutputStream out = Files.newOutputStream(dir.resolve(id + ".jpg"))) {
                            Palette.writeJpeg(capped, out);
                        }
                        colors = Palette.fromImage(capped);
                        hasArt = true;
                    }
                } catch (IOException | RuntimeException e) {
                    log.debug("cover of {} unreadable: {}", name, e.toString());
                }
            }
            if (colors == null) {
                colors = Palette.fromSeed(artist);
            }
            ImportRepository.Row row = new ImportRepository.Row(id, userId, title, artist, clip(t.album(), 200),
                    clip(t.albumArtist(), 200), Math.max(0, t.trackNumber()), Math.max(0, t.discNumber()), t.year(),
                    t.genre(), Math.max(0, t.durationMs()), ext, format.mime(), size, hasArt, colors.bg(),
                    colors.text1(), colors.text2(), colors.text3(), Timestamps.now(),
                    Loudness.gainDb(dir.resolve(id + "." + ext)));
            if (blobs.remote()) {
                // Ephemeral hosts: push to private object storage, keep nothing on local disk.
                Path audio = dir.resolve(id + "." + ext);
                blobs.put(userId + "/" + id + "." + ext, audio, format.mime());
                Files.deleteIfExists(audio);
                if (hasArt) {
                    Path art = dir.resolve(id + ".jpg");
                    blobs.put(userId + "/" + id + ".jpg", art, "image/jpeg");
                    Files.deleteIfExists(art);
                }
            }
            repo.insert(row);
            return Optional.of(toSong(row));
        } finally {
            Files.deleteIfExists(temp);
        }
    }

    // ------------------------------------------------------------------ reads

    /** The user's imports as songs, newest first. */
    public List<Song> list(String userId) {
        return repo.findByUser(userId).stream().map(this::toSong).toList();
    }

    /** Imports keyed by song id ({@code im_…}), newest first. */
    public Map<String, Song> byId(String userId) {
        Map<String, Song> out = new LinkedHashMap<>();
        if (userId != null) {
            for (ImportRepository.Row r : repo.findByUser(userId)) {
                Song s = toSong(r);
                out.put(s.id(), s);
            }
        }
        return out;
    }

    /** Created-at timestamps keyed by song id. */
    public Map<String, String> createdAt(String userId) {
        Map<String, String> out = new LinkedHashMap<>();
        for (ImportRepository.Row r : repo.findByUser(userId)) {
            out.put(SONG_PREFIX + r.id(), r.createdAt());
        }
        return out;
    }

    /** An import the user owns, by song id or bare id. */
    public Optional<Song> find(String userId, String id) {
        return row(userId, id).map(this::toSong);
    }

    public Audio audio(String userId, String id) {
        ImportRepository.Row r = row(userId, id).orElseThrow(ImportService::notFound);
        if (blobs.remote()) {
            return new Audio(null, r.mime(), signed(userId + "/" + r.id() + "." + r.fileExt()));
        }
        Path p = file(userId, r.id() + "." + r.fileExt());
        if (!Files.isRegularFile(p)) {
            throw notFound();
        }
        return new Audio(new FileSystemResource(p), r.mime());
    }

    public Image artwork(String userId, String id) {
        ImportRepository.Row r = row(userId, id).orElseThrow(ImportService::notFound);
        if (r.hasArt() && blobs.remote()) {
            return new Image(null, "image/jpeg", signed(userId + "/" + r.id() + ".jpg"));
        }
        if (r.hasArt()) {
            Path p = file(userId, r.id() + ".jpg");
            if (Files.isRegularFile(p)) {
                return new Image(new FileSystemResource(p), "image/jpeg");
            }
        }
        byte[] png = Palette.placeholderPng(r.bgColor(), r.textColor3(), Palette.PLACEHOLDER_SIZE);
        return new Image(new org.springframework.core.io.ByteArrayResource(png), "image/png");
    }

    // ------------------------------------------------------------------ delete

    /** Deletes the files and row, and removes the song from the library, loves, playlists and history. */
    @Transactional
    public void delete(String userId, String id) {
        ImportRepository.Row r = row(userId, id).orElseThrow(ImportService::notFound);
        String songId = SONG_PREFIX + r.id();
        repo.purgeSongReferences(userId, songId);
        for (String playlistId : repo.playlistsContaining(songId)) {
            List<String> kept = playlists.trackIds(playlistId).stream().filter(t -> !t.equals(songId)).toList();
            playlists.replaceTracks(playlistId, kept);
            playlists.touch(playlistId, Timestamps.now());
        }
        repo.delete(userId, r.id());
        if (blobs.remote()) {
            blobs.delete(userId + "/" + r.id() + "." + r.fileExt(), userId + "/" + r.id() + ".jpg");
            return;
        }
        try {
            Files.deleteIfExists(file(userId, r.id() + "." + r.fileExt()));
            Files.deleteIfExists(file(userId, r.id() + ".jpg"));
        } catch (IOException e) {
            log.warn("could not delete files of import {}: {}", r.id(), e.toString());
        }
    }

    private java.net.URI signed(String key) {
        try {
            return blobs.signedUrl(key, SIGNED_TTL);
        } catch (IOException e) {
            log.warn("could not sign {}: {}", key, e.toString());
            throw notFound();
        }
    }

    // ------------------------------------------------------------------ mapping

    public Song toSong(ImportRepository.Row r) {
        String songId = SONG_PREFIX + r.id();
        String albumTitle = blank(r.album()) ? UNKNOWN_ALBUM : r.album();
        String albumArtist = blank(r.albumArtist()) ? r.artist() : r.albumArtist();
        Artwork artwork = new Artwork("/api/imports/" + r.id() + "/artwork",
                r.hasArt() ? Palette.MAX_COVER : Palette.PLACEHOLDER_SIZE,
                r.hasArt() ? Palette.MAX_COVER : Palette.PLACEHOLDER_SIZE,
                r.bgColor(), r.textColor1(), r.textColor2(), r.textColor3());
        String releaseDate = r.year() != null ? r.year() + "-01-01" : r.createdAt().substring(0, 10);
        return new Song(songId, r.title(),
                new ArtistRef(ARTIST_PREFIX + slug(r.artist()), r.artist()),
                List.of(),
                new AlbumRef(ALBUM_PREFIX + slug(albumArtist + " " + albumTitle), albumTitle),
                genreId(r.genre()),
                r.trackNumber() > 0 ? r.trackNumber() : 1,
                r.discNumber() > 0 ? r.discNumber() : 1,
                r.durationMs(), false, false,
                "/api/imports/" + r.id() + "/stream",
                artwork, releaseDate, 120, "chill", 0.5, 0, "", "import", r.gainDb());
    }

    /** Maps a free-form genre tag to one of the catalog's genre ids, else "pop". */
    String genreId(String tag) {
        String g = tag == null ? "" : Normalizer.normalize(tag, Normalizer.Form.NFKD).toLowerCase(Locale.ROOT)
                .replace("&", "n").replaceAll("[^a-z0-9]", "");
        String id;
        if (g.isEmpty()) {
            id = "pop";
        } else if (g.contains("hiphop") || g.contains("rap") || g.contains("trap")) {
            id = "hiphop";
        } else if (g.contains("lofi")) {
            id = "lofi";
        } else if (g.contains("rnb") || g.contains("rhythmandblues") || g.contains("soul") || g.contains("funk")) {
            id = "rnb";
        } else if (g.contains("ambient") || g.contains("newage") || g.contains("drone")) {
            id = "ambient";
        } else if (g.contains("electr") || g.contains("edm") || g.contains("house") || g.contains("techno")
                || g.contains("trance") || g.contains("dance") || g.contains("dubstep") || g.contains("drumnbass")
                || g.contains("synth")) {
            id = "electronic";
        } else if (g.contains("indie") || g.contains("alternative") || g.contains("shoegaze")) {
            id = "indie";
        } else if (g.contains("rock") || g.contains("metal") || g.contains("punk") || g.contains("grunge")) {
            id = "rock";
        } else if (g.contains("jazz") || g.contains("blues") || g.contains("swing")) {
            id = "jazz";
        } else if (g.contains("classical") || g.contains("orchestr") || g.contains("baroque") || g.contains("opera")
                || g.contains("symphon")) {
            id = "classical";
        } else if (g.contains("country") || g.contains("folk") || g.contains("bluegrass") || g.contains("americana")) {
            id = "country";
        } else if (g.contains("latin") || g.contains("reggaeton") || g.contains("salsa") || g.contains("bachata")
                || g.contains("cumbia") || g.contains("bossa")) {
            id = "latin";
        } else {
            id = "pop";
        }
        return catalog.genre(id) != null ? id : "pop";
    }

    /** Lower-case ASCII slug ("Sample Artist" → "sample-artist"). */
    static String slug(String s) {
        String ascii = Normalizer.normalize(s == null ? "" : s, Normalizer.Form.NFKD).replaceAll("\\p{M}", "")
                .toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("(^-+|-+$)", "");
        if (ascii.length() > 48) {
            ascii = ascii.substring(0, 48).replaceAll("-+$", "");
        }
        return ascii.isEmpty() ? "unknown" : ascii;
    }

    // ------------------------------------------------------------------ helpers

    private Optional<ImportRepository.Row> row(String userId, String id) {
        String bare = bareId(id);
        if (userId == null || bare == null) {
            return Optional.empty();
        }
        return repo.findOwned(userId, bare);
    }

    private Path userDir(String userId) {
        if (!SAFE_USER.matcher(userId).matches()) {
            throw new IllegalStateException("Unexpected user id");
        }
        Path dir = root.resolve(userId).normalize();
        if (!dir.startsWith(root)) {
            throw new IllegalStateException("Unexpected user id");
        }
        return dir;
    }

    private Path file(String userId, String name) {
        Path dir = userDir(userId);
        Path p = dir.resolve(name).normalize();
        if (!p.startsWith(dir)) {
            throw notFound();
        }
        return p;
    }

    private static ApiException notFound() {
        return ApiException.notFound("No such imported track");
    }

    /** The client's file name without any directory part, for messages. */
    private static String displayName(String original) {
        if (blank(original)) {
            return "file";
        }
        String n = original.replace('\\', '/');
        n = n.substring(n.lastIndexOf('/') + 1).strip();
        return n.isEmpty() ? "file" : clip(n, 255);
    }

    /** "01 - my_song.mp3" → "01 - my song". */
    static String titleFromFilename(String name) {
        int dot = name.lastIndexOf('.');
        String base = (dot > 0 ? name.substring(0, dot) : name).replace('_', ' ').replaceAll("\\s+", " ").strip();
        return base.isEmpty() ? "Untitled" : base;
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }

    private static String clip(String s, int max) {
        String t = s == null ? "" : s.strip();
        return t.length() > max ? t.substring(0, max) : t;
    }
}
