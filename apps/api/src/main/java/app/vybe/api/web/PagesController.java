package app.vybe.api.web;

import app.vybe.api.auth.CurrentUser;
import app.vybe.api.discover.PageService;
import app.vybe.api.model.Pages;
import app.vybe.api.model.PageResponse;
import app.vybe.api.model.User;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PagesController {

    private final PageService pages;

    public PagesController(PageService pages) {
        this.pages = pages;
    }

    @GetMapping("/api/pages/home")
    public PageResponse home(@CurrentUser(required = false) User user) {
        return pages.home(user);
    }

    @GetMapping("/api/pages/new")
    public PageResponse newPage() {
        return pages.newPage();
    }

    @GetMapping("/api/pages/radio")
    public PageResponse radio() {
        return pages.radioPage();
    }

    @GetMapping("/api/pages/browse-categories")
    public Pages.Genres browseCategories() {
        return pages.browseCategories();
    }

    @GetMapping("/api/genres/{id}")
    public PageResponse genre(@PathVariable String id) {
        return pages.genreRoom(id);
    }
}
