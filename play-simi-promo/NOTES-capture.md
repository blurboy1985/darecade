## Capture notes

- **The game changed several times during capture.** The live site was redeployed repeatedly mid-session (new My look layout, a new avatar model, five **free starter class sets**, a new first-visit screen, and other players hidden from strangers). All avatar footage was reshot on the newest build. Each class look is its free set plus its matching free hairstyle, which is what brings the class hat. Clips without the avatar (Noodle Run, Brick Bash, Hop Hop, Fishing, level-up) are from an earlier build of the same day.
- **Premium sets are previews only.** `wardrobe-sets.*` shows the game's own try-on preview of premium sets. Nothing was bought.
- **No chat exists** in the game, so there was nothing to avoid there. Nobody was reported or challenged.
- **Name tags.** No other player's nickname is in any file. Nicknames are swapped for made-up ones (Luna, Kiko, Bao, Miso …) twice: in the data the page receives, and again where the page draws name tags, which also catches generated guest names such as "Mint Gecko 42". The guest's own nickname is the made-up "MochiStar".
- **Helper avatars.** The newest build hides other players' avatars from strangers, so the plaza is empty for a lone guest. The plaza shots therefore use three extra guest sessions run by `capture.mjs` itself (Mage, Archer and Warrior looks). They are the script's own guests; no real player appears.
- **HUD hidden** in the `look-*`, `emote*`, `plaza*` shots (CSS only; the 3D render is untouched). The player's own "YOU · MochiStar" tag is part of the 3D scene and cannot be hidden; the promo frames close-ups below it. Game clips keep their real HUD.
- **Open Stage** is the full show (score and combo running), not the warm-up.
- **Rankings** is the guest view: guests are not on the ranked board, so it has no rows.
- **Neighbourhood Relay** was not filmed: it is a team game with a join code, and playing it would mean joining real players.
- **Coast Rush, Noodle Run, Brick Bash, Star Swarm, Hop Hop, Hoops, Fishing** are played by small input bots in `capture.mjs` (keyboard and pointer input, reading the game's own canvas), so every clip is a real round with the score moving.
- **Recording.** Playwright's `recordVideo` only records 1× pixels at a fixed low bitrate, so clips are recorded through Playwright's CDP screencast piped into ffmpeg instead (780×1688, about 50 frames a second in, 30 fps out).
- **Not possible as a guest:** a populated rankings board (guests are not ranked, and signing in needs an email), and a vector logo (the game ships the wordmark as styled HTML; `logo.png` is that element photographed at 2×, 1122 px wide, and `logo-mark.svg` is the site's own icon).
- **`wardrobe-classes.mp4` is incomplete.** It shows Mage, Pirate, Thief and Warrior being put on in My look, but the cut ends before Archer. The promo does not use this clip (its outfit-swap beat uses the five `look-*-pose` stills), so it was left as is.
- **Other avatars in the wide plaza shots.** Besides the three helper guests, a few other avatars can be in frame in the desktop takes. Their tags show made-up names like every other tag.
