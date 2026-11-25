package app.vybe.api.config;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * SQLite data source. SQLite serializes writers, so the pool has a single connection; WAL mode
 * keeps readers unblocked and busy_timeout absorbs short lock contention instead of failing.
 */
@Configuration
public class DataSourceConfig {

    @Bean
    public DataSource dataSource(VybeProperties props) throws IOException {
        Path db = props.databaseFile();
        Files.createDirectories(db.getParent());

        HikariConfig cfg = new HikariConfig();
        cfg.setPoolName("vybe-sqlite");
        cfg.setDriverClassName("org.sqlite.JDBC");
        cfg.setJdbcUrl("jdbc:sqlite:" + db
                + "?journal_mode=WAL&busy_timeout=5000&foreign_keys=true&synchronous=NORMAL");
        cfg.setMaximumPoolSize(1);
        cfg.setMinimumIdle(1);
        return new HikariDataSource(cfg);
    }
}
