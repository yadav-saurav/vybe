# Vybe UX blueprint

## Principles
1. **One home per feature.** Every feature lives in exactly one place. Other places link to it rather than duplicating it.
2. **Three levels of depth.** Browse (Home, New, Radio) → Detail (Album, Playlist, Artist) → Act (play, queue, share). Nothing important is more than two taps away.
3. **Progressive disclosure.** Primary actions are visible. Secondary actions live in the ··· menu, always in the same order.
4. **The player is always present and never blocks content.** A bar on desktop, a mini player on phones, full screen when expanded.
5. **Same layout pattern for every content type:** header → main list → related shelves → footer.

## Site map and navigation
| Desktop sidebar | Phone bottom tab bar |
|---|---|
| Search field | Home |
| Home · New · Radio | New |
| Library: Recently Added · Artists · Albums · Songs · Imported | Radio |
| Playlists: + New Playlist · your playlists | Search |
| Account menu: Profile · Replay · Settings · Sign Out | Library |

## Home rows (top to bottom; each row has one job)
1. Top Picks for You (recommendations)
2. Recently Played (resume what you played in recent days)
3. Made For You (Discover Weekly, Favorites Mix, Daily Mix 1–6; the only place mixes appear)
4. Friends Are Listening (social; shown only if you follow someone)
5. New from Artists You Follow (replaces a separate notifications screen)
6. Jump Back In (older favourites, last played more than 3 days ago)
7. Because You Listened to [artist] (discovery)
8. Your Replay (summary card linking to the full stats)

## Where each feature lives
| Feature | Its one place | How you reach it |
|---|---|---|
| Lyrics, queue | Now Playing side panel | Player bar buttons |
| Sleep timer | Now Playing ··· menu | Countdown chip on the player while active |
| Song credits | Song ··· menu → Credits sheet | |
| Share | ··· menu → Share sheet | |
| Jam (listen together) | Now Playing → Start a Jam | Guests join by link; Jam chip on the player |
| Collaborative playlist | Playlist editor → Let others add songs | Collaborative badge in the playlist header |
| Equalizer, crossfade, Sound Check | Settings → Playback | |
| Change password, delete account | Settings → Account | |
| Follow listeners | Profile page | |
| Install app | Browser prompt; one line in Settings | |

## Consistent ··· menu (same order everywhere)
Play Next · Play Last → Add to Library · Favorite · Add to Playlist → Go to Album · Go to Artist · Credits → Share.
Destructive actions (Remove, Delete) always come last, in red, behind a confirmation.

## Design system rules
- Colour, type, spacing, radius and motion come only from tokens. Light, dark and tinted pages adapt automatically.
- Every screen has four states: loading skeleton, empty (with one clear next step), error (with Try Again) and content.
- One layout grid, with breakpoints at 1440, 1000, 760 and 390 px.
- 44 px touch targets on phones; WCAG AA contrast; keyboard paths for everything; respect reduced motion.
- Motion: fades for content; springs only for sheets and the player.

## Build order
1. Cleanup: Replay card on Home, phone tab bar
2. Consistent ··· menu, plus Credits
3. Sleep timer
4. Collaborative playlists
5. Installable app (PWA)
6. Settings: equalizer, change password, delete account
7. Friend activity, and New from Artists You Follow
8. Jam (listen together)
9. Full design QA pass at every width in light and dark, then deploy
