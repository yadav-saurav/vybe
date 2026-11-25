package app.vybe.api;

import app.vybe.api.support.ApiTestBase;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ListenerSearchApiTest extends ApiTestBase {

    private String user(String name) {
        return signUp("u-" + UUID.randomUUID().toString().substring(0, 8) + "@example.com", "correct-horse", name)
                .getResponse().getCookie(SESSION).getValue();
    }

    private String idOf(String token) throws Exception {
        return json.readTree(mvc.perform(get("/api/auth/me").cookie(cookie(token))).andReturn().getResponse().getContentAsString())
                .get("user").get("id").asText();
    }

    private JsonNode listeners(String token, String path) throws Exception {
        var req = org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get(path);
        if (token != null) req.cookie(cookie(token));
        return json.readTree(mvc.perform(req).andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("listeners");
    }

    @Test
    void searchFindsListenersByNameAndMarksWhoYouFollow() throws Exception {
        String tag = UUID.randomUUID().toString().substring(0, 6);
        String me = user("Quill " + tag);
        String a = user("Zephyr " + tag), b = user("Marlo Zephyrine " + tag);
        String aId = idOf(a);

        assertThat(listeners(me, "/api/users/search?q=z")).as("too short").isEmpty();
        JsonNode hits = listeners(me, "/api/users/search?q=zephyr " + tag);
        assertThat(hits).hasSize(1);
        hits = listeners(me, "/api/users/search?q=" + tag);
        assertThat(hits).hasSize(2).as("never includes the searcher");
        assertThat(hits.get(0).get("displayName").asText()).isEqualTo("Marlo Zephyrine " + tag); // alphabetical within matches

        mvc.perform(put("/api/me/following/" + aId).cookie(cookie(me))).andExpect(status().isOk());
        JsonNode again = listeners(me, "/api/users/search?q=zephyr " + tag);
        assertThat(again.get(0).get("isFollowing").asBoolean()).isTrue();
        assertThat(listeners(null, "/api/users/search?q=zephyr " + tag).get(0).get("isFollowing").asBoolean()).isFalse();
        assertThat(listeners(me, "/api/users/search?q=%25%25")).as("% matched literally, not as a wildcard").isEmpty();
        assertThat(b).isNotBlank();
    }

    @Test
    void followerAndFollowingLists() throws Exception {
        String tag = UUID.randomUUID().toString().substring(0, 6);
        String a = user("Ada " + tag), b = user("Bo " + tag);
        String aId = idOf(a), bId = idOf(b);
        mvc.perform(put("/api/me/following/" + aId).cookie(cookie(b))).andExpect(status().isOk());
        JsonNode followers = listeners(a, "/api/users/" + aId + "/followers");
        assertThat(followers).hasSize(1);
        assertThat(followers.get(0).get("id").asText()).isEqualTo(bId);
        assertThat(followers.get(0).get("isFollowing").asBoolean()).as("a does not follow b back").isFalse();
        JsonNode following = listeners(b, "/api/users/" + bId + "/following");
        assertThat(following.get(0).get("id").asText()).isEqualTo(aId);
        assertThat(following.get(0).get("isFollowing").asBoolean()).isTrue();
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/users/usr_nobody/followers"))
                .andExpect(status().isNotFound());
    }
}
