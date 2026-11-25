package app.vybe.api.model;

import java.util.List;

/** Mirrors {@code Shelf}. {@code layout} is one of the {@code ShelfLayout} strings. */
public record Shelf(
        String id,
        String title,
        String subtitle,
        String layout,
        String seeAllHref,
        List<ContentItem> items,
        List<HeroCard> heroCards,
        List<FriendCard> friendCards) {

    public Shelf {
        items = items == null ? List.of() : List.copyOf(items);
        heroCards = heroCards == null ? null : List.copyOf(heroCards);
        friendCards = friendCards == null ? null : List.copyOf(friendCards);
    }

    public Shelf(String id, String title, String subtitle, String layout, String seeAllHref,
                 List<ContentItem> items, List<HeroCard> heroCards) {
        this(id, title, subtitle, layout, seeAllHref, items, heroCards, null);
    }

    public static Shelf of(String id, String title, String layout, List<ContentItem> items) {
        return new Shelf(id, title, null, layout, null, items, null);
    }

    public static Shelf withSubtitle(String id, String title, String subtitle, String layout, List<ContentItem> items) {
        return new Shelf(id, title, subtitle, layout, null, items, null);
    }

    public Shelf withSeeAll(String href) {
        return new Shelf(id, title, subtitle, layout, href, items, heroCards, friendCards);
    }
}
