package app.vybe.api;

import app.vybe.api.support.ApiTestBase;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class FriendsApiTest extends ApiTestBase {

    private JsonNode home(String token) throws Exception {
        return json.readTree(mvc.perform(get("/api/pages/home").cookie(cookie(token))).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }

    private JsonNode shelf(JsonNode home, String id) {
        for (JsonNode s : home.get("shelves")) if (id.equals(s.get("id").asText())) return s;
        return null;
    }

    private String idOf(String token) throws Exception {
        return json.readTree(mvc.perform(get("/api/auth/me").cookie(cookie(token))).andReturn().getResponse().getContentAsString())
                .get("user").get("id").asText();
    }

    @Test
    void friendActivityIsPrivateByDefaultAndOptIn() throws Exception {
        String me = newUserSession(), friend = newUserSession();
        String friendId = idOf(friend);
        mvc.perform(put("/api/me/following/" + friendId).cookie(cookie(me))).andExpect(status().isOk());
        mvc.perform(post("/api/me/history").cookie(cookie(friend)).contentType("application/json")
                .content("{\"songId\":\"so_0001\",\"playedMs\":120000}")).andExpect(status().isOk());

        mvc.perform(get("/api/me/settings").cookie(cookie(friend))).andExpect(jsonPath("$.shareActivity").value(false));
        assertThat(shelf(home(me), "friends-listening")).as("hidden until the friend opts in").isNull();

        mvc.perform(patch("/api/me/settings").cookie(cookie(friend)).contentType("application/json").content("{\"shareActivity\":true}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.shareActivity").value(true));
        JsonNode shelf = shelf(home(me), "friends-listening");
        assertThat(shelf).isNotNull();
        assertThat(shelf.get("layout").asText()).isEqualTo("friends");
        JsonNode card = shelf.get("friendCards").get(0);
        assertThat(card.get("userId").asText()).isEqualTo(friendId);
        assertThat(card.get("item").get("data").get("id").asText()).isEqualTo("so_0001");

        // Not following -> not shown; opting out hides it again.
        mvc.perform(delete("/api/me/following/" + friendId).cookie(cookie(me))).andExpect(status().isOk());
        assertThat(shelf(home(me), "friends-listening")).isNull();
        mvc.perform(put("/api/me/following/" + friendId).cookie(cookie(me)));
        mvc.perform(patch("/api/me/settings").cookie(cookie(friend)).contentType("application/json").content("{\"shareActivity\":false}"));
        assertThat(shelf(home(me), "friends-listening")).isNull();
        mvc.perform(get("/api/me/settings")).andExpect(status().isUnauthorized());
    }

    @Test
    void newFromYourArtistsListsRecentReleasesOfLibraryArtists() throws Exception {
        String me = newUserSession();
        assertThat(shelf(home(me), "new-from-your-artists")).as("no library artists yet").isNull();
        mvc.perform(put("/api/me/library/album/al_004").cookie(cookie(me))).andExpect(status().isOk());   // ar_004, released 2026-11-10
        mvc.perform(put("/api/me/library/album/al_003").cookie(cookie(me))).andExpect(status().isOk());   // ar_003, released 2026-08-01 (outside the 180-day window of 2026-11-10 latest? inside)
        JsonNode shelf = shelf(home(me), "new-from-your-artists");
        assertThat(shelf).isNotNull();
        assertThat(shelf.get("items").get(0).get("data").get("id").asText()).isEqualTo("al_004"); // newest first
    }
}
