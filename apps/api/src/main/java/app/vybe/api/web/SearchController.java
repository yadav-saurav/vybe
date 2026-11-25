package app.vybe.api.web;

import app.vybe.api.auth.CurrentUser;
import app.vybe.api.imports.ImportService;
import app.vybe.api.model.Pages;
import app.vybe.api.model.User;
import app.vybe.api.model.SearchResults;
import app.vybe.api.search.SearchService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SearchController {

    private final SearchService search;
    private final ImportService imports;

    public SearchController(SearchService search, ImportService imports) {
        this.search = search;
        this.imports = imports;
    }

    @GetMapping("/api/search")
    public SearchResults search(@RequestParam(value = "term", defaultValue = "") String term,
                                @RequestParam(value = "types", required = false) String types,
                                @RequestParam(value = "limit", required = false) Integer limit,
                                @CurrentUser(required = false) User viewer) {
        // Signed-in users also find their own imported tracks.
        return search.search(term, types, limit, viewer == null ? java.util.List.of() : imports.list(viewer.id()));
    }

    @GetMapping("/api/search/suggestions")
    public Pages.Suggestions suggestions(@RequestParam(value = "term", defaultValue = "") String term) {
        return search.suggestions(term);
    }
}
