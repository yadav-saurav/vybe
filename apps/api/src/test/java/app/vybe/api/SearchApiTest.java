package app.vybe.api;

import app.vybe.api.support.ApiTestBase;
import org.junit.jupiter.api.Test;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class SearchApiTest extends ApiTestBase {

    @Test
    void exactNameRanksFirstAndPopularityBreaksTies() throws Exception {
        mvc.perform(get("/api/search").param("term", "Glass Hours")).andExpect(status().isOk())
                .andExpect(jsonPath("$.term").value("Glass Hours"))
                .andExpect(jsonPath("$.songs[0].id").value("so_0001"))
                .andExpect(jsonPath("$.albums[0].id").value("al_001"))
                .andExpect(jsonPath("$.top[0].type").value("song"));
    }

    @Test
    void prefixAndTokenPrefixMatch() throws Exception {
        mvc.perform(get("/api/search").param("term", "glas")).andExpect(status().isOk())
                .andExpect(jsonPath("$.albums[*].id", hasItem("al_001")));
        mvc.perform(get("/api/search").param("term", "lant")).andExpect(status().isOk())
                .andExpect(jsonPath("$.artists[*].id", hasItem("ar_003")));
    }

    @Test
    void diacriticsAreIgnored() throws Exception {
        mvc.perform(get("/api/search").param("term", "Noór Lántern")).andExpect(status().isOk())
                .andExpect(jsonPath("$.artists[0].id").value("ar_003"));
    }

    @Test
    void typosAreTolerated() throws Exception {
        mvc.perform(get("/api/search").param("term", "mira valle")).andExpect(status().isOk())
                .andExpect(jsonPath("$.artists[*].id", hasItem("ar_001")));
        mvc.perform(get("/api/search").param("term", "Lanterm")).andExpect(status().isOk())
                .andExpect(jsonPath("$.artists[*].id", hasItem("ar_003")));
    }

    @Test
    void descriptionsAreSearchedWithLowWeight() throws Exception {
        mvc.perform(get("/api/search").param("term", "tape hiss")).andExpect(status().isOk())
                .andExpect(jsonPath("$.albums[*].id", hasItem("al_004")));
    }

    @Test
    void typesFilterAndPlaylistsAreSearchable() throws Exception {
        mvc.perform(get("/api/search").param("term", "rain").param("types", "playlists")).andExpect(status().isOk())
                .andExpect(jsonPath("$.playlists[0].id").value("pl_ed_001"))
                .andExpect(jsonPath("$.songs.length()").value(0))
                .andExpect(jsonPath("$.artists.length()").value(0));
        mvc.perform(get("/api/search").param("term", "").param("limit", "5")).andExpect(status().isOk())
                .andExpect(jsonPath("$.top.length()").value(0));
    }

    @Test
    void suggestionsReturnTermsAndContentWithinLimits() throws Exception {
        mvc.perform(get("/api/search/suggestions").param("term", "mi")).andExpect(status().isOk())
                .andExpect(jsonPath("$.suggestions[?(@.kind=='term')].term").value(hasItem("Mira Vale")))
                .andExpect(jsonPath("$.suggestions[?(@.kind=='content')].item.type").value(hasItem("artist")))
                .andExpect(jsonPath("$.suggestions.length()").value(lessThanOrEqualTo(8)));
    }
}
