package app.vybe.api.web;

import app.vybe.api.auth.CurrentUser;
import app.vybe.api.auth.ProfileService;
import app.vybe.api.model.Pages;
import app.vybe.api.model.User;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/** Account settings, public listener profiles and follows. */
@RestController
public class ProfileController {

    record ProfilePatch(String displayName, String avatarColor) { }

    private final ProfileService profiles;

    public ProfileController(ProfileService profiles) {
        this.profiles = profiles;
    }

    @PatchMapping("/api/me")
    public Pages.UserWrapper update(@CurrentUser User me, @RequestBody ProfilePatch body) {
        return new Pages.UserWrapper(profiles.update(me, body.displayName(), body.avatarColor()));
    }

    @GetMapping("/api/users/{id}")
    public ProfileService.Profile profile(@CurrentUser(required = false) User viewer, @PathVariable String id) {
        return profiles.profile(viewer, id);
    }

    @PutMapping("/api/me/following/{id}")
    public ProfileService.Profile follow(@CurrentUser User me, @PathVariable String id) {
        return profiles.follow(me, id);
    }

    @DeleteMapping("/api/me/following/{id}")
    public ProfileService.Profile unfollow(@CurrentUser User me, @PathVariable String id) {
        return profiles.unfollow(me, id);
    }
}
