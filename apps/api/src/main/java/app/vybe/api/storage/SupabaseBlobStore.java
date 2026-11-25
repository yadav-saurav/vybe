package app.vybe.api.storage;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Arrays;

/**
 * Supabase Storage (REST) for a private bucket. Uses the service-role key, which must only ever
 * live in server-side environment variables. See https://supabase.com/docs/reference/api.
 */
public class SupabaseBlobStore implements BlobStore {

    private static final Logger log = LoggerFactory.getLogger(SupabaseBlobStore.class);
    private final String base;   // https://<project>.supabase.co/storage/v1
    private final String bucket;
    private final String key;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final ObjectMapper json = new ObjectMapper();

    public SupabaseBlobStore(String projectUrl, String bucket, String serviceKey) {
        this.base = projectUrl.replaceAll("/+$", "") + "/storage/v1";
        this.bucket = bucket;
        this.key = serviceKey;
    }

    @Override public boolean remote() { return true; }

    private HttpRequest.Builder req(String path) {
        return HttpRequest.newBuilder(URI.create(base + path))
                .timeout(Duration.ofSeconds(120))
                .header("Authorization", "Bearer " + key)
                .header("apikey", key);
    }

    private static String encode(String objectKey) {
        return String.join("/", Arrays.stream(objectKey.split("/"))
                .map(p -> URLEncoder.encode(p, StandardCharsets.UTF_8).replace("+", "%20")).toList());
    }

    @Override
    public void put(String objectKey, Path file, String contentType) throws IOException {
        HttpRequest r = req("/object/" + bucket + "/" + encode(objectKey))
                .header("Content-Type", contentType)
                .header("x-upsert", "true")
                .POST(HttpRequest.BodyPublishers.ofFile(file)).build();
        HttpResponse<String> res = send(r);
        if (res.statusCode() / 100 != 2) {
            throw new IOException("Supabase upload failed (" + res.statusCode() + "): " + res.body());
        }
    }

    @Override
    public URI signedUrl(String objectKey, Duration ttl) throws IOException {
        HttpRequest r = req("/object/sign/" + bucket + "/" + encode(objectKey))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"expiresIn\":" + ttl.toSeconds() + "}")).build();
        HttpResponse<String> res = send(r);
        if (res.statusCode() / 100 != 2) {
            throw new IOException("Supabase sign failed (" + res.statusCode() + "): " + res.body());
        }
        JsonNode body = json.readTree(res.body());
        String signed = body.hasNonNull("signedURL") ? body.get("signedURL").asText() : body.path("signedUrl").asText();
        if (signed.isBlank()) throw new IOException("Supabase sign returned no URL");
        return URI.create(signed.startsWith("http") ? signed : base + (signed.startsWith("/") ? "" : "/") + signed);
    }

    @Override
    public void delete(String... keys) {
        if (keys.length == 0) return;
        try {
            String body = json.writeValueAsString(java.util.Map.of("prefixes", keys));
            HttpRequest r = req("/object/" + bucket)
                    .header("Content-Type", "application/json")
                    .method("DELETE", HttpRequest.BodyPublishers.ofString(body)).build();
            HttpResponse<String> res = send(r);
            if (res.statusCode() / 100 != 2) log.warn("Supabase delete failed ({}): {}", res.statusCode(), res.body());
        } catch (IOException e) {
            log.warn("Supabase delete failed: {}", e.toString());
        }
    }

    private HttpResponse<String> send(HttpRequest r) throws IOException {
        try {
            return http.send(r, HttpResponse.BodyHandlers.ofString());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IOException("interrupted", e);
        }
    }
}
