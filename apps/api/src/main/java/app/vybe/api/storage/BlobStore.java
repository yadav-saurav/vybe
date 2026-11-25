package app.vybe.api.storage;

import java.io.IOException;
import java.net.URI;
import java.nio.file.Path;
import java.time.Duration;

/**
 * Where private user files (imported audio and covers) live. Locally they stay on disk; in hosted
 * deployments with an ephemeral filesystem they are pushed to object storage and served through
 * short-lived signed URLs. Keys look like {@code <userId>/<fileName>}.
 */
public interface BlobStore {

    /** True when files live in remote storage (callers then upload and redirect instead of serving disk files). */
    boolean remote();

    void put(String key, Path file, String contentType) throws IOException;

    /** A short-lived URL that grants read access to one object. */
    URI signedUrl(String key, Duration ttl) throws IOException;

    void delete(String... keys);
}
