package app.vybe.api;

import app.vybe.api.support.ApiTestBase;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Import storage limits: a file that would push a listener past their allowance is skipped with a reason. */
class ImportQuotaApiTest extends ApiTestBase {

    private static Path big, small;

    @DynamicPropertySource
    static void quota(DynamicPropertyRegistry registry) {
        registry.add("vybe.imports.max-user-mb", () -> "1");
    }

    @BeforeAll
    static void media() throws Exception {
        boolean ffmpeg = new ProcessBuilder("ffmpeg", "-version").start().waitFor() == 0;
        assumeTrue(ffmpeg, "ffmpeg is required to generate test tones");
        Path dir = Files.createTempDirectory("vybe-quota");
        big = dir.resolve("big.mp3");     // ~1.2 MB: over a 1 MB allowance on its own
        small = dir.resolve("small.mp3"); // ~16 KB
        run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=30",
                "-metadata", "title=Big Tone", "-c:a", "libmp3lame", "-b:a", "320k", big.toString());
        run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=660:duration=2",
                "-metadata", "title=Small Tone", "-c:a", "libmp3lame", "-b:a", "64k", small.toString());
    }

    private static void run(String... cmd) throws Exception {
        assertThat(new ProcessBuilder(List.of(cmd)).inheritIO().start().waitFor()).isZero();
    }

    private JsonNode upload(String token, Path file) throws Exception {
        String body = mvc.perform(multipart("/api/me/imports").file(new MockMultipartFile("files", file.getFileName().toString(),
                        "audio/mpeg", Files.readAllBytes(file))).cookie(cookie(token)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        return json.readTree(body);
    }

    @Test
    void filesBeyondTheListenerAllowanceAreSkippedWithAReason() throws Exception {
        String token = newUserSession();
        JsonNode over = upload(token, big);
        assertThat(over.get("imported")).isEmpty();
        assertThat(over.get("skipped").get(0).get("reason").asText()).contains("storage limit reached");
        JsonNode ok = upload(token, small);
        assertThat(ok.get("imported").get(0).get("title").asText()).isEqualTo("Small Tone");
    }
}
