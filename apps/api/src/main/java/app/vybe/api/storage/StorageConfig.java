package app.vybe.api.storage;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** Picks Supabase Storage for private imports when configured; otherwise local disk. */
@Configuration
public class StorageConfig {
    private static final Logger log = LoggerFactory.getLogger(StorageConfig.class);

    @Bean
    public BlobStore importsBlobStore(@Value("${SUPABASE_URL:}") String url,
                                      @Value("${SUPABASE_SERVICE_KEY:}") String serviceKey,
                                      @Value("${VYBE_IMPORTS_BUCKET:vybe-imports}") String bucket) {
        if (!url.isBlank() && !serviceKey.isBlank()) {
            log.info("Imports stored in Supabase bucket '{}'", bucket);
            return new SupabaseBlobStore(url, bucket, serviceKey);
        }
        return new LocalBlobStore();
    }
}
