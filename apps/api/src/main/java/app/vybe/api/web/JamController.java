package app.vybe.api.web;

import app.vybe.api.auth.CurrentUser;
import app.vybe.api.jam.JamService;
import app.vybe.api.model.User;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;

/** Jam (listen together): start, join by code, shared controls and queue, and a live event stream. */
@RestController
public class JamController {
    private final JamService jams;

    public JamController(JamService jams) {
        this.jams = jams;
    }

    /** The Jam you are in, if any: lets a reloaded tab rejoin. */
    @GetMapping("/api/me/jam")
    public Map<String, Object> mine(@CurrentUser User user) {
        return jams.current(user).<Map<String, Object>>map(v -> Map.of("jam", v)).orElseGet(() -> {
            Map<String, Object> none = new java.util.HashMap<>();
            none.put("jam", null);
            return none;
        });
    }

    @PostMapping("/api/jams")
    public JamService.View start(@CurrentUser User user, @RequestBody(required = false) JamService.Start req) {
        return jams.start(user, req);
    }

    @GetMapping("/api/jams/{code}")
    public JamService.View get(@CurrentUser User user, @PathVariable String code) {
        return jams.get(code);
    }

    @PostMapping("/api/jams/{code}/join")
    public JamService.View join(@CurrentUser User user, @PathVariable String code) {
        return jams.join(user, code);
    }

    @PostMapping("/api/jams/{code}/leave")
    public ResponseEntity<Void> leave(@CurrentUser User user, @PathVariable String code) {
        jams.leave(user, code);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/api/jams/{code}/control")
    public JamService.View control(@CurrentUser User user, @PathVariable String code, @RequestBody JamService.Control req) {
        return jams.control(user, code, req);
    }

    @PostMapping("/api/jams/{code}/queue")
    public JamService.View add(@CurrentUser User user, @PathVariable String code, @RequestBody JamService.AddSongs req) {
        return jams.add(user, code, req);
    }

    @DeleteMapping("/api/jams/{code}/queue/{entryId}")
    public JamService.View remove(@CurrentUser User user, @PathVariable String code, @PathVariable String entryId) {
        return jams.remove(user, code, entryId);
    }

    @PatchMapping("/api/jams/{code}")
    public JamService.View settings(@CurrentUser User user, @PathVariable String code, @RequestBody JamService.Settings req) {
        return jams.settings(user, code, req);
    }

    @GetMapping(value = "/api/jams/{code}/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter events(@CurrentUser User user, @PathVariable String code) {
        return jams.subscribe(user, code);
    }
}
