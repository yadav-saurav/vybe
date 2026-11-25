package app.vybe.api;

import app.vybe.api.support.ApiTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class MediaApiTest extends ApiTestBase {

    private static final Path ART = Path.of("src/test/resources/fixtures/media/art");
    private static final Path AUDIO = Path.of("src/test/resources/fixtures/media/audio");

    @Test
    void artworkIsImmutableAndVariantsFollowWidth() throws Exception {
        MvcResult full = mvc.perform(get("/media/art/al_001.webp")).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", containsString("max-age=31536000")))
                .andExpect(header().string("Cache-Control", containsString("immutable")))
                .andExpect(content().contentType("image/webp"))
                .andReturn();
        assertThat(full.getResponse().getContentAsByteArray()).isEqualTo(Files.readAllBytes(ART.resolve("al_001.webp")));

        assertThat(mvc.perform(get("/media/art/al_001.webp?w=100")).andReturn().getResponse().getContentAsByteArray())
                .isEqualTo(Files.readAllBytes(ART.resolve("al_001_160.webp")));
        assertThat(mvc.perform(get("/media/art/al_001.webp?w=300")).andReturn().getResponse().getContentAsByteArray())
                .isEqualTo(Files.readAllBytes(ART.resolve("al_001_400.webp")));
        assertThat(mvc.perform(get("/media/art/al_001.webp?w=1000")).andReturn().getResponse().getContentAsByteArray())
                .isEqualTo(Files.readAllBytes(ART.resolve("al_001.webp")));
    }

    @Test
    void artworkRejectsTraversalAndMissingFiles() throws Exception {
        mvc.perform(get("/media/art/..%2Fcatalog.json")).andExpect(status().isNotFound());
        mvc.perform(get("/media/art/..%2F..%2Fetc%2Fpasswd")).andExpect(status().isNotFound());
        mvc.perform(get("/media/art/missing.webp")).andExpect(status().isNotFound());
        mvc.perform(get("/media/art/al_001.png")).andExpect(status().isNotFound());
    }

    @Test
    void streamServesFullFileWithRangeHeaders() throws Exception {
        byte[] file = Files.readAllBytes(AUDIO.resolve("so_0001.m4a"));
        MvcResult r = mvc.perform(get("/api/stream/so_0001")).andExpect(status().isOk())
                .andExpect(header().string("Accept-Ranges", "bytes"))
                .andExpect(content().contentType("audio/mp4"))
                .andReturn();
        assertThat(r.getResponse().getContentAsByteArray()).isEqualTo(file);
    }

    @Test
    void rangeRequestsReturn206WithCorrectBytes() throws Exception {
        byte[] file = Files.readAllBytes(AUDIO.resolve("so_0001.m4a"));
        MvcResult r = mvc.perform(get("/api/stream/so_0001").header("Range", "bytes=0-99"))
                .andExpect(status().isPartialContent())
                .andExpect(header().string("Content-Range", "bytes 0-99/" + file.length))
                .andExpect(header().string("Accept-Ranges", "bytes"))
                .andReturn();
        byte[] body = r.getResponse().getContentAsByteArray();
        assertThat(body).hasSize(100);
        assertThat(body).isEqualTo(java.util.Arrays.copyOfRange(file, 0, 100));

        MvcResult tail = mvc.perform(get("/api/stream/so_0001").header("Range", "bytes=" + (file.length - 50) + "-"))
                .andExpect(status().isPartialContent()).andReturn();
        assertThat(tail.getResponse().getContentAsByteArray()).hasSize(50);
    }

    @Test
    void unsatisfiableRangeIs416() throws Exception {
        byte[] file = Files.readAllBytes(AUDIO.resolve("so_0001.m4a"));
        mvc.perform(get("/api/stream/so_0001").header("Range", "bytes=" + (file.length + 1000) + "-"))
                .andExpect(status().isRequestedRangeNotSatisfiable());
    }

    @Test
    void missingAudioIs404() throws Exception {
        mvc.perform(get("/api/stream/so_0099")).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
    }
}
