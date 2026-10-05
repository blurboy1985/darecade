# Original chibi art verification — 5 October 2026

This isolated art branch starts from main `665603f840c37aa86ceefea21da0dafc1a23774c`, which includes PR26. It changes original character art, selected pet/magic recipes, rendering and avatar resource ownership. Cosmetic indices, ownership arrays, equipped-look shape, save version and PR26 token prices/eligibility remain compatible. Five hairstyle display labels now describe the revised meshes. No purchase, production write, merge or deployment was performed.

## Review evidence

The face direction follows Daniel's selected Mamehinata quality benchmark; all visible meshes and texture pixels are original. The continuation was authorized before the remaining outfit pass. Genuine Blender 5.2.2 generated the packed editable source and final export; no AI raster mockup substitutes for a rendered model.

- [Before](review/before-ranger.jpg) / [after](review/after-ranger.jpg): the same production LobbyWorld and fitting-room renderer with a synthetic ranger look.
- [Actual wardrobe, dark skin and mixed outfit](review/game-wardrobe-desktop.png).
- [Actual third-person mobile view with synthetic remote peers](review/game-third-mobile.jpg).
- [Actual bird's-eye view](review/game-birds-eye-desktop.png).
- [WebGL-unavailable wardrobe](review/game-fallback-wardrobe.jpg): revised static images keep customization usable.
- [Selected familiar and magic proof](review/familiars-three-quarter-day.png) and [budgets](review/familiar-qa.md).
- [Blender outfit and face renders](chibi/README.md) and [machine-readable GLB measurements](chibi/budgets.json).

## Measured budgets

| Metric | Previous KayKit | Original chibi |
| --- | ---: | ---: |
| GLB bytes | 714,452 | 1,129,444 |
| Entire loaded wardrobe triangles | 19,118 | 46,045 |
| Visible ranger including cape | 4,347 | 9,168 |
| Visible four-family range including cape | 4,113–4,347 | 9,168–10,477 |
| Outfit + cape draws | 7 | 7 |
| Worst mixed outfit + cape + model hat | — | 11,514 triangles / 8 draws |
| Unique embedded images | 4 | 1 original 512px atlas |

Targets are below 1.5 MB for the GLB, 12,000 triangles and 8 draws for a selected model outfit including cape/model hat. Pets, procedural gear and magic add their own costs; the model budget does not include them. Four materials and 32 named modular meshes retain the existing mix-and-match contract. Lossless repeated-buffer sharing and sparse morphs require no additional decoder. The new download adds 414,992 bytes and uses more geometry for the rounded face and hair. A 512px RGBA tint atlas consumes about 1 MiB before mipmaps versus the former 256px tint's 0.25 MiB; equal skin/outfit choices share cached textures and references are released when the final avatar is disposed.

## Validation

- `npm test`: 272 tests, 266 passed, six browser checks initially skipped; no failures.
- The four browser test files then ran with installed Chrome: all 15 tests passed, including all six previously skipped browser checks. Saved 2D mode and WebGL-unavailable startup each kept the lobby/reward/wardrobe working at 390 × 844.
- `npm run build`: TypeScript and production Vite build passed. The existing Three.js chunk-size warning remains.
- Final focused character/lifecycle/pet/magic/wardrobe tests passed after hairstyle-label updates. `git diff --check` passed.
- Browser production renderer: all 145 cosmetic indices in nine pose modes had finite skinned vertices; independent skeletons and shared tint survival passed. Twenty-four remote avatars created, changed looks, and disappeared correctly; ten fitting-room mount/swap/dispose cycles removed canvases. Reduced effects stayed fixed with the clock. [Recorded results](review/browser-verification.json).
- Actual game UI: preview/equip outfit, beard and pet swaps; cameras; dark skin tones; remote peers; mobile and desktop layouts; revised thumbnails; and graphics fallback were inspected. Normal rendering produced no browser warnings/errors. Forced WebGL failure emitted the expected context-error/fallback warning.
- Independent GPT-6.1 Sol review found and verified the fix for missing cloth tint UVs in three families. No remaining material runtime findings. Actual exported UVs now verify tint cells 8/9 for every family.

To run the browser fixtures on this Mac after building:

```sh
DARECADE_TEST_CHROMIUM="$PWD/scripts/chromium-test-macos.mjs" node --experimental-strip-types --test --test-concurrency=1 tests/fallback-browser.test.ts tests/arcade-motion.test.ts tests/onboarding-account.test.ts tests/world-picker-menu.test.ts
```

The first headless Chrome invocation stalled at process shutdown on macOS. A local test wrapper added mock-keychain/basic-password-store flags and killed only its own process group after complete `--dump-dom` HTML. The fixture assertions then passed; the reproducible adapter is `scripts/chromium-test-macos.mjs` and is not used in the application.

## Reproduce locally

```sh
node scripts/prepare-art-baseline.mjs
npm run dev -- --config scripts/art-review.config.mjs
```

Open `http://127.0.0.1:5176/scripts/art-review.html` for the production renderer, or append `?before=1` for the exact prior main renderer. Its buttons exercise all indices, remote replacements, preview disposal and thumbnail generation. In the local browser console, `await window.artReview.saveThumbnails()` regenerates all 155 original PNGs in `public/wardrobe` through a localhost-only development endpoint. This config is not used by production builds.

`scripts/game-art-review.html` boots the actual game with entirely synthetic accounts and API/WebSocket responses. Optional query flags: `third`, `remotes`, `reduced`, `2d`, `no-webgl`, and `look=0` through `look=3`. It seeds only local QA storage and never sends a real email, submits consent, or calls production APIs. Use a separate localhost browser profile for QA. The default production `index.html` still boots the ordinary application.

## Remaining limits

Physical Android/iOS devices, mobile Safari, thermal behaviour, sustained multiplayer frame times and network throughput have not been measured. The browser crowd is synthetic and verifies rendering/lifecycle, rather than real multi-device networking. Gaze is fixed; blinking and smiling are the supported face morphs. Full eyelids show a slight shallow-surface shading seam at close range. Existing procedural legendary assets and the SG neighbourhood are retained. This is a draft for visual review, with no merge or deployment.
