# Vybe design spec

Vybe follows the reference's layout and interaction patterns (Apple Music web, measured in Nov 2026). Everything else is our own: the brand, logo, icons, catalog, artwork, lyrics and audio. **Never copy Apple assets, logos, real artist, album or song names, real lyrics or real artwork.**

Reference screenshots were captured for layout study only and are not committed (they contain third-party artwork).
(`album-d`, `playlist-d`, `artist-d`, `new-desktop`, `search-d`, `radio-d`; `*-dk` = dark; `*-m` = 390px mobile)

## Tokens
All values are in `apps/web/src/styles/tokens.css`; always use the CSS variables, never hard-coded colours. Light and dark themes come for free.

## Layout (desktop 1440×900)
- Sidebar is 260px wide, with a translucent background and a right hairline border. Logo at (28, 30). The search field is 32px tall. Nav items are 34–36px tall with radius 8 and 14px text; the icons use `--key`, and the selected item gets `--bg-selected` and weight 600.
- Content gutter is `--content-pad` (40px). A page title is the large title (34/41, bold) with 34px top padding.
- Shelves: a 17px bold header with a chevron when it links to "See All", 5 lockups per row at 1440, and horizontal scroll-snap with hover arrows. Lockup artwork has radius 6 and a 1px inner border. The title and subtitle are 12/15; the subtitle uses `--text-2`.
- **Album and playlist header** (see album-d.png): the page background is tinted with the artwork's `bgColor`, via `.tinted` plus `tintVars(artwork)`. Artwork is 270px with `--shadow-hero-artwork`, starting 44px from the top. Text block on the right, top-aligned:
  - Title: 26/30, bold, with an explicit badge where relevant.
  - Artist: 26/30, regular, in `--page-accent` and linked.
  - Meta line: 12px, weight 600, uppercase-ish, e.g. "POP · 2026".
  - Editorial notes: 13/16, `--text-2`, max 440px wide, 3 lines with a "MORE" button.
  - Buttons: a **Play** pill and a **Shuffle** pill (36px tall, radius 24, 15/600).
  - A circular "···" button at the top right of the page.
  Below the header comes the track list, then the footer meta ("November 2, 2026 · 12 songs, 41 minutes", ℗ line, 12px `--text-2`), then the "More by …" and "You Might Also Like" shelves.
- **Artist** (artist-d.png): a full-bleed hero (artwork at the artist's image `bgColor`, about 60vh, gradient to the page background at the bottom). The artist name is 48px bold, centred low in the hero, with a large round play button. Then come "Latest Release" (left card) with "Top Songs" (a 3-row × 2-column grid of compact rows), then Albums, Singles & EPs, Appears On, Playlists, Similar Artists (circles), and About (bio card plus origin and formation year).
- **Player chrome (desktop)**: a floating pill 668×56 centred at the bottom of the content area, 18px from the bottom, radius 1000, `--bg-player` with backdrop blur, a 1px `--bg-player-border` and `--shadow-player`.
  - Left: shuffle, previous, play/pause, next, repeat.
  - Centre "LCD": a 40px artwork thumbnail, title and artist/album that marquee if long, and a thin progress bar under the LCD that scrubs on hover.
  - Right: lyrics, queue and volume (with a popover slider).
- **Mobile** (≤760px): no sidebar; instead a top header with a hamburger, a centred logo and a Sign In pill. The mini player is a 52px rounded bar 12px from the bottom (artwork, title, play/pause, next), and tapping it opens the full-screen Now Playing.
- **Now Playing (full screen)**: a background made from the artwork, heavily blurred and saturated with a slow animated drift. Large artwork that scales down slightly when paused. Title and artist, then the scrubber with elapsed and remaining time, transport controls, the volume slider and lyrics/queue toggles. On desktop the lyrics or queue occupy the right half.
- **Lyrics**: lines are 28–32px bold. The active line is fully opaque; others are at 35% opacity and blurred by distance; it auto-scrolls smoothly and clicking a line seeks to it. An instrumental gap shows animated "• • •". When the user scrolls manually, auto-scroll pauses for 3s.
- **Queue**: "Playing Next" (the user queue, then the context queue, then "Autoplay" with a toggle), a History section above, drag to reorder, swipe/remove buttons and "Clear".
- **Motion**: 0.2s `--ease` for hovers; spring (`--ease-spring`) for sheets and toasts; artwork fades in on load; honour `prefers-reduced-motion`.

## Architecture rules
- Shared types and the API contract live in `packages/shared/src/index.ts`. Do not change existing fields; adding optional fields is fine.
- The web app (`apps/web`) uses React 19, React Router 7 and Zustand, with CSS Modules per component (`X.module.css`).
  - Data fetching: `useAsync(key, fn)` from `src/lib/useAsync.ts`, with keys like `album:<id>` and `library:*`.
  - Use the shared components in `src/components` (Artwork, Lockup, Shelf, TrackList, Buttons, Icon) and the actions in `src/features/actions.ts`.
  - The player API is `usePlayer` in `src/stores/player.ts`.
- The API (`apps/api`) is Java 21 / Spring Boot 3.5 (Web MVC, JdbcTemplate, SQLite) and listens on port 4000; Vite proxies `/api` and `/media` to it. It implements exactly the HTTP contract documented in `packages/shared/src/index.ts`.
- Music: songs, albums, artists and charts come from the worldwide catalogue at runtime (no local catalogue).
