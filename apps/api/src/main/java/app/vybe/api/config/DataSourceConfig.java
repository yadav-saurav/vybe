package app.vybe.api.config;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.datasource.init.DatabasePopulatorUtils;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;

import javax.sql.DataSource;
import java.io.IOException;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Data source + schema. Two modes:
 * <ul>
 *   <li><b>SQLite</b> (default, local/dev): a single-connection pool, since SQLite serializes writers;
 *       WAL keeps readers unblocked and busy_timeout absorbs short lock contention.</li>
 *   <li><b>PostgreSQL</b> when {@code vybe.database-url} / {@code VYBE_DATABASE_URL} is set, e.g. a Neon
 *       connection string {@code postgresql://user:pass@host/db?sslmode=require}. Used for hosted
 *       deployments whose filesystem is ephemeral.</li>
 * </ul>
 * The matching idempotent schema is applied here, so it always runs before seeding.
 */
@Configuration
public class DataSourceConfig {

    private static final Logger log = LoggerFactory.getLogger(DataSourceConfig.class);

    @Bean
    public DataSource dataSource(VybeProperties props, @Value("${vybe.database-url:}") String databaseUrl) throws IOException {
        HikariDataSource ds = databaseUrl == null || databaseUrl.isBlank() ? sqlite(props) : postgres(databaseUrl);
        String schema = ds.getJdbcUrl().startsWith("jdbc:postgresql:") ? "schema-postgres.sql" : "schema.sql";
        ResourceDatabasePopulator populator = new ResourceDatabasePopulator(new ClassPathResource(schema));
        DatabasePopulatorUtils.execute(populator, ds);
        migrate(ds);
        return ds;
    }

    /**
     * Additive column migrations for databases created by older versions. Each statement is attempted
     * independently; "already exists" / "duplicate column" errors mean it was applied before.
     */
    private static final String[] MIGRATIONS = {
            "ALTER TABLE imported_tracks ADD COLUMN gain_db REAL",
            "ALTER TABLE user_playlists ADD COLUMN is_collaborative INTEGER NOT NULL DEFAULT 0",
    };

    private static void migrate(DataSource ds) {
        for (String sql : MIGRATIONS) {
            try (var c = ds.getConnection(); var st = c.createStatement()) {
                st.execute(sql);
                log.info("Applied migration: {}", sql);
            } catch (java.sql.SQLException e) {
                String msg = String.valueOf(e.getMessage()).toLowerCase();
                if (!msg.contains("duplicate column") && !msg.contains("already exists")) {
                    log.warn("Migration failed ({}): {}", sql, e.getMessage());
                }
            }
        }
    }

    private static HikariDataSource sqlite(VybeProperties props) throws IOException {
        Path db = props.databaseFile();
        Files.createDirectories(db.getParent());
        HikariConfig cfg = new HikariConfig();
        cfg.setPoolName("vybe-sqlite");
        cfg.setDriverClassName("org.sqlite.JDBC");
        cfg.setJdbcUrl("jdbc:sqlite:" + db + "?journal_mode=WAL&busy_timeout=5000&foreign_keys=true&synchronous=NORMAL");
        cfg.setMaximumPoolSize(1);
        cfg.setMinimumIdle(1);
        return new HikariDataSource(cfg);
    }

    /** Accepts {@code postgres://}, {@code postgresql://} or a ready {@code jdbc:postgresql://} URL. */
    static HikariConfig postgresConfig(String url) {
        HikariConfig cfg = new HikariConfig();
        cfg.setPoolName("vybe-postgres");
        cfg.setDriverClassName("org.postgresql.Driver");
        if (url.startsWith("jdbc:")) {
            cfg.setJdbcUrl(url);
        } else {
            URI u = URI.create(url.replaceFirst("^postgres(ql)?://", "http://"));
            String userInfo = u.getRawUserInfo();
            if (userInfo != null) {
                int colon = userInfo.indexOf(':');
                cfg.setUsername(URLDecoder.decode(colon < 0 ? userInfo : userInfo.substring(0, colon), StandardCharsets.UTF_8));
                if (colon >= 0) cfg.setPassword(URLDecoder.decode(userInfo.substring(colon + 1), StandardCharsets.UTF_8));
            }
            String port = u.getPort() > 0 ? ":" + u.getPort() : "";
            String query = u.getRawQuery() == null ? "" : "?" + u.getRawQuery();
            cfg.setJdbcUrl("jdbc:postgresql://" + u.getHost() + port + u.getRawPath() + query);
        }
        // Small pool: free Postgres tiers cap connections; serverless (Neon) also wakes on first use.
        cfg.setMaximumPoolSize(5);
        cfg.setMinimumIdle(0);
        cfg.setConnectionTimeout(30_000);
        cfg.setIdleTimeout(120_000);
        cfg.setMaxLifetime(600_000);
        return cfg;
    }

    private static HikariDataSource postgres(String url) {
        HikariConfig cfg = postgresConfig(url);
        log.info("Using PostgreSQL at {}", cfg.getJdbcUrl().replaceAll("\\?.*$", ""));
        return new HikariDataSource(cfg);
    }
}
