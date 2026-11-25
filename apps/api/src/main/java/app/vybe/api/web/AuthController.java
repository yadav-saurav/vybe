package app.vybe.api.web;

import app.vybe.api.auth.AuthService;
import app.vybe.api.auth.CurrentUser;
import app.vybe.api.auth.CurrentUserArgumentResolver;
import app.vybe.api.model.Pages;
import app.vybe.api.model.User;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;


@RestController
@RequestMapping("/api/auth")
public class AuthController {

    record SignUpRequest(
            @NotBlank @Email @Size(max = 254) String email,
            @NotBlank @Size(min = 8, max = 72) String password,
            @NotBlank @Size(max = 40) String displayName) {
    }

    record SignInRequest(@NotBlank @Email String email, @NotBlank @Size(max = 72) String password) {
    }

    private final AuthService auth;

    public AuthController(AuthService auth) {
        this.auth = auth;
    }

    @PostMapping("/signup")
    public ResponseEntity<Pages.UserWrapper> signUp(@Valid @RequestBody SignUpRequest body) {
        User user = auth.signUp(body.email(), body.password(), body.displayName());
        return withSession(auth.createSession(user.id()), new Pages.UserWrapper(user));
    }

    @PostMapping("/signin")
    public ResponseEntity<Pages.UserWrapper> signIn(@Valid @RequestBody SignInRequest body) {
        User user = auth.signIn(body.email(), body.password());
        return withSession(auth.createSession(user.id()), new Pages.UserWrapper(user));
    }

    @PostMapping("/signout")
    public ResponseEntity<Pages.Ok> signOut(HttpServletRequest request) {
        auth.endSession(CurrentUserArgumentResolver.sessionToken(request));
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, auth.clearedCookie().toString())
                .body(Pages.Ok.YES);
    }

    @GetMapping("/me")
    public Pages.UserWrapper me(@CurrentUser(required = false) User user) {
        return new Pages.UserWrapper(user);
    }

    private ResponseEntity<Pages.UserWrapper> withSession(String token, Pages.UserWrapper body) {
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, auth.sessionCookie(token).toString())
                .body(body);
    }
}
