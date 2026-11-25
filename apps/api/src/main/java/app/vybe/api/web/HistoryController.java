package app.vybe.api.web;

import app.vybe.api.auth.CurrentUser;
import app.vybe.api.history.HistoryService;
import app.vybe.api.model.ContentType;
import app.vybe.api.model.Pages;
import app.vybe.api.model.User;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;


@RestController
@RequestMapping("/api/me/history")
public class HistoryController {

    record PlayRequest(
            @NotBlank String songId,
            ContentType contextType,
            String contextId,
            @PositiveOrZero Integer playedMs) {
    }

    private final HistoryService history;

    public HistoryController(HistoryService history) {
        this.history = history;
    }

    @GetMapping
    public Pages.Entries list(@CurrentUser User user, @RequestParam(value = "limit", required = false) Integer limit) {
        return new Pages.Entries(history.list(user.id(), limit));
    }

    @PostMapping
    public Pages.Ok record(@CurrentUser User user, @Valid @RequestBody PlayRequest body) {
        history.record(user.id(), body.songId(), body.playedMs() == null ? 0 : body.playedMs(),
                body.contextType(), body.contextId());
        return Pages.Ok.YES;
    }
}
