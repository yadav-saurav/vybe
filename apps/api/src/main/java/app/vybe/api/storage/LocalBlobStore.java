package app.vybe.api.storage;

import java.net.URI;
import java.nio.file.Path;
import java.time.Duration;

/** Default: files stay on local disk where ImportService already writes them; nothing to upload. */
public class LocalBlobStore implements BlobStore {
    @Override public boolean remote() { return false; }
    @Override public void put(String key, Path file, String contentType) { /* already on disk */ }
    @Override public URI signedUrl(String key, Duration ttl) { throw new UnsupportedOperationException("local storage serves files directly"); }
    @Override public void delete(String... keys) { /* ImportService deletes local files itself */ }
}
