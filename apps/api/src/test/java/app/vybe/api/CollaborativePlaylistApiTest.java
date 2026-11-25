package app.vybe.api;

import app.vybe.api.support.ApiTestBase;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class CollaborativePlaylistApiTest extends ApiTestBase {

    private String createPlaylist(String token, String name) throws Exception {
        String body = mvc.perform(post("/api/me/playlists").cookie(cookie(token)).contentType("application/json")
                .content("{\"name\":\"" + name + "\",\"trackIds\":[\"so_0001\"]}")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return json.readTree(body).get("playlist").get("id").asText();
    }

    private void add(String token, String id, String songId, int expected) throws Exception {
        mvc.perform(post("/api/me/playlists/" + id + "/tracks").cookie(cookie(token)).contentType("application/json")
                .content("{\"trackIds\":[\"" + songId + "\"]}")).andExpect(status().is(expected));
    }

    @Test
    void collaboratorsCanOnlyAddWhenOwnerEnablesIt() throws Exception {
        String owner = newUserSession(), guest = newUserSession();
        String id = createPlaylist(owner, "Road Trip");

        // Private and not collaborative: invisible and read-only for others.
        mvc.perform(get("/api/playlists/" + id).cookie(cookie(guest))).andExpect(status().isNotFound());
        add(guest, id, "so_0002", 403);

        mvc.perform(patch("/api/me/playlists/" + id).cookie(cookie(owner)).contentType("application/json")
                        .content("{\"isCollaborative\":true}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.playlist.isCollaborative").value(true));

        // Anyone with the link can now view it; a signed-in guest can append catalog songs.
        mvc.perform(get("/api/playlists/" + id)).andExpect(status().isOk())
                .andExpect(jsonPath("$.playlist.isCollaborative").value(true));
        mvc.perform(post("/api/me/playlists/" + id + "/tracks").contentType("application/json")
                .content("{\"trackIds\":[\"so_0002\"]}")).andExpect(status().isUnauthorized());
        add(guest, id, "so_0002", 200);
        mvc.perform(get("/api/playlists/" + id).cookie(cookie(owner)))
                .andExpect(jsonPath("$.tracks.length()").value(2))
                .andExpect(jsonPath("$.tracks[1].id").value("so_0002"));

        // Collaborators cannot insert at a position, import private files, remove, rename, delete or re-share.
        add(guest, id, "im_abc123", 400);
        mvc.perform(delete("/api/me/playlists/" + id + "/tracks/0").cookie(cookie(guest))).andExpect(status().isForbidden());
        mvc.perform(patch("/api/me/playlists/" + id).cookie(cookie(guest)).contentType("application/json")
                .content("{\"name\":\"Hijacked\",\"isCollaborative\":false}")).andExpect(status().isForbidden());
        mvc.perform(delete("/api/me/playlists/" + id).cookie(cookie(guest))).andExpect(status().isForbidden());

        // Turning it off locks it again.
        mvc.perform(patch("/api/me/playlists/" + id).cookie(cookie(owner)).contentType("application/json")
                .content("{\"isCollaborative\":false}")).andExpect(status().isOk());
        add(guest, id, "so_0003", 403);
        mvc.perform(get("/api/playlists/" + id).cookie(cookie(guest))).andExpect(status().isNotFound());
    }

    @Test
    void guestCanSaveACollaborativePlaylistToTheLibrary() throws Exception {
        String owner = newUserSession(), guest = newUserSession();
        String id = createPlaylist(owner, "Shared Mix");
        mvc.perform(put("/api/me/library/playlist/" + id).cookie(cookie(guest))).andExpect(status().isNotFound());
        mvc.perform(patch("/api/me/playlists/" + id).cookie(cookie(owner)).contentType("application/json")
                .content("{\"isCollaborative\":true}")).andExpect(status().isOk());
        mvc.perform(put("/api/me/library/playlist/" + id).cookie(cookie(guest))).andExpect(status().isOk());
        String listed = mvc.perform(get("/api/me/library/playlists").cookie(cookie(guest)))
                .andReturn().getResponse().getContentAsString();
        assertThat(listed).contains(id).contains("Shared Mix");
    }
}
