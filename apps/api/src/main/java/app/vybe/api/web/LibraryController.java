package app.vybe.api.web;

import app.vybe.api.auth.CurrentUser;
import app.vybe.api.library.LibraryService;
import app.vybe.api.model.LibraryState;
import app.vybe.api.model.Pages;
import app.vybe.api.model.User;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/me")
public class LibraryController {

    private final LibraryService library;

    public LibraryController(LibraryService library) {
        this.library = library;
    }

    @GetMapping("/library")
    public LibraryState state(@CurrentUser User user) {
        return library.state(user.id());
    }

    @PutMapping("/library/{type}/{id}")
    public LibraryState add(@CurrentUser User user, @PathVariable String type, @PathVariable String id) {
        return library.add(user.id(), type, id);
    }

    @DeleteMapping("/library/{type}/{id}")
    public LibraryState remove(@CurrentUser User user, @PathVariable String type, @PathVariable String id) {
        return library.remove(user.id(), type, id);
    }

    @PutMapping("/loves/{type}/{id}")
    public LibraryState love(@CurrentUser User user, @PathVariable String type, @PathVariable String id) {
        return library.love(user.id(), type, id);
    }

    @DeleteMapping("/loves/{type}/{id}")
    public LibraryState unlove(@CurrentUser User user, @PathVariable String type, @PathVariable String id) {
        return library.unlove(user.id(), type, id);
    }

    @GetMapping("/library/liked")
    public Pages.Songs liked(@CurrentUser User user) {
        return new Pages.Songs(library.liked(user.id()));
    }

    @GetMapping("/library/songs")
    public Pages.Songs songs(@CurrentUser User user) {
        return new Pages.Songs(library.songs(user.id()));
    }

    @GetMapping("/library/albums")
    public Pages.Albums albums(@CurrentUser User user) {
        return new Pages.Albums(library.albums(user.id()));
    }

    @GetMapping("/library/artists")
    public Pages.Artists artists(@CurrentUser User user) {
        return new Pages.Artists(library.artists(user.id()));
    }

    @GetMapping("/library/playlists")
    public Pages.Playlists playlists(@CurrentUser User user) {
        return new Pages.Playlists(library.playlists(user.id()));
    }

    @GetMapping("/recently-added")
    public Pages.Items recentlyAdded(@CurrentUser User user) {
        return new Pages.Items(library.recentlyAdded(user.id()));
    }
}
