package app.vybe.api.auth;

import app.vybe.api.error.ApiException;
import app.vybe.api.model.User;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Locale;

/**
 * The demo account's password is public, so actions that would lock other visitors out, change what
 * everyone sees, or turn it into shared file hosting are refused for it.
 */
@Component
public class DemoGuard {

    private final String demoEmail;

    public DemoGuard(@Value("${vybe.demo-email:${VYBE_DEMO_EMAIL:demo@vybe.app}}") String demoEmail) {
        this.demoEmail = demoEmail == null ? "" : demoEmail.trim().toLowerCase(Locale.ROOT);
    }

    public boolean isDemo(User user) {
        return user != null && !demoEmail.isEmpty() && demoEmail.equals(user.email());
    }

    /** Throws 403 {@code demo_account} when {@code user} is the shared demo account. */
    public void forbid(User user, String action) {
        if (isDemo(user)) {
            throw new ApiException(403, "demo_account",
                    "The shared demo account can't " + action + ". Create your own free account to do this.");
        }
    }
}
