package app.vybe.api.web;

import app.vybe.api.auth.CurrentUser;
import app.vybe.api.model.Pages;
import app.vybe.api.model.Playlist;
import app.vybe.api.model.User;
import app.vybe.api.playlists.PlaylistService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/me/playlists")
public class PlaylistController {

    record CreateRequest(
            @Size(min = 1, max = 120) String name,
            @Size(max = 1000) String description,
            @Size(max = PlaylistService.MAX_TRACKS) List<String> trackIds) {
    }

    record PatchRequest(
            @Size(max = 120) String name,
            @Size(max = 1000) String description,
            Boolean isPublic,
            Boolean isCollaborative,
            @Size(max = PlaylistService.MAX_TRACKS) List<String> trackIds) {
    }

    record AddTracksRequest(
            @NotNull @Size(min = 1, max = 500) List<String> trackIds,
            @PositiveOrZero Integer position) {
    }

    private final PlaylistService playlists;

    public PlaylistController(PlaylistService playlists) {
        this.playlists = playlists;
    }

    @PostMapping
    public Pages.PlaylistWrapper create(@CurrentUser User user, @Valid @RequestBody CreateRequest body) {
        if (body.name() == null || body.name().isBlank()) {
            throw app.vybe.api.error.ApiException.badRequest("invalid_name", "name is required");
        }
        return wrap(playlists.create(user, new PlaylistService.CreateRequest(body.name(), body.description(),
                body.trackIds())));
    }

    @PatchMapping("/{id}")
    public Pages.PlaylistWrapper update(@CurrentUser User user, @PathVariable String id,
                                        @Valid @RequestBody PatchRequest body) {
        return wrap(playlists.update(user, id, new PlaylistService.PatchRequest(
                body.name(), body.description(), body.isPublic(), body.isCollaborative(), body.trackIds())));
    }

    @PostMapping("/{id}/tracks")
    public Pages.PlaylistWrapper addTracks(@CurrentUser User user, @PathVariable String id,
                                           @Valid @RequestBody AddTracksRequest body) {
        return wrap(playlists.addTracks(user, id, body.trackIds(), body.position()));
    }

    @DeleteMapping("/{id}/tracks/{index}")
    public Pages.PlaylistWrapper removeTrack(@CurrentUser User user, @PathVariable String id,
                                             @PathVariable int index) {
        return wrap(playlists.removeAt(user, id, index));
    }

    @DeleteMapping("/{id}")
    public Pages.Ok delete(@CurrentUser User user, @PathVariable String id) {
        playlists.delete(user, id);
        return Pages.Ok.YES;
    }

    private static Pages.PlaylistWrapper wrap(Playlist p) {
        return new Pages.PlaylistWrapper(p);
    }
}
