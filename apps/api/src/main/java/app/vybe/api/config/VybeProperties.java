package app.vybe.api.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.nio.file.Path;

/**
 * Vybe-specific configuration, bound from the {@code vybe.*} namespace.
 *
 * @param dataDir  directory holding catalog.json, lyrics.json and media/ (relative paths resolve against the CWD)
 * @param dbPath   SQLite database file
 * @param autoseed whether to create the demo user when the database has no users
 */
@ConfigurationProperties(prefix = "vybe")
public record VybeProperties(String dataDir, String dbPath, boolean autoseed) {

    /** Absolute, normalized data directory. */
    public Path dataDirectory() {
        return Path.of(dataDir).toAbsolutePath().normalize();
    }

    /** Absolute, normalized database file. */
    public Path databaseFile() {
        return Path.of(dbPath).toAbsolutePath().normalize();
    }
}
