package app.vybe.api.media;

import app.vybe.api.config.VybeProperties;
import app.vybe.api.error.ApiException;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;

/**
 * Resolves artwork and audio files under the data directory. Names are whitelisted by pattern and
 * the resolved path must stay inside the media directory, so no request can escape it.
 */
@Service
public class MediaService {

    private static final Pattern ART_NAME = Pattern.compile("[A-Za-z0-9][A-Za-z0-9_-]{0,63}\\.webp");
    private static final Pattern SONG_ID = Pattern.compile("[A-Za-z0-9][A-Za-z0-9_-]{0,63}");

    private final Path artDir;
    private final Path audioDir;

    public MediaService(VybeProperties props) {
        Path media = props.dataDirectory().resolve("media");
        this.artDir = media.resolve("art");
        this.audioDir = media.resolve("audio");
    }

    /**
     * Artwork file for {@code file}. When {@code width} is given, the nearest pre-sized variant is
     * preferred: width up to 160 selects {@code _160}, up to 400 selects {@code _400}, else the full file.
     */
    public Resource art(String file, Integer width) {
        if (!ART_NAME.matcher(file).matches()) {
            throw ApiException.notFound("No such artwork");
        }
        List<String> candidates = new ArrayList<>(2);
        String base = file.substring(0, file.length() - ".webp".length());
        boolean isVariant = base.endsWith("_160") || base.endsWith("_400");
        if (width != null && !isVariant) {
            if (width <= 160) {
                candidates.add(base + "_160.webp");
            } else if (width <= 400) {
                candidates.add(base + "_400.webp");
            }
        }
        candidates.add(file);
        for (String name : candidates) {
            Path p = artDir.resolve(name).normalize();
            if (p.startsWith(artDir) && Files.isRegularFile(p)) {
                return new FileSystemResource(p);
            }
        }
        throw ApiException.notFound("No such artwork");
    }

    public Resource audio(String songId) {
        if (!SONG_ID.matcher(songId).matches()) {
            throw ApiException.notFound("No audio for song " + songId);
        }
        Path p = audioDir.resolve(songId + ".m4a").normalize();
        if (!p.startsWith(audioDir) || !Files.isRegularFile(p)) {
            throw ApiException.notFound("No audio for song " + songId);
        }
        return new FileSystemResource(p);
    }
}
