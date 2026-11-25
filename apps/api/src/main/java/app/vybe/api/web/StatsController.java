package app.vybe.api.web;

import app.vybe.api.auth.CurrentUser;
import app.vybe.api.history.StatsService;
import app.vybe.api.model.User;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Replay: listening statistics for the signed-in user. */
@RestController
public class StatsController {
    private final StatsService stats;

    public StatsController(StatsService stats) {
        this.stats = stats;
    }

    @GetMapping("/api/me/stats")
    public StatsService.Stats stats(@CurrentUser User user, @RequestParam(value = "period", required = false) String period) {
        return stats.stats(user.id(), period);
    }
}
