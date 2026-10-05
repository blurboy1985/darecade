# Character asset credits

## Current avatars: original Play Simi chibi art

Every visible mesh and atlas pixel in `public/models/neighbour-chibi.glb` was authored for Play Simi using Blender. The editable source, builders, and measured budgets are documented in [chibi/README.md](chibi/README.md). Public Unity dancer, Mamehinata, and MapleStory previews informed proportions, face quality and outfit readability; no preview pixels or purchased meshes are included. Reference links are recorded in [face-research.md](face-research.md).

Only the compatible rest skeleton from the following CC0 source is reused.

## Retained skeleton source: KayKit Adventurers

The retained skeleton input comes from the **KayKit Character Pack: Adventurers 1.0** by Kay Lousberg (www.kaylousberg.com), released under CC0 1.0 Universal:
https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0 (commit 672074b)
https://creativecommons.org/publicdomain/zero/1.0/

Credit is not required by CC0; it is given here as thanks. The licence text is kept at `art/characters/kaykit/LICENSE.txt`.

The free pack's Knight, Barbarian, Mage, Rogue and hooded Rogue share one rig. `scripts/build_kaykit_character.mjs` merges their body, head, headwear and cape parts onto one skeleton, removes all weapons, props and the 76 baked clips, and quantizes the result.

Builder input: `public/models/neighbour-kaykit.glb` (714,452 bytes). The game loads the new original chibi GLB instead.
Sources (not committed): place the five Character GLBs in `art/characters/kaykit/`, then run `node scripts/build_kaykit_character.mjs`.

At runtime Play Simi tints the skin swatch and the main outfit swatches of each texture, maps its own arm/leg/head controls onto the KayKit bones, and lifts the hips while seated so the existing Blender bench, swing and slide scenes still line up.

## Earlier character (retired)

The previous rounded character was adapted from **Universal Base Characters — Standard** by Quaternius (CC0 1.0), with a face, clothing and hairstyles authored for this project. Its editable master `art/characters/neighbour-cute.blend` and builder `scripts/build_cute_character.py` are kept for reference; its runtime GLB is no longer shipped.
