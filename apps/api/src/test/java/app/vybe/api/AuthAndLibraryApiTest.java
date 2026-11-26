package app.vybe.api;

import app.vybe.api.support.ApiTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AuthAndLibraryApiTest extends ApiTestBase {

    @Test
    void signupSetsHttpOnlySessionCookieAndReturnsUser() throws Exception {
        MvcResult r = signUp("Fresh.User@Example.com", "password-123", "Fresh");
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        String setCookie = r.getResponse().getHeader("Set-Cookie");
        assertThat(setCookie).contains("vybe_session=").contains("HttpOnly").contains("SameSite=Lax")
                .contains("Path=/").contains("Max-Age=2592000");
        mvc.perform(get("/api/auth/me").cookie(cookie(r.getResponse().getCookie("vybe_session").getValue())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.email").value("fresh.user@example.com"))
                .andExpect(jsonPath("$.user.displayName").value("Fresh"))
                .andExpect(jsonPath("$.user.passwordHash").doesNotExist())
                .andExpect(jsonPath("$.user.avatarColor").isString());
    }

    @Test
    void duplicateEmailIs409() throws Exception {
        signUp("dupe@example.com", "password-123", "One");
        MvcResult r = signUp("DUPE@example.com", "password-123", "Two");
        assertThat(r.getResponse().getStatus()).isEqualTo(409);
        assertThat(r.getResponse().getContentAsString()).contains("\"code\":\"email_taken\"");
    }

    @Test
    void invalidSignupIs400Validation() throws Exception {
        MvcResult r = signUp("not-an-email", "short", "");
        assertThat(r.getResponse().getStatus()).isEqualTo(400);
        assertThat(r.getResponse().getContentAsString()).contains("\"code\":\"validation_failed\"");
    }

    @Test
    void wrongPasswordIs401() throws Exception {
        signUp("wrongpass@example.com", "password-123", "W");
        mvc.perform(post("/api/auth/signin").contentType("application/json")
                        .content("{\"email\":\"wrongpass@example.com\",\"password\":\"nope-nope\"}"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("invalid_credentials"));
    }

    @Test
    void signinIssuesNewSessionAndSignoutEndsIt() throws Exception {
        signUp("cycle@example.com", "password-123", "Cycle");
        MvcResult in = mvc.perform(post("/api/auth/signin").contentType("application/json")
                        .content("{\"email\":\"cycle@example.com\",\"password\":\"password-123\"}"))
                .andExpect(status().isOk()).andReturn();
        String token = in.getResponse().getCookie("vybe_session").getValue();

        mvc.perform(post("/api/auth/signout").cookie(cookie(token)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.ok").value(true));
        mvc.perform(get("/api/auth/me").cookie(cookie(token)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.user").value(org.hamcrest.Matchers.nullValue()));
    }

    @Test
    void anonymousMeReturnsNullUser() throws Exception {
        mvc.perform(get("/api/auth/me")).andExpect(status().isOk())
                .andExpect(content().string("{\"user\":null}"));
    }

    @Test
    void protectedEndpointsRequireSignIn() throws Exception {
        mvc.perform(get("/api/me/library"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.error.code").value("unauthorized"));
        mvc.perform(get("/api/me/history")).andExpect(status().isUnauthorized());
        mvc.perform(delete("/api/me/playlists/pl_u_x")).andExpect(status().isUnauthorized());
    }

    @Test
    void albumAddAlsoFollowsArtistAndLibraryListsReflectIt() throws Exception {
        String token = newUserSession();
        mvc.perform(put("/api/me/library/album/al_002").cookie(cookie(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.albumIds[0]").value("al_002"))
                .andExpect(jsonPath("$.artistIds[0]").value("ar_002"))
                .andExpect(jsonPath("$.addedAt.al_002").isString());

        // Vybe's old generated catalog is retired: its songs are no longer listed in the Library.
        mvc.perform(get("/api/me/library/songs").cookie(cookie(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.songs.length()").value(0));

        mvc.perform(get("/api/me/library/albums").cookie(cookie(token)))
                .andExpect(jsonPath("$.albums[0].id").value("al_002"));
        mvc.perform(get("/api/me/library/artists").cookie(cookie(token)))
                .andExpect(jsonPath("$.artists[0].id").value("ar_002"));

        mvc.perform(delete("/api/me/library/album/al_002").cookie(cookie(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.albumIds.length()").value(0));
    }

    @Test
    void loveAddsToLibraryAndUnloveKeepsLibraryMembership() throws Exception {
        String token = newUserSession();
        mvc.perform(put("/api/me/loves/song/so_0007").cookie(cookie(token)))
                .andExpect(jsonPath("$.lovedIds[0]").value("so_0007"))
                .andExpect(jsonPath("$.songIds[0]").value("so_0007"));
        mvc.perform(delete("/api/me/loves/song/so_0007").cookie(cookie(token)))
                .andExpect(jsonPath("$.lovedIds.length()").value(0))
                .andExpect(jsonPath("$.songIds[0]").value("so_0007"));
    }

    @Test
    void recentlyAddedHidesRetiredCatalogSongs() throws Exception {
        String token = newUserSession();
        mvc.perform(put("/api/me/library/song/so_0001").cookie(cookie(token))).andExpect(status().isOk());
        mvc.perform(put("/api/me/library/song/so_0002").cookie(cookie(token))).andExpect(status().isOk());
        mvc.perform(get("/api/me/recently-added").cookie(cookie(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items.length()").value(0));
    }

    @Test
    void invalidTypeAndUnknownIdAreRejected() throws Exception {
        String token = newUserSession();
        mvc.perform(put("/api/me/library/video/x").cookie(cookie(token)))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error.code").value("invalid_type"));
        mvc.perform(put("/api/me/library/song/so_9999").cookie(cookie(token)))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.error.code").value("not_found"));
    }

    @Test
    void historyRecordsAndReturnsNewestFirstWithSong() throws Exception {
        String token = newUserSession();
        mvc.perform(post("/api/me/history").cookie(cookie(token)).contentType("application/json")
                        .content("{\"songId\":\"so_0001\",\"contextType\":\"album\",\"contextId\":\"al_001\",\"playedMs\":1000}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.ok").value(true));
        mvc.perform(post("/api/me/history").cookie(cookie(token)).contentType("application/json")
                        .content("{\"songId\":\"so_0004\"}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/me/history?limit=5").cookie(cookie(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.entries[0].songId").value("so_0004"))
                .andExpect(jsonPath("$.entries[1].contextType").value("album"))
                .andExpect(jsonPath("$.entries[1].contextId").value("al_001"))
                .andExpect(jsonPath("$.entries[1].song.title").value("Glass Hours"));
        mvc.perform(post("/api/me/history").cookie(cookie(token)).contentType("application/json")
                        .content("{\"songId\":\"so_9999\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void demoUserIsSeededWithLibraryLovesPlaylistsAndHistory() throws Exception {
        MvcResult in = mvc.perform(post("/api/auth/signin").contentType("application/json")
                        .content("{\"email\":\"demo@vybe.app\",\"password\":\"vybe1234\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.displayName").value("Alex"))
                .andReturn();
        String token = in.getResponse().getCookie("vybe_session").getValue();
        mvc.perform(get("/api/me/library").cookie(cookie(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.lovedIds.length()").value(org.hamcrest.Matchers.greaterThan(0)));
        mvc.perform(get("/api/me/history?limit=200").cookie(cookie(token)))
                .andExpect(jsonPath("$.entries.length()").value(120));
        mvc.perform(get("/api/me/library/playlists").cookie(cookie(token)))
                .andExpect(jsonPath("$.playlists.length()").value(org.hamcrest.Matchers.greaterThanOrEqualTo(2)));
    }
}
