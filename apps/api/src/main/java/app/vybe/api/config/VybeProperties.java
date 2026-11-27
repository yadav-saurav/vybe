package app.vybe.api.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

import java.nio.file.Path;

/**
 * Vybe-specific configuration, bound from the {@code vybe.*} namespace.
 *
 * @param dataDir  directory for local state (relative paths resolve against the CWD)
 * @param dbPath   SQLite database file
 * @param autoseed whether to create the demo user when the database has no users
 * @param importsDir directory for users' imported audio ({@code <importsDir>/<userId>/}); defaults to {@code <dataDir>/imports}
 */
@ConfigurationProperties(prefix = "vybe")
public record VybeProperties(String dataDir, String dbPath, boolean autoseed, String importsDir) {

    /** Absolute, normalized directory holding every user's imported files. */
    public Path importsDirectory() {
        String dir = importsDir == null || importsDir.isBlank() ? null : importsDir;
        return (dir == null ? dataDirectory().resolve("imports") : Path.of(dir)).toAbsolutePath().normalize();
    }

    /** Absolute, normalized data directory. */
    public Path dataDirectory() {
        return Path.of(dataDir).toAbsolutePath().normalize();
    }

    /** Absolute, normalized database file. */
    public Path databaseFile() {
        return Path.of(dbPath).toAbsolutePath().normalize();
    }
}
