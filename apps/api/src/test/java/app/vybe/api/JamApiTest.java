package app.vybe.api;

import app.vybe.api.support.ApiTestBase;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class JamApiTest extends ApiTestBase {

    private JsonNode call(String token, MockHttpServletRequestBuilder req, int status) throws Exception {
        MvcResult r = mvc.perform(req.cookie(cookie(token)).contentType("application/json"))
                .andExpect(status().is(status)).andReturn();
        String body = r.getResponse().getContentAsString();
        return body.isEmpty() ? null : json.readTree(body);
    }

    private JsonNode control(String token, String code, String body, int status) throws Exception {
        return call(token, post("/api/jams/" + code + "/control").content(body), status);
    }

    @Test
    void hostStartsGuestJoinsAndBothShareOnePlayheadAndQueue() throws Exception {
        String host = newUserSession(), guest = newUserSession();

        JsonNode jam = call(host, post("/api/jams").content("{\"songIds\":[\"so_0001\",\"so_0002\",\"so_0003\"],\"index\":1,\"positionMs\":30000,\"playing\":true}"), 200);
        String code = jam.get("code").asText();
        assertThat(code).hasSize(6);
        assertThat(jam.get("index").asInt()).isEqualTo(1);
        assertThat(jam.get("queue")).hasSize(3);
        assertThat(jam.get("positionMs").asLong()).isGreaterThanOrEqualTo(30000);

        // Not a member yet: may look (to show the join page), may not control.
        assertThat(call(guest, get("/api/jams/" + code), 200).get("hostId").asText()).isEqualTo(jam.get("hostId").asText());
        control(guest, code, "{\"action\":\"pause\"}", 403);

        JsonNode joined = call(guest, post("/api/jams/" + code.toLowerCase() + "/join"), 200);
        assertThat(joined.get("listeners")).hasSize(2);
        assertThat(call(guest, get("/api/me/jam"), 200).get("jam").get("code").asText()).isEqualTo(code);

        // Guest pauses at a position; host sees the same anchor.
        JsonNode paused = control(guest, code, "{\"action\":\"pause\",\"positionMs\":45000}", 200);
        assertThat(paused.get("playing").asBoolean()).isFalse();
        assertThat(call(host, get("/api/jams/" + code), 200).get("positionMs").asLong()).isEqualTo(45000);

        // Guest adds a song to play next; it lands right after the current one, credited to them.
        JsonNode added = call(guest, post("/api/jams/" + code + "/queue").content("{\"songIds\":[\"so_0004\"],\"position\":\"next\"}"), 200);
        assertThat(added.get("queue").get(2).get("song").get("id").asText()).isEqualTo("so_0004");
        assertThat(added.get("queue").get(2).get("addedBy").asText()).isEqualTo("Tester");

        JsonNode next = control(host, code, "{\"action\":\"next\"}", 200);
        assertThat(next.get("index").asInt()).isEqualTo(2);
        assertThat(next.get("playing").asBoolean()).isTrue();

        // Two players report the same song ended: only the first advances.
        assertThat(control(host, code, "{\"action\":\"ended\",\"index\":2}", 200).get("index").asInt()).isEqualTo(3);
        assertThat(control(guest, code, "{\"action\":\"ended\",\"index\":2}", 200).get("index").asInt()).isEqualTo(3);

        // End of queue: stops at the start of the last song.
        JsonNode done = control(host, code, "{\"action\":\"ended\",\"index\":3}", 200);
        assertThat(done.get("index").asInt()).isEqualTo(3);
        assertThat(done.get("playing").asBoolean()).isFalse();

        assertThat(control(host, code, "{\"action\":\"jump\",\"index\":0}", 200).get("index").asInt()).isZero();
    }

    @Test
    void hostCanTurnOffGuestControlsButGuestsCanStillAddSongs() throws Exception {
        String host = newUserSession(), guest = newUserSession();
        String code = call(host, post("/api/jams").content("{\"songIds\":[\"so_0001\",\"so_0002\"]}"), 200).get("code").asText();
        call(guest, post("/api/jams/" + code + "/join"), 200);

        call(guest, patch("/api/jams/" + code).content("{\"guestsCanControl\":false}"), 403);
        assertThat(call(host, patch("/api/jams/" + code).content("{\"guestsCanControl\":false}"), 200).get("guestsCanControl").asBoolean()).isFalse();

        control(guest, code, "{\"action\":\"next\"}", 403);
        JsonNode added = call(guest, post("/api/jams/" + code + "/queue").content("{\"songIds\":[\"so_0005\"]}"), 200);
        String mine = added.get("queue").get(2).get("entryId").asText();
        String hosts = added.get("queue").get(1).get("entryId").asText();

        call(guest, delete("/api/jams/" + code + "/queue/" + hosts), 403);
        assertThat(call(guest, delete("/api/jams/" + code + "/queue/" + mine), 200).get("queue")).hasSize(2);
    }

    @Test
    void importedSongsAreRefusedAndHostLeavingEndsTheJam() throws Exception {
        String host = newUserSession(), guest = newUserSession();
        call(host, post("/api/jams").content("{\"songIds\":[\"im_private1\"]}"), 400);

        String code = call(host, post("/api/jams").content("{}"), 200).get("code").asText();
        call(guest, post("/api/jams/" + code + "/join"), 200);
        // Empty Jam: the first song a guest adds starts playing.
        JsonNode started = call(guest, post("/api/jams/" + code + "/queue").content("{\"songIds\":[\"so_0003\"]}"), 200);
        assertThat(started.get("playing").asBoolean()).isTrue();

        call(guest, post("/api/jams/" + code + "/leave"), 204);
        assertThat(call(host, get("/api/jams/" + code), 200).get("listeners")).hasSize(1);
        call(guest, post("/api/jams/" + code + "/join"), 200);

        call(host, post("/api/jams/" + code + "/leave"), 204);
        call(guest, get("/api/jams/" + code), 404);
        assertThat(call(guest, get("/api/me/jam"), 200).path("jam").path("code").isMissingNode()).isTrue();
    }

    @Test
    void eventStreamSendsTheCurrentStateOnConnect() throws Exception {
        String host = newUserSession();
        String code = call(host, post("/api/jams").content("{\"songIds\":[\"so_0001\"]}"), 200).get("code").asText();
        MvcResult r = mvc.perform(get("/api/jams/" + code + "/events").cookie(cookie(host)))
                .andExpect(request().asyncStarted()).andReturn();
        String body = r.getResponse().getContentAsString();
        assertThat(body).startsWith("event:jam").contains("\"code\":\"" + code + "\"");
        mvc.perform(get("/api/jams/" + code + "/events")).andExpect(status().isUnauthorized());
    }
}
