package app.vybe.api;

import app.vybe.api.support.ApiTestBase;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ProfileApiTest extends ApiTestBase {

    private JsonNode me(String token) throws Exception {
        return json.readTree(mvc.perform(get("/api/auth/me").cookie(cookie(token))).andReturn().getResponse().getContentAsString()).get("user");
    }

    @Test
    void editProfileValidatesAndPersists() throws Exception {
        String t = newUserSession();
        mvc.perform(patch("/api/me").cookie(cookie(t)).contentType("application/json")
                        .content("{\"displayName\":\"Night Owl\",\"avatarColor\":\"#123abc\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.displayName").value("Night Owl"))
                .andExpect(jsonPath("$.user.avatarColor").value("#123abc"));
        mvc.perform(patch("/api/me").cookie(cookie(t)).contentType("application/json").content("{\"avatarColor\":\"red\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(patch("/api/me").cookie(cookie(t)).contentType("application/json").content("{\"displayName\":\"  \"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(patch("/api/me").contentType("application/json").content("{}")).andExpect(status().isUnauthorized());
    }

    @Test
    void followAndPublicPlaylistVisibility() throws Exception {
        String a = newUserSession(), b = newUserSession();
        String bId = me(b).get("id").asText();
        // b has one public and one private playlist
        mvc.perform(post("/api/me/playlists").cookie(cookie(b)).contentType("application/json").content("{\"name\":\"Public One\"}"));
        String pub = json.readTree(mvc.perform(get("/api/me/library/playlists").cookie(cookie(b))).andReturn().getResponse().getContentAsString())
                .get("playlists").get(0).get("id").asText();
        mvc.perform(patch("/api/me/playlists/" + pub).cookie(cookie(b)).contentType("application/json").content("{\"isPublic\":true}"));
        mvc.perform(post("/api/me/playlists").cookie(cookie(b)).contentType("application/json").content("{\"name\":\"Secret\"}"));

        mvc.perform(get("/api/users/" + bId).cookie(cookie(a))).andExpect(status().isOk())
                .andExpect(jsonPath("$.playlists.length()").value(1))
                .andExpect(jsonPath("$.playlists[0].name").value("Public One"))
                .andExpect(jsonPath("$.isFollowing").value(false))
                .andExpect(jsonPath("$.isMe").value(false));
        mvc.perform(get("/api/users/" + bId).cookie(cookie(b))).andExpect(jsonPath("$.playlists.length()").value(2))
                .andExpect(jsonPath("$.isMe").value(true));

        mvc.perform(put("/api/me/following/" + bId).cookie(cookie(a))).andExpect(status().isOk())
                .andExpect(jsonPath("$.isFollowing").value(true)).andExpect(jsonPath("$.followers").value(1));
        mvc.perform(put("/api/me/following/" + bId).cookie(cookie(a))).andExpect(jsonPath("$.followers").value(1)); // idempotent
        mvc.perform(delete("/api/me/following/" + bId).cookie(cookie(a)))
                .andExpect(jsonPath("$.isFollowing").value(false)).andExpect(jsonPath("$.followers").value(0));
        String aId = me(a).get("id").asText();
        mvc.perform(put("/api/me/following/" + aId).cookie(cookie(a))).andExpect(status().isBadRequest());
        mvc.perform(get("/api/users/usr_nope")).andExpect(status().isNotFound());
        assertThat(aId).isNotEqualTo(bId);
    }
}
