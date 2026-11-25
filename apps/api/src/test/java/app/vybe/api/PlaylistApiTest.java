package app.vybe.api;

import app.vybe.api.support.ApiTestBase;
import org.junit.jupiter.api.Test;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class PlaylistApiTest extends ApiTestBase {

    @Test
    void playlistCrudWithReorderAndPositionalDelete() throws Exception {
        String token = newUserSession();
        String id = createPlaylist(token, "[\"so_0001\",\"so_0004\"]");

        mvc.perform(get("/api/playlists/" + id)).andExpect(status().isNotFound());

        mvc.perform(post("/api/me/playlists/" + id + "/tracks").cookie(cookie(token))
                        .contentType("application/json").content("{\"trackIds\":[\"so_0011\"],\"position\":0}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.playlist.trackIds", contains("so_0011", "so_0001", "so_0004")))
                .andExpect(jsonPath("$.playlist.durationMs").value(greaterThan(0)));

        mvc.perform(patch("/api/me/playlists/" + id).cookie(cookie(token)).contentType("application/json")
                        .content("{\"name\":\"Renamed\",\"trackIds\":[\"so_0004\",\"so_0001\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.playlist.name").value("Renamed"))
                .andExpect(jsonPath("$.playlist.trackIds", contains("so_0004", "so_0001")));

        mvc.perform(delete("/api/me/playlists/" + id + "/tracks/0").cookie(cookie(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.playlist.trackIds", contains("so_0001")));
        mvc.perform(delete("/api/me/playlists/" + id + "/tracks/9").cookie(cookie(token)))
                .andExpect(status().isNotFound());

        mvc.perform(get("/api/me/library/playlists").cookie(cookie(token)))
                .andExpect(jsonPath("$.playlists[0].id").value(id));

        mvc.perform(delete("/api/me/playlists/" + id).cookie(cookie(token)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.ok").value(true));
        mvc.perform(get("/api/me/library/playlists").cookie(cookie(token)))
                .andExpect(jsonPath("$.playlists.length()").value(0));
    }

    @Test
    void otherUsersCannotEditAndPrivatePlaylistsAreHidden() throws Exception {
        String owner = newUserSession();
        String other = newUserSession();
        String id = createPlaylist(owner, "[\"so_0002\"]");

        mvc.perform(patch("/api/me/playlists/" + id).cookie(cookie(other)).contentType("application/json")
                        .content("{\"name\":\"Hacked\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error.code").value("forbidden"));
        mvc.perform(delete("/api/me/playlists/" + id).cookie(cookie(other))).andExpect(status().isForbidden());
        mvc.perform(get("/api/playlists/" + id).cookie(cookie(other))).andExpect(status().isNotFound());

        mvc.perform(patch("/api/me/playlists/" + id).cookie(cookie(owner)).contentType("application/json")
                        .content("{\"isPublic\":true}"))
                .andExpect(status().isOk());
        mvc.perform(get("/api/playlists/" + id)).andExpect(status().isOk())
                .andExpect(jsonPath("$.playlist.kind").value("user"))
                .andExpect(jsonPath("$.playlist.ownerId").isString());
    }

    @Test
    void validationAndUnknownTracks() throws Exception {
        String token = newUserSession();
        mvc.perform(post("/api/me/playlists").cookie(cookie(token)).contentType("application/json")
                        .content("{\"name\":\"\"}"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/me/playlists").cookie(cookie(token)).contentType("application/json")
                        .content("{\"name\":\"X\",\"trackIds\":[\"so_9999\"]}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("unknown_track"));
        mvc.perform(patch("/api/me/playlists/pl_u_missing").cookie(cookie(token)).contentType("application/json")
                        .content("{\"name\":\"X\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(post("/api/me/playlists").contentType("application/json").content("{\"name\":\"X\"}"))
                .andExpect(status().isUnauthorized());
    }

    private String createPlaylist(String token, String trackIds) throws Exception {
        var result = mvc.perform(post("/api/me/playlists").cookie(cookie(token)).contentType("application/json")
                        .content("{\"name\":\"Road Trip\",\"description\":\"Songs for driving. More here.\",\"trackIds\":" + trackIds + "}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.playlist.kind").value("user"))
                .andExpect(jsonPath("$.playlist.id").value(startsWith("pl_u_")))
                .andExpect(jsonPath("$.playlist.shortDescription").value("Songs for driving."))
                .andReturn();
        Object id = json.readValue(result.getResponse().getContentAsString(), java.util.Map.class);
        return (String) ((java.util.Map<?, ?>) ((java.util.Map<?, ?>) id).get("playlist")).get("id");
    }
}
