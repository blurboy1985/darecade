# Play Simi promo

A 30-second vertical promo for https://playsimi.danielquek.com, built from footage of the live game.

| File | What it is |
|---|---|
| `promo.html` | The promo. One file, hand-written timeline, loads media from `./assets`. |
| `capture.mjs` | Films the live game as a guest (stills and clips into `assets/`). |
| `render.mjs` | Renders `promo.html` to MP4, frame by frame. |
| `shotlist.mjs` | Rebuilds `assets/SHOTLIST.md` and `assets/contact-sheet.png`. |
| `promo-30s-vertical.mp4`, `promo-30s-landscape.mp4`, `promo-15s-vertical.mp4` | The rendered videos (H.264 + AAC, 30 fps). |
| `review/` | Reviewer rounds: frames, renders and footage scores. |
| `raw/` | Full-length takes and `clips.json` (where each clip was cut). Safe to delete. |
| `explore/`, `repl.mjs`, `explore.mjs`, `run.sh`, `tile.sh`, `sheet.sh` | Scratch tools used while exploring the game. Safe to delete. |

Needs Node 20+, `ffmpeg` on PATH, and `npm install` (Playwright; then `npx playwright install chromium`).

## Watch it

Open `promo.html` in a browser. It plays on its own; click once for sound.

- `promo.html?landscape=1` — 1920×1080.
- `promo.html?cut=15` — the 15-second cut.
- Controls: Restart, scrub bar, 9:16 / 16:9, Mute. Keys: `Space` restart, `M` mute.
- `R` — clean recording mode: no controls, a 3-second countdown, then from the start. `Esc` brings the controls back.

## Re-capture footage

```
node capture.mjs --list            # shot names
node capture.mjs                   # everything (about 15 minutes)
node capture.mjs emote plaza       # only these shots
node capture.mjs --retrim          # re-cut clips after editing start/dur in raw/clips.json
node shotlist.mjs                  # refresh SHOTLIST.md and the contact sheet
```

The script plays as a guest. It never types an email, never buys or redeems anything (premium looks are only previewed), and swaps other players' nicknames for made-up ones before the page shows them.

The plaza shots open three extra guest sessions ("helpers") so the main avatar has company; the game hides other players' avatars from strangers. Guest sessions are kept in `guest-state.json` and `guest-friend-1..3.json`. These hold session cookies, so they are git-ignored; delete them to start as new guests (the script then accepts the 13+ and privacy switches on the welcome screen).

The game's markup changes between releases. If a shot fails, `raw/failed-<shot>.png` shows what the page looked like; the selectors live near the top of each shot in `capture.mjs`.

## Edit the promo

Everything is in the `CONFIG` object at the top of `promo.html`:

- `text` — every caption, the button label and small print. `hookAlternates` and `ctaAlternates` hold three spare lines each; copy one over `text.hook` or `text.cta`.
- `colours`, `url`, `bpm`, `fps`, `safe`.
- `looks`, `stickers`, `games` — which file each beat uses, its crop (`[x, y, w, h]` as fractions of the frame) and where in the clip to start (`from`, seconds).
- `cuts` — scene order and length in beats for the 30 s and 15 s versions (one beat is 0.5 s at 120 BPM).
- `assets` — the file list. A missing file is replaced by a drawn placeholder.

Drop a track at `assets/music.mp3` to use it instead of the built-in tune (sound effects stay).

## Re-render

```
node render.mjs                    # all three MP4s (about a minute)
node render.mjs vertical           # just one: vertical | landscape | short
node render.mjs --stills           # frames every 2.5 s into review/<name>/ instead
node render.mjs vertical --stills --at=0.4,13.2
```
