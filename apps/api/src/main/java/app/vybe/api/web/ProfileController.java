package app.vybe.api.web;

import app.vybe.api.auth.AuthService;
import app.vybe.api.auth.CurrentUser;
import app.vybe.api.auth.CurrentUserArgumentResolver;
import app.vybe.api.auth.ProfileService;
import app.vybe.api.model.Pages;
import app.vybe.api.model.User;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
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

    record PasswordChange(@NotBlank @Size(max = 72) String currentPassword, @NotBlank @Size(min = 8, max = 72) String newPassword) { }

    record SettingsPatch(Boolean shareActivity) { }

    record AccountDelete(@NotBlank @Size(max = 72) String password) { }

    private final ProfileService profiles;
    private final AuthService auth;

    public ProfileController(ProfileService profiles, AuthService auth) {
        this.profiles = profiles;
        this.auth = auth;
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

    @PutMapping("/api/me/password")
    public Pages.Ok changePassword(@CurrentUser User me, @Valid @RequestBody PasswordChange body, HttpServletRequest request) {
        auth.changePassword(me, body.currentPassword(), body.newPassword(), CurrentUserArgumentResolver.sessionToken(request));
        return Pages.Ok.YES;
    }

    @DeleteMapping("/api/me")
    public ResponseEntity<Pages.Ok> deleteAccount(@CurrentUser User me, @Valid @RequestBody AccountDelete body) {
        profiles.deleteAccount(me, body.password());
        return ResponseEntity.ok().header(HttpHeaders.SET_COOKIE, auth.clearedCookie().toString()).body(Pages.Ok.YES);
    }

    @GetMapping("/api/me/settings")
    public ProfileService.AccountSettings settings(@CurrentUser User me) {
        return profiles.settings(me);
    }

    @PatchMapping("/api/me/settings")
    public ProfileService.AccountSettings updateSettings(@CurrentUser User me, @RequestBody SettingsPatch body) {
        return profiles.updateSettings(me, body.shareActivity());
    }
}
