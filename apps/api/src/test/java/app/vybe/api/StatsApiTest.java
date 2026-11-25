package app.vybe.api;

import app.vybe.api.support.ApiTestBase;
import org.junit.jupiter.api.Test;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class StatsApiTest extends ApiTestBase {

    private void play(String token, String songId, int ms) throws Exception {
        mvc.perform(post("/api/me/history").cookie(cookie(token)).contentType("application/json")
                        .content("{\"songId\":\"" + songId + "\",\"playedMs\":" + ms + "}"))
                .andExpect(status().isOk());
    }

    @Test
    void replayAggregatesPlaysArtistsGenresAndTime() throws Exception {
        String token = newUserSession();
        play(token, "so_0001", 60_000);
        play(token, "so_0001", 30_000);
        play(token, "so_0002", 45_000);

        mvc.perform(get("/api/me/stats?period=all").cookie(cookie(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.period").value("all"))
                .andExpect(jsonPath("$.plays").value(3))
                .andExpect(jsonPath("$.totalMs").value(135_000))
                .andExpect(jsonPath("$.uniqueSongs").value(2))
                .andExpect(jsonPath("$.topSongs[0].song.id").value("so_0001"))
                .andExpect(jsonPath("$.topSongs[0].plays").value(2))
                .andExpect(jsonPath("$.uniqueArtists").value(1))
                .andExpect(jsonPath("$.topArtists[0].id").value("ar_001"))
                .andExpect(jsonPath("$.topGenres[0].plays").value(3))
                .andExpect(jsonPath("$.activeDays").value(1))
                .andExpect(jsonPath("$.longestStreakDays").value(1))
                .andExpect(jsonPath("$.byHour.length()").value(24));
    }

    @Test
    void emptyHistoryAndAnonymousAccess() throws Exception {
        String token = newUserSession();
        mvc.perform(get("/api/me/stats?period=bogus").cookie(cookie(token)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.period").value("year"))
                .andExpect(jsonPath("$.plays").value(0))
                .andExpect(jsonPath("$.topSongs.length()").value(0));
        mvc.perform(get("/api/me/stats")).andExpect(status().isUnauthorized());
    }
}
