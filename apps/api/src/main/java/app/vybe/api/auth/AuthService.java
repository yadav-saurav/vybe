package app.vybe.api.auth;

import app.vybe.api.common.Ids;
import app.vybe.api.common.Timestamps;
import app.vybe.api.error.ApiException;
import app.vybe.api.model.User;
import org.springframework.http.ResponseCookie;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/** Account creation, password checks and the opaque session cookie. */
@Service
public class AuthService {

    public static final String COOKIE_NAME = "vybe_session";
    public static final Duration SESSION_TTL = Duration.ofDays(30);

    private static final List<String> AVATAR_COLORS = List.of(
            "#ff4d8d", "#e0523b", "#f2a541", "#3fa796", "#4d7cfe", "#8b5cf6", "#22a6b3", "#6b8e9f");
    private static final SecureRandom RANDOM = new SecureRandom();

    /** Hash checked when the email is unknown, so timing does not reveal which accounts exist. */
    private static final String DUMMY_HASH = new BCryptPasswordEncoder().encode("vybe-dummy-password");

    private final UserRepository users;
    private final PasswordEncoder encoder = new BCryptPasswordEncoder();

    public AuthService(UserRepository users) {
        this.users = users;
    }

    @Transactional
    public User signUp(String email, String password, String displayName) {
        String normalized = normalizeEmail(email);
        if (users.emailExists(normalized)) {
            throw ApiException.conflict("email_taken", "An account with that email already exists");
        }
        User user = new User(
                Ids.random("usr_", 14),
                normalized,
                displayName.trim(),
                AVATAR_COLORS.get(RANDOM.nextInt(AVATAR_COLORS.size())),
                Timestamps.now());
        users.insert(user, encoder.encode(password));
        return user;
    }

    @Transactional(readOnly = true)
    public boolean hasUsers() {
        return users.count() > 0;
    }

    @Transactional(readOnly = true)
    public Optional<User> userById(String id) {
        return users.findById(id);
    }

    /** Verifies credentials. Unknown email and wrong password produce the same 401. */
    @Transactional(readOnly = true)
    public User signIn(String email, String password) {
        Optional<UserRepository.StoredUser> stored = users.findStoredByEmail(normalizeEmail(email));
        String hash = stored.map(UserRepository.StoredUser::passwordHash).orElse(DUMMY_HASH);
        boolean ok = encoder.matches(password, hash);
        if (stored.isEmpty() || !ok) {
            throw new ApiException(401, "invalid_credentials", "Email or password is incorrect");
        }
        return stored.get().user();
    }

    /** Creates a session and returns the raw token for the cookie. Only its hash is stored. */
    @Transactional
    public String createSession(String userId) {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        Instant now = Instant.now();
        users.insertSession(hash(token), userId, Timestamps.format(now), Timestamps.format(now.plus(SESSION_TTL)));
        return token;
    }

    @Transactional(readOnly = true)
    public Optional<User> resolve(String token) {
        if (token == null || token.isBlank()) {
            return Optional.empty();
        }
        return users.findUserBySession(hash(token), Timestamps.now());
    }

    @Transactional
    public void endSession(String token) {
        if (token != null && !token.isBlank()) {
            users.deleteSession(hash(token));
        }
    }

    public ResponseCookie sessionCookie(String token) {
        return ResponseCookie.from(COOKIE_NAME, token)
                .httpOnly(true)
                .sameSite("Lax")
                .path("/")
                .maxAge(SESSION_TTL)
                .build();
    }

    public ResponseCookie clearedCookie() {
        return ResponseCookie.from(COOKIE_NAME, "")
                .httpOnly(true)
                .sameSite("Lax")
                .path("/")
                .maxAge(Duration.ZERO)
                .build();
    }

    static String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    static String hash(String token) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
