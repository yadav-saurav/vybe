package app.vybe.api.web;

import app.vybe.api.model.Pages;
import app.vybe.api.model.SearchResults;
import app.vybe.api.search.SearchService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SearchController {

    private final SearchService search;

    public SearchController(SearchService search) {
        this.search = search;
    }

    @GetMapping("/api/search")
    public SearchResults search(@RequestParam(value = "term", defaultValue = "") String term,
                                @RequestParam(value = "types", required = false) String types,
                                @RequestParam(value = "limit", required = false) Integer limit) {
        return search.search(term, types, limit);
    }

    @GetMapping("/api/search/suggestions")
    public Pages.Suggestions suggestions(@RequestParam(value = "term", defaultValue = "") String term) {
        return search.suggestions(term);
    }
}
