package app.vybe.api.catalog;

import app.vybe.api.discover.Similarity;
import app.vybe.api.error.ApiException;
import app.vybe.api.model.Album;
import app.vybe.api.model.Artist;
import app.vybe.api.model.LyricLine;
import app.vybe.api.model.Pages;
import app.vybe.api.model.Song;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** Song, album and artist detail reads. */
@Service
public class CatalogService {

    private final CatalogStore catalog;
    private final Similarity similarity;

    public CatalogService(CatalogStore catalog, Similarity similarity) {
        this.catalog = catalog;
        this.similarity = similarity;
    }

    public Song song(String id) {
        Song s = catalog.song(id);
        if (s == null) {
            throw ApiException.notFound("No song with id " + id);
        }
        return s;
    }

    /** Requested songs in request order; unknown ids are skipped. */
    public List<Song> songs(List<String> ids) {
        List<Song> out = new ArrayList<>(ids.size());
        for (String id : new LinkedHashSet<>(ids)) {
            Song s = catalog.song(id);
            if (s != null) {
                out.add(s);
            }
        }
        return out;
    }

    public List<LyricLine> lyrics(String songId) {
        Song s = song(songId);
        List<LyricLine> lines = catalog.lyrics(s.id());
        if (!s.hasLyrics() || lines == null) {
            throw ApiException.notFound("No lyrics for song " + songId);
        }
        return lines;
    }

    public Pages.AlbumPage album(String id) {
        Album album = catalog.album(id);
        if (album == null) {
            throw ApiException.notFound("No album with id " + id);
        }
        List<Album> moreByArtist = catalog.albumsOfArtist(album.artist().id()).stream()
                .filter(a -> !a.id().equals(id)).limit(12).toList();
        Set<String> exclude = new HashSet<>();
        exclude.add(id);
        moreByArtist.forEach(a -> exclude.add(a.id()));
        return new Pages.AlbumPage(album, catalog.tracksOfAlbum(id), moreByArtist,
                similarity.similarAlbums(album, exclude, 8));
    }

    public Pages.ArtistPage artist(String id) {
        Artist artist = catalog.artist(id);
        if (artist == null) {
            throw ApiException.notFound("No artist with id " + id);
        }
        List<Album> own = catalog.albumsOfArtist(id);
        List<Album> albums = own.stream().filter(a -> "album".equals(a.type()) || "compilation".equals(a.type())).toList();
        List<Album> singles = own.stream().filter(a -> "single".equals(a.type()) || "ep".equals(a.type())).toList();
        return new Pages.ArtistPage(
                artist,
                own.isEmpty() ? null : own.get(0),
                artistSongs(id, "popularity").stream().limit(10).toList(),
                albums,
                singles,
                catalog.albumsFeaturing(id),
                catalog.editorialContaining(id).stream().limit(10).toList(),
                similarity.similarArtists(id, 8));
    }

    /** Primary and featured tracks of an artist, sorted by popularity or by release date (newest first). */
    public List<Song> artistSongs(String artistId, String sort) {
        if (catalog.artist(artistId) == null) {
            throw ApiException.notFound("No artist with id " + artistId);
        }
        List<Song> all = new ArrayList<>(catalog.songsOfArtist(artistId));
        for (Song s : catalog.featuredSongsOf(artistId)) {
            if (!all.contains(s)) {
                all.add(s);
            }
        }
        Comparator<Song> order = "date".equals(sort)
                ? Comparator.comparing(Song::releaseDate).reversed().thenComparing(Song::id)
                : Comparator.comparingInt(Song::popularity).reversed().thenComparing(Song::id);
        all.sort(order);
        return all;
    }
}
