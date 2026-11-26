package app.vybe.api.support;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import jakarta.servlet.http.Cookie;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import java.util.UUID;
import java.util.stream.Stream;

/**
 * Shared Spring context: the deterministic fixture catalog from src/test/resources/fixtures and a
 * fresh SQLite database in a temp directory. Demo seeding runs once because autoseed is on.
 */
@SpringBootTest
@AutoConfigureMockMvc
public abstract class ApiTestBase {

    public static final String SESSION = "vybe_session";
    public static final String DEMO_EMAIL = "demo@vybe.app";
    public static final String DEMO_PASSWORD = "vybe1234";

    private static final Path DB_DIR = createTempDir();

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("vybe.data-dir", () -> "src/test/resources/fixtures");
        registry.add("vybe.db-path", () -> DB_DIR.resolve("vybe.db").toString());
        registry.add("vybe.autoseed", () -> "true");
        registry.add("vybe.imports-dir", () -> DB_DIR.resolve("imports").toString());
        registry.add("vybe.world.autowarm", () -> "false"); // tests never call Apple
        registry.add("vybe.demo.refresh", () -> "false"); // other tests rely on the fixture demo library
    }

    @Autowired
    protected MockMvc mvc;

    @Autowired
    protected ObjectMapper json;

    /** Signs up a fresh user and returns the session cookie value. */
    protected String newUserSession() {
        String email = "user-" + UUID.randomUUID().toString().substring(0, 8) + "@example.com";
        MvcResult r = signUp(email, "correct-horse", "Tester");
        return r.getResponse().getCookie(SESSION).getValue();
    }

    protected MvcResult signUp(String email, String password, String displayName) {
        try {
            return mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/auth/signup")
                    .contentType("application/json")
                    .content(json.writeValueAsString(java.util.Map.of(
                            "email", email, "password", password, "displayName", displayName))))
                    .andReturn();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** Signs in as the seeded demo account and returns its session cookie value. */
    protected String signInDemo() {
        try {
            MvcResult r = mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post("/api/auth/signin")
                            .contentType("application/json")
                            .content("{\"email\":\"demo@vybe.app\",\"password\":\"vybe1234\"}"))
                    .andReturn();
            return r.getResponse().getCookie(SESSION).getValue();
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    protected Cookie cookie(String token) {
        return new Cookie(SESSION, token);
    }

    private static Path createTempDir() {
        try {
            Path dir = Files.createTempDirectory("vybe-api-test");
            Runtime.getRuntime().addShutdownHook(new Thread(() -> deleteQuietly(dir)));
            return dir;
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    private static void deleteQuietly(Path dir) {
        try (Stream<Path> walk = Files.walk(dir)) {
            walk.sorted(Comparator.reverseOrder()).forEach(p -> p.toFile().delete());
        } catch (IOException ignored) {
            // best effort
        }
    }
}
