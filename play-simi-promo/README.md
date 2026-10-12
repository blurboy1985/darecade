# Play Simi promo

A 30-second vertical promo for https://playsimi.danielquek.com, built from footage of the live game.

| File | What it is |
|---|---|
| `promo.html` | The promo. One file, hand-written timeline, loads media from `./assets`. |
| `capture.mjs` | Films the live game as a guest (stills and clips into `assets/`). |
| `story.html` | The 60-second animated story: "meet you downstairs", how it went quiet, and why the game was built. Drawn and scored in code, no footage; narrated in Singapore English. |
| `story-60s-landscape.mp4`, `story-60s-vertical.mp4` | The rendered story, 1920×1080 and 1080×1920 (H.264 + AAC, 30 fps). |
| `render.mjs` | Renders `promo.html` or `story.html` to MP4, frame by frame. |
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

## Edit the story

Serve this folder and open `story.html`, then press **Play with sound**; the bar scrubs. Every caption is in `CONFIG.text`, the scene start times in `CONFIG.scenes` (keep them on even seconds: the music's bars are two seconds long), and the commit figures in `CONFIG.days` and `CONFIG.commits`. `story.html?portrait=1` is the 1080×1920 layout: the same scenes, framed lower in the tall canvas with the captions above. Re-render with `node render.mjs story story-vertical`.

The narrator and the kids are spoken clips in `assets/voice/`, made with ElevenLabs (model `eleven_v3`). Their words are in `story-voice.json` (`say` is the ElevenLabs wording, which can carry v3 tags such as `[shouting]`). `story-voice.py` speaks them again: put an API key in `.elevenlabs-key` (git-ignored), run `python3 story-voice.py --find` to list Singaporean voices, then `python3 story-voice.py --narrator <id> --kid <id>`. Library voices need a paid ElevenLabs plan through the API; on the free plan use the account's premade voices with `--accent "[strong Singaporean accent]"`. Without a key the script falls back to Microsoft's Singapore English voices (`pip install edge-tts`). Either way the text is sent to that service. `CONFIG.voice` in `story.html` sets when each clip starts and how loud it is, and the music dips under each one; new clips have new lengths, so check those start times after re-speaking. A clip that is missing is skipped. Because the page fetches the clips, preview it through a local server (`npx serve .`) rather than by opening the file.

## Re-render

```
node render.mjs                    # all five MP4s (about three minutes)
node render.mjs vertical           # just one: vertical | landscape | short | story | story-vertical
node render.mjs --stills           # frames every 2.5 s into review/<name>/ instead
node render.mjs vertical --stills --at=0.4,13.2
```

`PW_CHANNEL=chrome node render.mjs story` uses the installed Google Chrome instead of Playwright's Chromium.
