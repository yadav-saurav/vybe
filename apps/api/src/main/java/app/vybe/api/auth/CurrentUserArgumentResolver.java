package app.vybe.api.auth;

import app.vybe.api.error.ApiException;
import app.vybe.api.model.User;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.MethodParameter;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

import java.util.Optional;

/**
 * Resolves {@link CurrentUser} parameters from the session cookie. The lookup is cached on the
 * request so a handler that asks twice hits the database once.
 */
@Component
public class CurrentUserArgumentResolver implements HandlerMethodArgumentResolver {

    private static final String REQUEST_ATTRIBUTE = CurrentUserArgumentResolver.class.getName() + ".user";

    private final AuthService auth;

    public CurrentUserArgumentResolver(AuthService auth) {
        this.auth = auth;
    }

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.hasParameterAnnotation(CurrentUser.class) && User.class.equals(parameter.getParameterType());
    }

    @Override
    public Object resolveArgument(MethodParameter parameter, ModelAndViewContainer mavContainer,
                                  NativeWebRequest webRequest, WebDataBinderFactory binderFactory) {
        CurrentUser annotation = parameter.getParameterAnnotation(CurrentUser.class);
        HttpServletRequest request = webRequest.getNativeRequest(HttpServletRequest.class);
        Optional<User> user = lookup(request);
        if (user.isEmpty() && annotation != null && annotation.required()) {
            throw ApiException.unauthorized();
        }
        return user.orElse(null);
    }

    @SuppressWarnings("unchecked")
    private Optional<User> lookup(HttpServletRequest request) {
        if (request == null) {
            return Optional.empty();
        }
        Object cached = request.getAttribute(REQUEST_ATTRIBUTE);
        if (cached instanceof Optional<?> opt) {
            return (Optional<User>) opt;
        }
        Optional<User> user = auth.resolve(sessionToken(request));
        request.setAttribute(REQUEST_ATTRIBUTE, user);
        return user;
    }

    /** The raw session token from the request, if present. */
    public static String sessionToken(HttpServletRequest request) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) {
            return null;
        }
        for (Cookie c : cookies) {
            if (AuthService.COOKIE_NAME.equals(c.getName())) {
                return c.getValue();
            }
        }
        return null;
    }
}
