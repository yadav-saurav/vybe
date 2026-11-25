package app.vybe.api;

import app.vybe.api.discover.Similarity;
import app.vybe.api.model.Song;
import app.vybe.api.search.TextNormalizer;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** Pure unit tests for normalization, the one-edit typo check, and the artist diversity cap. */
class TextMatchingTest {

    @Test
    void normalizeStripsDiacriticsPunctuationAndCase() {
        assertThat(TextNormalizer.normalize("Noór Lántern!")).isEqualTo("noor lantern");
        assertThat(TextNormalizer.normalize("Glass & Rain")).isEqualTo("glass rain");
        assertThat(TextNormalizer.normalize(null)).isEmpty();
    }

    @Test
    void withinOneEditCoversSubstitutionInsertionDeletionAndTransposition() {
        assertThat(TextNormalizer.withinOneEdit("vale", "vale")).isTrue();
        assertThat(TextNormalizer.withinOneEdit("valle", "vale")).isTrue();
        assertThat(TextNormalizer.withinOneEdit("lanterm", "lantern")).isTrue();
        assertThat(TextNormalizer.withinOneEdit("mria", "mira")).isTrue();
        assertThat(TextNormalizer.withinOneEdit("mirra", "mira")).isTrue();
        assertThat(TextNormalizer.withinOneEdit("vaele", "vale")).isTrue();
        assertThat(TextNormalizer.withinOneEdit("vaelle", "vale")).isFalse();
        assertThat(TextNormalizer.withinOneEdit("glass", "grass")).isTrue();
        assertThat(TextNormalizer.withinOneEdit("glass", "gloss")).isTrue();
        assertThat(TextNormalizer.withinOneEdit("cat", "dog")).isFalse();
        assertThat(TextNormalizer.withinOneEdit("abc", "abcde")).isFalse();
    }

    @Test
    void diversifyCapsTracksPerArtist() {
        List<Song> ranked = List.of(song("a", "x"), song("b", "x"), song("c", "x"), song("d", "y"));
        List<Song> picked = Similarity.diversify(ranked, 10, 2);
        assertThat(picked).extracting(Song::id).containsExactly("a", "b", "d");
    }

    @Test
    void jitterIsDeterministicAndInUnitRange() {
        double first = Similarity.jitter("so_0001", "so_0002");
        assertThat(Similarity.jitter("so_0001", "so_0002")).isEqualTo(first);
        assertThat(first).isBetween(0.0, 0.999999);
    }

    private static Song song(String id, String artistId) {
        return new Song(id, id, new app.vybe.api.model.ArtistRef(artistId, artistId), List.of(),
                new app.vybe.api.model.AlbumRef("al", "al"), "pop", 1, 1, 1000, false, false,
                "/api/stream/" + id, null, "2026-01-01", 100, "chill", 0.5, 50, "c", null, null);
    }
}
