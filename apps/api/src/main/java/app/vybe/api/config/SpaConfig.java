package app.vybe.api.config;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

/**
 * Production mode: serves the built web app ({@code apps/web/dist}) from the API so a single
 * process runs all of Vybe. Hashed assets are cached forever; every other non-API path falls back
 * to {@code index.html} so client-side routes (/album/..., /library/...) work on reload.
 * Disabled automatically when the directory does not exist (e.g. during `npm run dev`).
 */
@Configuration
public class SpaConfig implements WebMvcConfigurer {

    private static final Logger log = LoggerFactory.getLogger(SpaConfig.class);
    private final Path webDir;

    public SpaConfig(@Value("${vybe.web-dir:${VYBE_WEB_DIR:../web/dist}}") String webDir) {
        this.webDir = Path.of(webDir).toAbsolutePath().normalize();
    }

    private boolean enabled() {
        return Files.isRegularFile(webDir.resolve("index.html"));
    }

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        if (enabled()) {
            registry.addViewController("/").setViewName("forward:/index.html");
        }
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        if (!enabled()) {
            log.info("Web build not found at {}; API-only mode", webDir);
            return;
        }
        log.info("Serving web app from {}", webDir);
        String location = webDir.toUri().toString();
        registry.addResourceHandler("/assets/**")
                .addResourceLocations(location + "assets/")
                .setCacheControl(CacheControl.maxAge(java.time.Duration.ofDays(365)).cachePublic().immutable());
        registry.addResourceHandler("/**")
                .addResourceLocations(location)
                .setCacheControl(CacheControl.noCache())
                .resourceChain(false)
                .addResolver(new PathResourceResolver() {
                    @Override
                    protected Resource getResource(String resourcePath, Resource location) throws IOException {
                        // Unknown API/media paths must stay 404s, not the app shell.
                        if (resourcePath.startsWith("api/") || resourcePath.startsWith("media/")) {
                            return null;
                        }
                        Resource requested = location.createRelative(resourcePath);
                        if (requested.exists() && requested.isReadable()) {
                            return requested;
                        }
                        return new FileSystemResource(webDir.resolve("index.html"));
                    }
                });
    }
}
