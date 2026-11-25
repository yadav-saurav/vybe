package app.vybe.api;

import app.vybe.api.support.ApiTestBase;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class PagesAndCatalogApiTest extends ApiTestBase {

    @Test
    void anonymousHomeHasEditorialShelves() throws Exception {
        mvc.perform(get("/api/pages/home")).andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Home"))
                .andExpect(jsonPath("$.shelves[*].id", hasItems("top-picks", "vybe-today", "popular-albums",
                        "featured-artists", "genre-pop")))
                .andExpect(jsonPath("$.shelves[?(@.id=='vybe-today')].layout").value(hasItem("song-list")))
                .andExpect(jsonPath("$.shelves[?(@.id=='featured-artists')].layout").value(hasItem("circle-artists")))
                .andExpect(jsonPath("$.shelves[0].items[0].type").value("playlist"));
    }

    @Test
    void signedInHomeIsPersonalizedWithMixes() throws Exception {
        String token = signInDemo();
        MvcResult r = mvc.perform(get("/api/pages/home").cookie(cookie(token))).andExpect(status().isOk())
                .andExpect(jsonPath("$.shelves[*].id", hasItems("top-picks-for-you", "recently-played",
                        "made-for-you")))
                .andReturn();
        Map<?, ?> page = json.readValue(r.getResponse().getContentAsString(), Map.class);
        List<?> shelves = (List<?>) page.get("shelves");
        Map<?, ?> madeForYou = shelves.stream().map(s -> (Map<?, ?>) s)
                .filter(s -> "made-for-you".equals(s.get("id"))).findFirst().orElseThrow();
        List<?> mixes = (List<?>) madeForYou.get("items");
        // Made For You is the only place mixes appear: Discover Weekly, Favorites Mix, then Daily Mixes.
        Map<?, ?> weekly = (Map<?, ?>) ((Map<?, ?>) mixes.get(0)).get("data");
        assertThat(weekly.get("name")).isEqualTo("Discover Weekly");
        Map<?, ?> fav = (Map<?, ?>) ((Map<?, ?>) mixes.get(1)).get("data");
        assertThat(fav.get("name")).isEqualTo("Favorites Mix");
        Map<?, ?> daily1 = (Map<?, ?>) ((Map<?, ?>) mixes.get(2)).get("data");
        assertThat(daily1.get("name")).isEqualTo("Daily Mix 1");
        Map<?, ?> topPicks = shelves.stream().map(s -> (Map<?, ?>) s)
                .filter(s -> "top-picks-for-you".equals(s.get("id"))).findFirst().orElseThrow();
        // Top Picks never repeats the mixes shown in Made For You.
        assertThat((List<?>) topPicks.get("items")).allSatisfy(i -> assertThat(String.valueOf(((Map<?, ?>) ((Map<?, ?>) i).get("data")).get("id"))).doesNotStartWith("pl_mix_"));
        // Both mixes open as playlists for their owner.
        for (Object id : List.of(weekly.get("id"), daily1.get("id"))) {
            mvc.perform(get("/api/playlists/" + id).cookie(cookie(token))).andExpect(status().isOk())
                    .andExpect(jsonPath("$.tracks.length()").value(org.hamcrest.Matchers.greaterThan(0)));
        }
    }

    @Test
    void mixIdResolvesOnlyForItsOwner() throws Exception {
        String demoToken = signInDemo();
        String mixId = mixIdFor(demoToken);
        mvc.perform(get("/api/playlists/" + mixId).cookie(cookie(demoToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.playlist.kind").value("personal-mix"))
                .andExpect(jsonPath("$.tracks.length()").value(greaterThan(0)));
        mvc.perform(get("/api/playlists/" + mixId)).andExpect(status().isNotFound());
        mvc.perform(get("/api/playlists/" + mixId).cookie(cookie(newUserSession())))
                .andExpect(status().isNotFound());
    }

    @Test
    void newPageHasHeroAndChronologicalReleases() throws Exception {
        mvc.perform(get("/api/pages/new")).andExpect(status().isOk())
                .andExpect(jsonPath("$.shelves[0].layout").value("hero"))
                .andExpect(jsonPath("$.shelves[0].heroCards.length()").value(allOf(greaterThanOrEqualTo(4), lessThanOrEqualTo(6))))
                .andExpect(jsonPath("$.shelves[0].heroCards[0].eyebrow").value(startsWith("NEW ")))
                .andExpect(jsonPath("$.shelves[?(@.id=='best-new-songs')].layout").value(hasItem("song-list")))
                .andExpect(jsonPath("$.shelves[?(@.id=='new-releases')].items[0].data.id").value(hasItem("al_004")))
                .andExpect(jsonPath("$.shelves[*].id", hasItems("updated-playlists", "everyone-listening",
                        "new-in-pop", "top-albums")));
    }

    @Test
    void radioPageLeadsWithLiveStationsAndStationShelves() throws Exception {
        mvc.perform(get("/api/pages/radio")).andExpect(status().isOk())
                .andExpect(jsonPath("$.shelves[0].id").value("live-stations"))
                .andExpect(jsonPath("$.shelves[0].layout").value("grid-lockups"))
                .andExpect(jsonPath("$.shelves[0].items[0].data.kind").value("live"))
                .andExpect(jsonPath("$.shelves[?(@.id=='genre-stations')].items.length()").value(hasItem(2)))
                .andExpect(jsonPath("$.shelves[?(@.id=='artist-stations')].items[0].data.kind").value(hasItem("artist")));
    }

    @Test
    void browseCategoriesAndGenreRoomsWork() throws Exception {
        mvc.perform(get("/api/pages/browse-categories")).andExpect(status().isOk())
                .andExpect(jsonPath("$.genres.length()").value(3))
                .andExpect(jsonPath("$.genres[0].artwork.url").value(startsWith("/media/art/")));
        mvc.perform(get("/api/genres/pop")).andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("Pop"))
                .andExpect(jsonPath("$.shelves[*].id", hasItems("genre-top-songs-pop", "genre-albums-pop",
                        "genre-artists-pop", "genre-stations-pop")));
        mvc.perform(get("/api/genres/polka")).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.error.code").value("not_found"));
    }

    @Test
    void songEndpointsShapeAndOrder() throws Exception {
        mvc.perform(get("/api/songs/so_0001")).andExpect(status().isOk())
                .andExpect(jsonPath("$.song.id").value("so_0001"))
                .andExpect(jsonPath("$.song.audioUrl").value("/api/stream/so_0001"))
                .andExpect(jsonPath("$.song.isExplicit").value(false))
                .andExpect(jsonPath("$.song.mood").value("dreamy"))
                .andExpect(jsonPath("$.song.album.id").value("al_001"))
                .andExpect(jsonPath("$.song.featuring").isArray());
        mvc.perform(get("/api/songs?ids=so_0002,so_9999,so_0001")).andExpect(status().isOk())
                .andExpect(jsonPath("$.songs[*].id", contains("so_0002", "so_0001")));
        mvc.perform(get("/api/songs/so_9999")).andExpect(status().isNotFound());
    }

    @Test
    void lyricsReturnLinesOr404() throws Exception {
        mvc.perform(get("/api/songs/so_0001/lyrics")).andExpect(status().isOk())
                .andExpect(jsonPath("$.lines.length()").value(5))
                .andExpect(jsonPath("$.lines[0].text").value(""))
                .andExpect(jsonPath("$.lines[1].startMs").value(4000));
        mvc.perform(get("/api/songs/so_0002/lyrics")).andExpect(status().isNotFound());
    }

    @Test
    void albumPageHasTracksMoreByArtistAndSimilarAlbums() throws Exception {
        mvc.perform(get("/api/albums/al_001")).andExpect(status().isOk())
                .andExpect(jsonPath("$.album.artist.name").value("Mira Vale"))
                .andExpect(jsonPath("$.tracks.length()").value(3))
                .andExpect(jsonPath("$.tracks[0].trackNumber").value(1))
                .andExpect(jsonPath("$.moreByArtist.length()").value(0))
                .andExpect(jsonPath("$.youMightAlsoLike.length()").value(3))
                .andExpect(jsonPath("$.youMightAlsoLike[*].artist.id", not(hasItem("ar_001"))));
        mvc.perform(get("/api/albums/al_999")).andExpect(status().isNotFound());
    }

    @Test
    void artistPageSplitsReleasesAndListsAppearances() throws Exception {
        mvc.perform(get("/api/artists/ar_003")).andExpect(status().isOk())
                .andExpect(jsonPath("$.artist.name").value("Noor Lantern"))
                .andExpect(jsonPath("$.latestRelease.id").value("al_003"))
                .andExpect(jsonPath("$.albums[*].id", contains("al_003")))
                .andExpect(jsonPath("$.singlesAndEps.length()").value(0))
                .andExpect(jsonPath("$.appearsOn[*].id", hasItem("al_001")))
                .andExpect(jsonPath("$.topSongs.length()").value(5))
                .andExpect(jsonPath("$.similarArtists.length()").value(greaterThan(0)));
        mvc.perform(get("/api/artists/ar_004")).andExpect(status().isOk())
                .andExpect(jsonPath("$.singlesAndEps[0].id").value("al_004"))
                .andExpect(jsonPath("$.appearsOn[*].id", hasItem("al_003")));
        mvc.perform(get("/api/artists/ar_001/songs?sort=date")).andExpect(status().isOk())
                .andExpect(jsonPath("$.songs.length()").value(3));
        mvc.perform(get("/api/artists/nope")).andExpect(status().isNotFound());
    }

    @Test
    void stationsNeverReturnExcludedIds() throws Exception {
        mvc.perform(get("/api/stations/st_002/next?count=6&exclude=so_0001,so_0002")).andExpect(status().isOk())
                .andExpect(jsonPath("$.station.kind").value("genre"))
                .andExpect(jsonPath("$.tracks[*].genreId", everyItem(is("pop"))))
                .andExpect(jsonPath("$.tracks[*].id", not(hasItems("so_0001", "so_0002"))));
        mvc.perform(get("/api/stations/st_003/next?count=8")).andExpect(status().isOk())
                .andExpect(jsonPath("$.tracks[0].artist.id").value("ar_001"))
                .andExpect(jsonPath("$.tracks[*].id", hasItem("so_0001")));
        mvc.perform(get("/api/stations/st_001/next?count=10&exclude=so_0004")).andExpect(status().isOk())
                .andExpect(jsonPath("$.tracks[*].id", not(hasItem("so_0004"))));
        mvc.perform(get("/api/stations/st_404/next")).andExpect(status().isNotFound());
    }

    @Test
    void autoplayExcludesSeedAndIdsAndCapsArtistRepeats() throws Exception {
        MvcResult r = mvc.perform(get("/api/recommendations/autoplay?songId=so_0001&exclude=so_0002&count=10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.songs.length()").value(greaterThan(0)))
                .andExpect(jsonPath("$.songs[*].id", not(hasItems("so_0001", "so_0002"))))
                .andReturn();
        Map<?, ?> body = json.readValue(r.getResponse().getContentAsString(), Map.class);
        List<?> songs = (List<?>) body.get("songs");
        Map<String, Integer> perArtist = new java.util.HashMap<>();
        for (Object o : songs) {
            String artist = (String) ((Map<?, ?>) ((Map<?, ?>) o).get("artist")).get("id");
            perArtist.merge(artist, 1, Integer::sum);
        }
        assertThat(perArtist.values()).allMatch(n -> n <= 2);
    }

    private String mixIdFor(String token) throws Exception {
        MvcResult r = mvc.perform(get("/api/pages/home").cookie(cookie(token))).andReturn();
        Map<?, ?> page = json.readValue(r.getResponse().getContentAsString(), Map.class);
        for (Object s : (List<?>) page.get("shelves")) {
            Map<?, ?> shelf = (Map<?, ?>) s;
            if ("made-for-you".equals(shelf.get("id"))) {
                return (String) ((Map<?, ?>) ((Map<?, ?>) ((List<?>) shelf.get("items")).get(0)).get("data")).get("id");
            }
        }
        throw new AssertionError("no made-for-you shelf");
    }
}
