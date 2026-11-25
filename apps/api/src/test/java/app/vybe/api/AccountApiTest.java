package app.vybe.api;

import app.vybe.api.support.ApiTestBase;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AccountApiTest extends ApiTestBase {

    private static final String PW = "correct-horse";

    private String email(String token) throws Exception {
        JsonNode u = json.readTree(mvc.perform(get("/api/auth/me").cookie(cookie(token))).andReturn().getResponse().getContentAsString()).get("user");
        return u.get("email").asText();
    }

    private String signIn(String email, String password, int expected) throws Exception {
        MvcResult r = mvc.perform(post("/api/auth/signin").contentType("application/json")
                .content("{\"email\":\"" + email + "\",\"password\":\"" + password + "\"}")).andExpect(status().is(expected)).andReturn();
        Cookie c = r.getResponse().getCookie(SESSION);
        return c == null ? null : c.getValue();
    }

    private void change(String token, String current, String next, int expected) throws Exception {
        mvc.perform(put("/api/me/password").cookie(cookie(token)).contentType("application/json")
                .content("{\"currentPassword\":\"" + current + "\",\"newPassword\":\"" + next + "\"}")).andExpect(status().is(expected));
    }

    @Test
    void changePasswordChecksCurrentSignsOutOtherDevicesAndKeepsThisOne() throws Exception {
        String a = newUserSession();
        String email = email(a);
        String b = signIn(email, PW, 200); // second device

        change(a, "wrong-password", "brand-new-pass", 403);
        change(a, PW, "short", 400);
        change(a, PW, PW, 400);
        mvc.perform(put("/api/me/password").contentType("application/json").content("{\"currentPassword\":\"x\",\"newPassword\":\"yyyyyyyy\"}"))
                .andExpect(status().isUnauthorized());

        change(a, PW, "brand-new-pass", 200);
        signIn(email, PW, 401);
        signIn(email, "brand-new-pass", 200);
        mvc.perform(get("/api/auth/me").cookie(cookie(a))).andExpect(jsonPath("$.user.email").value(email)); // this device stays signed in
        mvc.perform(get("/api/auth/me").cookie(cookie(b))).andExpect(jsonPath("$.user").doesNotExist()); // other device signed out
    }

    @Test
    void deleteAccountNeedsPasswordRemovesEverythingAndClearsCookie() throws Exception {
        String owner = newUserSession(), guest = newUserSession();
        String email = email(owner);
        String playlist = json.readTree(mvc.perform(post("/api/me/playlists").cookie(cookie(owner)).contentType("application/json")
                .content("{\"name\":\"Shared\",\"trackIds\":[\"so_0001\"]}")).andReturn().getResponse().getContentAsString())
                .get("playlist").get("id").asText();
        mvc.perform(patch("/api/me/playlists/" + playlist).cookie(cookie(owner)).contentType("application/json").content("{\"isCollaborative\":true}"));
        mvc.perform(put("/api/me/library/playlist/" + playlist).cookie(cookie(guest))).andExpect(status().isOk());
        mvc.perform(put("/api/me/library/song/so_0002").cookie(cookie(owner))).andExpect(status().isOk());

        mvc.perform(delete("/api/me").cookie(cookie(owner)).contentType("application/json").content("{\"password\":\"nope-nope\"}"))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/me").contentType("application/json").content("{\"password\":\"" + PW + "\"}")).andExpect(status().isUnauthorized());

        MvcResult done = mvc.perform(delete("/api/me").cookie(cookie(owner)).contentType("application/json")
                .content("{\"password\":\"" + PW + "\"}")).andExpect(status().isOk()).andReturn();
        assertThat(done.getResponse().getHeader("Set-Cookie")).contains("Max-Age=0");

        signIn(email, PW, 401);
        mvc.perform(get("/api/auth/me").cookie(cookie(owner))).andExpect(jsonPath("$.user").doesNotExist());
        // Their collaborative playlist is gone for everyone, and the guest's library copes with the dangling reference.
        mvc.perform(get("/api/playlists/" + playlist)).andExpect(status().isNotFound());
        String listed = mvc.perform(get("/api/me/library/playlists").cookie(cookie(guest))).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(listed).doesNotContain(playlist);
    }
}
