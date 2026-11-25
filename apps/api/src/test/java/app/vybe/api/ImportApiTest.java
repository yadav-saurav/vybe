package app.vybe.api;

import app.vybe.api.support.ApiTestBase;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MvcResult;

import javax.imageio.ImageIO;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Import Music. Test audio is generated here: sine tones from ffmpeg's lavfi source with tags set via
 * {@code -metadata}, and a tiny cover drawn with ImageIO. No real music is used or committed.
 */
class ImportApiTest extends ApiTestBase {

    private static Path work;
    private static byte[] toneA;   // m4a, tagged, with an embedded cover
    private static byte[] toneB;   // mp3, tagged, no cover
    private static byte[] toneC;   // wav, no tags

    @BeforeAll
    static void generateMedia() throws Exception {
        assumeTrue(onPath("ffmpeg"), "ffmpeg is required to generate test tones");
        work = Files.createTempDirectory("vybe-import-test");
        work.toFile().deleteOnExit();

        BufferedImage img = new BufferedImage(64, 64, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = img.createGraphics();
        g.setColor(new Color(0x1d, 0x4e, 0x89));
        g.fillRect(0, 0, 64, 64);
        g.setColor(new Color(0xf2, 0xb1, 0x34));
        g.fillOval(16, 16, 32, 32);
        g.dispose();
        Path cover = work.resolve("cover.jpg");
        ImageIO.write(img, "jpg", cover.toFile());

        Path a = work.resolve("a.m4a");
        ffmpeg("-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-i", cover.toString(),
                "-map", "0:a", "-map", "1:v", "-c:a", "aac", "-b:a", "64k", "-c:v", "copy",
                "-disposition:v:0", "attached_pic",
                "-metadata", "title=Test Tone A", "-metadata", "artist=Sample Artist",
                "-metadata", "album=Test Signals", "-metadata", "genre=Electronic",
                "-metadata", "track=3/9", "-metadata", "date=2026", a.toString());
        Path b = work.resolve("b.mp3");
        ffmpeg("-f", "lavfi", "-i", "sine=frequency=660:duration=2", "-c:a", "libmp3lame", "-b:a", "64k",
                "-id3v2_version", "3",
                "-metadata", "title=Test Tone B", "-metadata", "artist=Sample Artist",
                "-metadata", "genre=Lo-Fi", b.toString());
        Path c = work.resolve("c.wav");
        ffmpeg("-f", "lavfi", "-i", "sine=frequency=550:duration=1", "-c:a", "pcm_s16le",
                "-map_metadata", "-1", "-fflags", "+bitexact", c.toString());
        toneA = Files.readAllBytes(a);
        toneB = Files.readAllBytes(b);
        toneC = Files.readAllBytes(c);
    }

    @Test
    void uploadListStreamArtworkPlaylistLibrarySearchAndDelete() throws Exception {
        String token = newUserSession();
        String other = newUserSession();

        JsonNode result = upload(token,
                file("Test Tone A.m4a", toneA), file("b.mp3", toneB),
                file("notes.txt", "not audio".getBytes(StandardCharsets.UTF_8)),
                file("fake.mp3", "plain text pretending".getBytes(StandardCharsets.UTF_8)));
        assertThat(result.path("imported")).hasSize(2);
        assertThat(result.path("skipped")).hasSize(2);
        assertThat(result.path("skipped").findValuesAsText("reason")).containsOnly("unsupported format");
        assertThat(result.path("skipped").findValuesAsText("name")).containsExactlyInAnyOrder("notes.txt", "fake.mp3");

        JsonNode a = result.path("imported").get(0);
        JsonNode b = result.path("imported").get(1);
        String idA = a.path("id").asText();
        String idB = b.path("id").asText();
        String bareA = idA.substring(3);
        assertThat(idA).matches("im_[a-z0-9]{12}");
        assertThat(a.path("source").asText()).isEqualTo("import");
        assertThat(a.path("title").asText()).isEqualTo("Test Tone A");
        assertThat(a.path("artist").path("name").asText()).isEqualTo("Sample Artist");
        assertThat(a.path("artist").path("id").asText()).isEqualTo("imar_sample-artist");
        assertThat(a.path("album").path("title").asText()).isEqualTo("Test Signals");
        assertThat(a.path("album").path("id").asText()).startsWith("imal_");
        assertThat(a.path("trackNumber").asInt()).isEqualTo(3);
        assertThat(a.path("releaseDate").asText()).isEqualTo("2026-01-01");
        assertThat(a.path("genreId").asText()).isEqualTo("pop"); // "Electronic" is not in the fixture catalog
        assertThat(b.path("genreId").asText()).isEqualTo("lofi");
        assertThat(a.path("durationMs").asLong()).isBetween(1500L, 2600L);
        assertThat(b.path("durationMs").asLong()).isBetween(1500L, 2600L);
        assertThat(a.path("audioUrl").asText()).isEqualTo("/api/imports/" + bareA + "/stream");
        assertThat(a.path("artwork").path("url").asText()).isEqualTo("/api/imports/" + bareA + "/artwork");
        assertThat(a.path("artwork").path("bgColor").asText()).matches("#[0-9a-f]{6}");
        assertThat(a.path("artwork").path("textColor1").asText()).isIn("#000000", "#ffffff");
        assertThat(a.path("hasLyrics").asBoolean()).isFalse();
        assertThat(a.path("isExplicit").asBoolean()).isFalse();
        assertThat(a.path("popularity").asInt()).isZero();
        assertThat(a.path("featuring")).isEmpty();

        // Newest first.
        mvc.perform(get("/api/me/imports").cookie(cookie(token))).andExpect(status().isOk())
                .andExpect(jsonPath("$.songs.length()").value(2))
                .andExpect(jsonPath("$.songs[0].id").value(idB))
                .andExpect(jsonPath("$.songs[1].id").value(idA));

        // Duplicates are skipped.
        JsonNode again = upload(token, file("copy.m4a", toneA));
        assertThat(again.path("imported")).isEmpty();
        assertThat(again.path("skipped").get(0).path("reason").asText()).isEqualTo("already imported");

        // Streaming: full body, Range 206, unsatisfiable 416, right content type.
        MvcResult full = mvc.perform(get(a.path("audioUrl").asText()).cookie(cookie(token)))
                .andExpect(status().isOk())
                .andExpect(header().string("Accept-Ranges", "bytes"))
                .andExpect(content().contentType("audio/mp4")).andReturn();
        assertThat(full.getResponse().getContentAsByteArray()).isEqualTo(toneA);
        MvcResult part = mvc.perform(get(a.path("audioUrl").asText()).cookie(cookie(token)).header("Range", "bytes=0-99"))
                .andExpect(status().isPartialContent())
                .andExpect(header().string("Content-Range", "bytes 0-99/" + toneA.length)).andReturn();
        assertThat(part.getResponse().getContentAsByteArray()).isEqualTo(java.util.Arrays.copyOf(toneA, 100));
        mvc.perform(get(a.path("audioUrl").asText()).cookie(cookie(token)).header("Range", "bytes=" + (toneA.length + 10) + "-"))
                .andExpect(status().isRequestedRangeNotSatisfiable());
        mvc.perform(get(b.path("audioUrl").asText()).cookie(cookie(token)))
                .andExpect(status().isOk()).andExpect(content().contentType("audio/mpeg"));

        // Artwork: the embedded cover re-encoded as JPEG; a generated gradient PNG without one.
        MvcResult artA = mvc.perform(get(a.path("artwork").path("url").asText() + "?w=160").cookie(cookie(token)))
                .andExpect(status().isOk()).andExpect(content().contentType("image/jpeg")).andReturn();
        BufferedImage coverA = ImageIO.read(new ByteArrayInputStream(artA.getResponse().getContentAsByteArray()));
        assertThat(coverA.getWidth()).isEqualTo(64);
        MvcResult artB = mvc.perform(get(b.path("artwork").path("url").asText()).cookie(cookie(token)))
                .andExpect(status().isOk()).andExpect(content().contentType("image/png")).andReturn();
        assertThat(ImageIO.read(new ByteArrayInputStream(artB.getResponse().getContentAsByteArray()))).isNotNull();

        // Song lookups.
        mvc.perform(get("/api/songs/" + idA).cookie(cookie(token))).andExpect(status().isOk())
                .andExpect(jsonPath("$.song.title").value("Test Tone A"));
        mvc.perform(get("/api/songs?ids=" + idA + ",so_0001," + idB).cookie(cookie(token)))
                .andExpect(jsonPath("$.songs[*].id", contains(idA, "so_0001", idB)));

        // Library: imports are included automatically; explicit add and love work too.
        mvc.perform(get("/api/me/library").cookie(cookie(token)))
                .andExpect(jsonPath("$.songIds", hasItems(idA, idB)));
        mvc.perform(put("/api/me/library/song/" + idA).cookie(cookie(token))).andExpect(status().isOk())
                .andExpect(jsonPath("$.songIds", hasItem(idA)));
        mvc.perform(put("/api/me/loves/song/" + idA).cookie(cookie(token))).andExpect(status().isOk())
                .andExpect(jsonPath("$.lovedIds", hasItem(idA)));
        mvc.perform(get("/api/me/library/songs").cookie(cookie(token)))
                .andExpect(jsonPath("$.songs[*].id", hasItems(idA, idB)));
        mvc.perform(get("/api/me/recently-added").cookie(cookie(token)))
                .andExpect(jsonPath("$.items[*].data.id", hasItems(idA, idB)));

        // Playlists: own imports resolve; they stay hidden from everyone else.
        MvcResult created = mvc.perform(post("/api/me/playlists").cookie(cookie(token)).contentType("application/json")
                        .content("{\"name\":\"Tones\",\"trackIds\":[\"" + idA + "\",\"so_0001\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.playlist.trackIds", contains(idA, "so_0001")))
                .andExpect(jsonPath("$.playlist.durationMs").value(greaterThan(2000)))
                .andReturn();
        String playlistId = json.readTree(created.getResponse().getContentAsString()).path("playlist").path("id").asText();
        mvc.perform(post("/api/me/playlists/" + playlistId + "/tracks").cookie(cookie(token)).contentType("application/json")
                        .content("{\"trackIds\":[\"" + idB + "\"]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.playlist.trackIds", contains(idA, "so_0001", idB)));
        mvc.perform(patch("/api/me/playlists/" + playlistId).cookie(cookie(token)).contentType("application/json")
                        .content("{\"isPublic\":true,\"trackIds\":[\"" + idB + "\",\"" + idA + "\",\"so_0001\"]}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.playlist.trackIds", contains(idB, idA, "so_0001")));
        mvc.perform(get("/api/playlists/" + playlistId).cookie(cookie(token)))
                .andExpect(jsonPath("$.tracks[*].id", contains(idB, idA, "so_0001")));
        mvc.perform(get("/api/playlists/" + playlistId).cookie(cookie(other)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.playlist.trackIds", contains("so_0001")))
                .andExpect(jsonPath("$.tracks[*].id", contains("so_0001")));
        mvc.perform(get("/api/playlists/" + playlistId))
                .andExpect(jsonPath("$.tracks[*].id", contains("so_0001")));

        // History.
        mvc.perform(post("/api/me/history").cookie(cookie(token)).contentType("application/json")
                        .content("{\"songId\":\"" + idA + "\",\"playedMs\":1500}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/me/history").cookie(cookie(token)))
                .andExpect(jsonPath("$.entries[0].songId").value(idA))
                .andExpect(jsonPath("$.entries[0].song.title").value("Test Tone A"));
        // Mixes, Recently Played and the Home page ignore imported plays rather than failing.
        mvc.perform(get("/api/pages/home").cookie(cookie(token))).andExpect(status().isOk());
        mvc.perform(get("/api/playlists/pl_mix_favorites_" + userId(token)).cookie(cookie(token)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.playlist.trackIds", not(hasItem(idA))));

        // Search finds the owner's imports, in songs and top; nobody else sees them.
        mvc.perform(get("/api/search?term=test tone").cookie(cookie(token))).andExpect(status().isOk())
                .andExpect(jsonPath("$.songs[*].id", hasItems(idA, idB)))
                .andExpect(jsonPath("$.top[*].data.id", hasItem(idA)));
        mvc.perform(get("/api/search?term=sample artist").cookie(cookie(token)))
                .andExpect(jsonPath("$.songs[*].id", hasItems(idA, idB)));
        mvc.perform(get("/api/search?term=test tone").cookie(cookie(other)))
                .andExpect(jsonPath("$.songs[*].id", not(hasItem(idA))));
        mvc.perform(get("/api/search?term=test tone"))
                .andExpect(jsonPath("$.songs[*].id", not(hasItem(idA))));

        // Autoplay seeded by an import continues with catalog songs; for others it is simply empty.
        mvc.perform(get("/api/recommendations/autoplay?songId=" + idA + "&count=3").cookie(cookie(token)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.songs.length()").value(3));
        mvc.perform(get("/api/recommendations/autoplay?songId=" + idA))
                .andExpect(status().isOk()).andExpect(jsonPath("$.songs.length()").value(0));

        // Another user gets 404 everywhere and cannot reference the track.
        mvc.perform(get(a.path("audioUrl").asText()).cookie(cookie(other))).andExpect(status().isNotFound());
        mvc.perform(get(a.path("artwork").path("url").asText()).cookie(cookie(other))).andExpect(status().isNotFound());
        mvc.perform(get("/api/songs/" + idA).cookie(cookie(other))).andExpect(status().isNotFound());
        mvc.perform(get("/api/songs/" + idA)).andExpect(status().isNotFound());
        mvc.perform(get("/api/songs?ids=" + idA).cookie(cookie(other))).andExpect(jsonPath("$.songs.length()").value(0));
        mvc.perform(delete("/api/me/imports/" + idA).cookie(cookie(other))).andExpect(status().isNotFound());
        mvc.perform(put("/api/me/library/song/" + idA).cookie(cookie(other))).andExpect(status().isNotFound());
        mvc.perform(post("/api/me/history").cookie(cookie(other)).contentType("application/json")
                .content("{\"songId\":\"" + idA + "\"}")).andExpect(status().isBadRequest());
        mvc.perform(post("/api/me/playlists").cookie(cookie(other)).contentType("application/json")
                        .content("{\"name\":\"Steal\",\"trackIds\":[\"" + idA + "\"]}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("unknown_track"));
        mvc.perform(get("/api/me/imports").cookie(cookie(other))).andExpect(jsonPath("$.songs.length()").value(0));

        // Delete removes the files, row and every reference.
        mvc.perform(delete("/api/me/imports/" + idA).cookie(cookie(token)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.ok").value(true));
        mvc.perform(get(a.path("audioUrl").asText()).cookie(cookie(token))).andExpect(status().isNotFound());
        mvc.perform(get(a.path("artwork").path("url").asText()).cookie(cookie(token))).andExpect(status().isNotFound());
        mvc.perform(get("/api/me/library").cookie(cookie(token)))
                .andExpect(jsonPath("$.songIds", not(hasItem(idA))))
                .andExpect(jsonPath("$.lovedIds", not(hasItem(idA))));
        mvc.perform(get("/api/me/history").cookie(cookie(token)))
                .andExpect(jsonPath("$.entries[*].songId", not(hasItem(idA))));
        mvc.perform(get("/api/playlists/" + playlistId).cookie(cookie(token)))
                .andExpect(jsonPath("$.playlist.trackIds", contains(idB, "so_0001")));
        mvc.perform(delete("/api/me/imports/" + idA).cookie(cookie(token))).andExpect(status().isNotFound());
        // The bare id form is accepted too.
        mvc.perform(delete("/api/me/imports/" + idB.substring(3)).cookie(cookie(token))).andExpect(status().isOk());
        mvc.perform(get("/api/me/imports").cookie(cookie(token))).andExpect(jsonPath("$.songs.length()").value(0));
        mvc.perform(get("/api/playlists/" + playlistId).cookie(cookie(token)))
                .andExpect(jsonPath("$.playlist.trackIds", contains("so_0001")));

        Path userDir = importsRoot().resolve(userId(token));
        try (var files = Files.list(userDir)) {
            assertThat(files.toList()).isEmpty();
        }
    }

    @Test
    void untaggedFilesFallBackToFilenameAndUnknownArtist() throws Exception {
        String token = newUserSession();
        JsonNode r = upload(token, file("my_field_recording.wav", toneC));
        JsonNode song = r.path("imported").get(0);
        assertThat(song.path("title").asText()).isEqualTo("my field recording");
        assertThat(song.path("artist").path("name").asText()).isEqualTo("Unknown Artist");
        assertThat(song.path("album").path("title").asText()).isEqualTo("Unknown Album");
        assertThat(song.path("genreId").asText()).isEqualTo("pop");
        assertThat(song.path("durationMs").asLong()).isBetween(800L, 1300L);
        mvc.perform(get(song.path("audioUrl").asText()).cookie(cookie(token)))
                .andExpect(status().isOk()).andExpect(content().contentType("audio/wav"));
        mvc.perform(delete("/api/me/imports/" + song.path("id").asText()).cookie(cookie(token))).andExpect(status().isOk());
    }

    @Test
    void anonymousRequestsAre401() throws Exception {
        mvc.perform(multipart("/api/me/imports").file(file("a.m4a", toneA))).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/me/imports")).andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/me/imports/im_abcdefghijkm")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/imports/abcdefghijkm/stream")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/imports/abcdefghijkm/artwork")).andExpect(status().isUnauthorized());
    }

    @Test
    void badFileTypesAreSkippedAndEmptyUploadsRejected() throws Exception {
        String token = newUserSession();
        BufferedImage img = new BufferedImage(8, 8, BufferedImage.TYPE_INT_RGB);
        java.io.ByteArrayOutputStream png = new java.io.ByteArrayOutputStream();
        ImageIO.write(img, "png", png);
        JsonNode r = upload(token, file("cover.png", png.toByteArray()), file("picture.m4a", png.toByteArray()),
                file("noextension", toneA));
        assertThat(r.path("imported")).isEmpty();
        assertThat(r.path("skipped")).hasSize(3);
        assertThat(r.path("skipped").findValuesAsText("reason")).containsOnly("unsupported format");

        mvc.perform(multipart("/api/me/imports").cookie(cookie(token)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("no_files"));
        mvc.perform(get("/api/imports/not-an-id/stream").cookie(cookie(token))).andExpect(status().isNotFound());
        mvc.perform(get("/api/imports/..%2F..%2Fvybe.db/stream").cookie(cookie(token))).andExpect(status().isNotFound());
    }

    @Test
    void filesOverTheSizeLimitAreRejected() throws Exception {
        String token = newUserSession();
        byte[] big = new byte[50 * 1024 * 1024 + 1];
        System.arraycopy(toneB, 0, big, 0, Math.min(toneB.length, big.length));
        JsonNode r = upload(token, file("huge.mp3", big), file("b.mp3", toneB));
        assertThat(r.path("imported")).hasSize(1);
        assertThat(r.path("skipped").get(0).path("name").asText()).isEqualTo("huge.mp3");
        assertThat(r.path("skipped").get(0).path("reason").asText()).startsWith("too large");
        mvc.perform(delete("/api/me/imports/" + r.path("imported").get(0).path("id").asText()).cookie(cookie(token)))
                .andExpect(status().isOk());
    }

    // ------------------------------------------------------------------ helpers

    private JsonNode upload(String token, MockMultipartFile... files) throws Exception {
        var req = multipart("/api/me/imports");
        for (MockMultipartFile f : files) {
            req.file(f);
        }
        MvcResult r = mvc.perform(req.cookie(cookie(token))).andExpect(status().isOk()).andReturn();
        return json.readTree(r.getResponse().getContentAsString());
    }

    private static MockMultipartFile file(String name, byte[] bytes) {
        return new MockMultipartFile("files", name, "application/octet-stream", bytes);
    }

    private String userId(String token) throws Exception {
        MvcResult r = mvc.perform(get("/api/auth/me").cookie(cookie(token))).andReturn();
        return json.readTree(r.getResponse().getContentAsString()).path("user").path("id").asText();
    }

    @org.springframework.beans.factory.annotation.Autowired
    private app.vybe.api.config.VybeProperties props;

    private Path importsRoot() {
        return props.importsDirectory();
    }

    private static void ffmpeg(String... args) throws Exception {
        List<String> cmd = new ArrayList<>(List.of("ffmpeg", "-hide_banner", "-loglevel", "error", "-y"));
        cmd.addAll(List.of(args));
        Process p = new ProcessBuilder(cmd).redirectErrorStream(true).start();
        String out = new String(p.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
        assertThat(p.waitFor(60, TimeUnit.SECONDS)).isTrue();
        assertThat(p.exitValue()).as(out).isZero();
    }

    private static boolean onPath(String exe) {
        String path = System.getenv("PATH");
        if (path == null) {
            return false;
        }
        for (String dir : path.split(File.pathSeparator)) {
            if (Files.isExecutable(Path.of(dir, exe))) {
                return true;
            }
        }
        return false;
    }
}
