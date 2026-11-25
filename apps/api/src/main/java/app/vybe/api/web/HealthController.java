package app.vybe.api.web;

import app.vybe.api.model.Pages;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {

    @GetMapping("/api/health")
    public Pages.Health health() {
        return new Pages.Health(true);
    }
}
