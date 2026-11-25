package app.vybe.api.model;

/** Either a term completion ({@code kind = "term"}) or a content item ({@code kind = "content"}). */
public record SearchSuggestion(String kind, String term, ContentItem item) {

    public static SearchSuggestion term(String term) {
        return new SearchSuggestion("term", term, null);
    }

    public static SearchSuggestion content(ContentItem item) {
        return new SearchSuggestion("content", null, item);
    }
}
