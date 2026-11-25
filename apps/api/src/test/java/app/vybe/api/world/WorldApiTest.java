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

    private void appleWithHome() {
        world.setFetcher(url -> {
            calls.add(url);
            if (url.contains("albums.json")) {
                return "{\"feed\":{\"results\":[{\"id\":\"900\",\"name\":\"Big Album\",\"artistName\":\"Star One\",\"artistId\":\"484568188\",\"artworkUrl100\":\"https://is1-ssl.mzstatic.com/x/100x100bb.jpg\",\"releaseDate\":\"2026-01-01\"}]}}";
            }
            if (url.contains("marketingtools")) {
                return "{\"feed\":{\"results\":[{\"id\":\"31\"}]}}";
            }
            if (url.contains("limit=200")) { // album page: the collection, then its tracks
                return "{\"results\":[{\"wrapperType\":\"collection\",\"collectionId\":900,\"collectionName\":\"Big Album\",\"artistName\":\"Star One\",\"artistId\":484568188,"
                        + "\"artworkUrl100\":\"https://is1-ssl.mzstatic.com/x/100x100bb.jpg\",\"releaseDate\":\"2026-01-01T00:00:00Z\"}," + track(61, "Album Song", "Star One", true) + "]}";
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
    }

    private List<String> shelfIds(JsonNode home) {
        List<String> ids = new ArrayList<>();
        home.get("shelves").forEach(sh -> ids.add(sh.get("id").asText()));
        return ids;
    }

    @Test
    void homeShowsATasteSignedOutAndEverythingSignedIn() throws Exception {
        appleWithHome();
        world.warm();
        JsonNode out = json.readTree(mvc.perform(get("/api/world/home")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(shelfIds(out)).containsExactly("trending", "popular-artists", "charts");
        assertThat(out.get("shelves").get(2).get("title").asText()).isEqualTo("Top playlists");
        assertThat(out.get("shelves").get(0).get("link").asText()).isEqualTo("/chart/in");

        String user = newUserSession();
        JsonNode in = json.readTree(mvc.perform(get("/api/world/home").cookie(cookie(user))).andReturn().getResponse().getContentAsString());
        assertThat(shelfIds(in)).startsWith("trending", "popular-artists", "albums", "charts", "bollywood", "tamil", "telugu", "malayalam", "kannada", "punjabi");
        assertThat(in.get("shelves").get(1).get("artists").get(0).get("name").asText()).isEqualTo("Star One");
        assertThat(in.get("shelves").get(2).get("albums").get(0).get("title").asText()).isEqualTo("Big Album");
        assertThat(in.get("shelves").get(3).get("title").asText()).isEqualTo("Featured Charts");

        JsonNode all = json.readTree(mvc.perform(get("/api/world/shelves/popular-artists")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(all.get("kind").asText()).isEqualTo("artists");
        JsonNode album = json.readTree(mvc.perform(get("/api/world/albums/wl_in_900")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(album.get("album").get("title").asText()).isEqualTo("Big Album");
        assertThat(album.get("songs").get(0).get("title").asText()).isEqualTo("Album Song");
        mvc.perform(get("/api/world/albums/nope")).andExpect(status().isNotFound());

        JsonNode found = json.readTree(mvc.perform(get("/api/world/search-all?term=star&country=in")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(found.get("songs")).isNotEmpty();
        assertThat(found.get("albums")).isNotEmpty();
        JsonNode genre = json.readTree(mvc.perform(get("/api/world/section/genre/rock")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(genre.get("shelves").get(0).get("title").asText()).isEqualTo("Worldwide Rock");
        mvc.perform(get("/api/world/section/radio")).andExpect(status().isNotFound());

        JsonNode page = json.readTree(mvc.perform(get("/api/world/artists/wa_484568188?country=in")).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
        assertThat(page.get("artist").get("name").asText()).isEqualTo("Star One");
    }

    @Test
    void appleSongsCanBeSavedLovedAddedToPlaylistsAndPlayed() throws Exception {
        apple();
        mvc.perform(get("/api/world/search?term=famous&country=in")).andExpect(status().isOk());
        String user = newUserSession();
        mvc.perform(put("/api/me/library/song/wd_in_11").cookie(cookie(user))).andExpect(status().isOk());
        mvc.perform(put("/api/me/loves/song/wd_in_11").cookie(cookie(user))).andExpect(status().isOk());
        mvc.perform(post("/api/me/history").cookie(cookie(user)).contentType("application/json")
                .content("{\"songId\":\"wd_in_11\",\"playedMs\":30000}")).andExpect(status().is2xxSuccessful());

        // Apple goes away: the saved snapshot keeps the library working.
        world.setFetcher(url -> { throw new IllegalStateException("down"); });
        JsonNode songs = json.readTree(mvc.perform(get("/api/me/library/songs").cookie(cookie(user))).andReturn().getResponse().getContentAsString());
        assertThat(songs.get("songs").get(0).get("title").asText()).isEqualTo("Sky Song");
        JsonNode recent = json.readTree(mvc.perform(get("/api/me/recently-added").cookie(cookie(user))).andReturn().getResponse().getContentAsString());
        assertThat(recent.get("items").get(0).get("data").get("id").asText()).isEqualTo("wd_in_11");
        JsonNode history = json.readTree(mvc.perform(get("/api/me/history").cookie(cookie(user))).andReturn().getResponse().getContentAsString());
        assertThat(history.get("entries").get(0).get("song").get("title").asText()).isEqualTo("Sky Song");

        JsonNode pl = json.readTree(mvc.perform(post("/api/me/playlists").cookie(cookie(user)).contentType("application/json")
                .content("{\"name\":\"World Mix\",\"trackIds\":[\"wd_in_11\"]}")).andExpect(status().is2xxSuccessful()).andReturn().getResponse().getContentAsString());
        String id = pl.get("playlist").get("id").asText();
        JsonNode page = json.readTree(mvc.perform(get("/api/playlists/" + id).cookie(cookie(user))).andReturn().getResponse().getContentAsString());
        assertThat(page.get("tracks").get(0).get("id").asText()).isEqualTo("wd_in_11");
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
