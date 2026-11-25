package app.vybe.api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

@SpringBootApplication
@org.springframework.scheduling.annotation.EnableScheduling
@ConfigurationPropertiesScan
public class VybeApiApplication {

    public static void main(String[] args) {
        SpringApplication.run(VybeApiApplication.class, args);
    }
}
