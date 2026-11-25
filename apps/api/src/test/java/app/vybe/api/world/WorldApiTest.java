package app.vybe.api.world;

import app.vybe.api.support.ApiTestBase;
import com.fasterxml.jackson.databind.JsonNode;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Worldwide previews, with Apple's APIs replaced by canned answers (CI never calls Apple). */
class WorldApiTest extends ApiTestBase {

    @Autowired
    WorldService world;

    private final List<String> calls = new ArrayList<>();

    private static String track(long id, String name, String artist, boolean preview) {
        return """
                {"wrapperType":"track","kind":"song","trackId":%d,"trackName":"%s","artistId":77,"artistName":"%s",
                 "collectionId":900,"collectionName":"Big Album","trackNumber":2,"discNumber":1,"trackTimeMillis":201000,
                 "releaseDate":"2024-05-01T07:00:00Z","trackExplicitness":"notExplicit","primaryGenreName":"Bollywood",
                 "artworkUrl100":"https://is1-ssl.mzstatic.com/image/thumb/x/100x100bb.jpg"%s}"""
                .formatted(id, name, artist, preview ? ",\"previewUrl\":\"https://audio-ssl.itunes.apple.com/p/" + id + ".m4a\"" : "");
    }

    private void apple() {
        world.setFetcher(url -> {
            calls.add(url);
            if (url.contains("/search?")) {
                return "{\"resultCount\":3,\"results\":[" + track(11, "Sky Song", "Famous Singer", true) + ","
                        + track(12, "No Clip", "Famous Singer", false) + ","
                        + "{\"wrapperType\":\"collection\",\"collectionId\":900}]}";
            }
            if (url.contains("marketingtools")) {
                return "{\"feed\":{\"results\":[{\"id\":\"22\"},{\"id\":\"21\"}]}}";
            }
            if (url.contains("/lookup?")) {
                return "{\"results\":[" + track(21, "Second", "B", true) + "," + track(22, "First", "A", true) + "]}";
            }
            throw new IllegalStateException("unexpected " + url);
        });
    }

    @AfterEach
    void reset() {
        world.setFetcher(url -> { throw new IllegalStateException("offline"); });
    }

    @Test
    void searchReturnsPlayableSongsWithPreviewsAndCachesTheAnswer() throws Exception {
        apple();
        JsonNode r = json.readTree(mvc.perform(get("/api/world/search?term=famous singer&country=IN"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(r.get("country").asText()).isEqualTo("in");
        JsonNode songs = r.get("songs");
        assertThat(songs).hasSize(1); // the track without a preview and the non-song are dropped
        JsonNode s = songs.get(0);
        assertThat(s.get("id").asText()).isEqualTo("wd_in_11");
        assertThat(s.get("source").asText()).isEqualTo("world");
        assertThat(s.get("audioUrl").asText()).startsWith("https://audio-ssl.itunes.apple.com/");
        assertThat(s.get("artwork").get("url").asText()).contains("600x600bb");
        assertThat(s.get("album").get("id").asText()).isEqualTo("wl_in_900");

        mvc.perform(get("/api/world/search?term=Famous Singer&country=in")).andExpect(status().isOk());
        assertThat(calls).hasSize(1);
        mvc.perform(get("/api/world/search?term=x")).andExpect(status().isBadRequest());
    }

    @Test
    void chartKeepsTheChartOrderAndUnknownCountriesFallBackToUs() throws Exception {
        apple();
        JsonNode r = json.readTree(mvc.perform(get("/api/world/charts?country=zz"))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(r.get("country").asText()).isEqualTo("us");
        assertThat(r.get("title").asText()).isEqualTo("Top Songs in United States");
        assertThat(r.get("songs").get(0).get("title").asText()).isEqualTo("First");
        assertThat(r.get("songs").get(1).get("title").asText()).isEqualTo("Second");
        assertThat(json.readTree(mvc.perform(get("/api/world/countries")).andReturn().getResponse().getContentAsString())
                .get("countries").get(0).get("code").asText()).isEqualTo("in");
    }

    @Test
    void homeFillsShelvesFromChartsSearchesAndSuperstarsAndArtistPagesWork() throws Exception {
        world.setFetcher(url -> {
            calls.add(url);
            if (url.contains("marketingtools")) {
                return "{\"feed\":{\"results\":[{\"id\":\"31\"}]}}";
            }
            if (url.contains("/lookup?") && url.contains("limit=")) { // superstars: artist record, then its tracks
                return "{\"results\":[{\"wrapperType\":\"artist\",\"artistId\":484568188,\"artistName\":\"Star One\",\"primaryGenreName\":\"Bollywood\"},"
                        + track(41, "Star Song", "Star One", true) + "," + track(42, "Star Song 2", "Star One", true) + "]}";
            }
            if (url.contains("/lookup?")) {
                return "{\"results\":[" + track(31, "Chart Topper", "Chart Artist", true) + "]}";
            }
            return "{\"results\":[" + track(51, "Regional Hit", "Regional Artist", true) + "]}";
        });
        world.warm();
        JsonNode home = json.readTree(mvc.perform(get("/api/world/home")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        List<String> ids = new ArrayList<>();
        home.get("shelves").forEach(sh -> ids.add(sh.get("id").asText()));
        assertThat(ids).startsWith("trending-in", "stars-in", "top-in", "bollywood", "tamil", "telugu", "malayalam", "kannada", "punjabi", "best-arijit");
        JsonNode hero = home.get("shelves").get(0);
        assertThat(hero.get("kind").asText()).isEqualTo("hero");
        assertThat(hero.get("songs").get(0).get("title").asText()).isEqualTo("Chart Topper");
        JsonNode stars = home.get("shelves").get(1);
        assertThat(stars.get("kind").asText()).isEqualTo("artists");
        assertThat(stars.get("artists").get(0).get("name").asText()).isEqualTo("Star One");
        assertThat(stars.get("artists").get(0).get("artwork").get("url").asText()).contains("600x600bb");

        JsonNode page = json.readTree(mvc.perform(get("/api/world/artists/wa_484568188?country=in")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertThat(page.get("artist").get("name").asText()).isEqualTo("Star One");
        assertThat(page.get("songs")).hasSize(2);
        mvc.perform(get("/api/world/artists/nope")).andExpect(status().isNotFound());
    }

    @Test
    void appleBeingDownIsAFriendlyErrorAndJamAcceptsWorldSongs() throws Exception {
        world.setFetcher(url -> { throw new IllegalStateException("down"); });
        mvc.perform(get("/api/world/charts?country=gb")).andExpect(status().is(502))
                .andExpect(jsonPath("$.error.code").value("world_unavailable"));

        apple();
        mvc.perform(get("/api/world/search?term=famous&country=in")).andExpect(status().isOk());
        String host = newUserSession();
        JsonNode jam = json.readTree(mvc.perform(post("/api/jams").cookie(cookie(host)).contentType("application/json")
                .content("{\"songIds\":[\"wd_in_11\",\"so_0001\"]}")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(jam.get("queue")).hasSize(2);
        assertThat(jam.get("queue").get(0).get("song").get("source").asText()).isEqualTo("world");
        mvc.perform(post("/api/jams/" + jam.get("code").asText() + "/leave").cookie(cookie(host))).andExpect(status().isNoContent());
    }
}
