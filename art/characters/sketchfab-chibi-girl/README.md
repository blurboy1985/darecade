# Current avatar: built from "Chibi Girl Character"

The game's avatar is `public/models/neighbour-chibi2.glb`. It is made by
`scripts/build_sketchfab_chibi.py` from:

**Chibi Girl Character** by Syed's Creation (@Dawood3D), CC BY 4.0
https://sketchfab.com/3d-models/chibi-girl-character-3e795731d68d416eb0b8770a6b363e65

The licence allows commercial use and changes, and requires credit and a note
that the work was changed. The credit is shown in the game under Menu,
Settings, Preferences, is written into the GLB, and is in `../CREDITS.md`.

## What was changed

- Reduced from 77,778 triangles to about 13,500 for the heaviest look.
- Split by material into separately shown parts and bound to the game's
  41-bone skeleton (the source is not rigged). The body is about 29% taller
  and the arms about 60% longer than the source so that seats, karts and hand
  contacts in the game still line up. The head is unchanged.
- Added a boy: the same hair trimmed at ear level, blue eyes, shorts.
- Added shorts, trousers, shoes and a cape, made from the source legs or from
  scratch, and a blink for the eyes.
- Flat colours are set by the game, so one mesh serves every outfit colour,
  skin tone and hair colour. Only the face and eyes keep textures (512 px).
- The wizard hat, knight helmet and bear hat are carried over from the earlier
  Play Simi avatar (`../chibi/`), which is original work.

## Rebuild

Download the model from the page above (sign-in needed), put
`chibi-girl-character.zip` in this folder, then:

```sh
unzip chibi-girl-character.zip
7z x -osource source/Chibi_Female.rar
blender -b --python ../../../scripts/build_sketchfab_chibi.py
```

Blender 5.2. The download is not committed. `budgets.json` holds measured
sizes and the `proof-*.png` renders show the result in rest and test poses.
After a rebuild, raise the `?v=` number in `loadCharacter` in
`src/character.ts` and regenerate the wardrobe pictures (see WARDROBE.md).

## What the game expects

| Part | Material | Shown when |
| --- | --- | --- |
| `Skin_Top`, `Skin_Legs` | `skin` | always |
| `Head`, `Lashes` | `face` (textured) | always |
| `Eyes` / `EyesB` | `eyes` / `eyes_b` (textured) | girl / boy |
| `Hair`, `HairShort`, `Buns`, `Beads` | `hair`, `beads` | by hairstyle |
| `Shirt`, `Trim`, `Socks` | `shirt`, `trim`, `socks` | always |
| `Jacket` | `jacket` | cardigan, blazer and explorer tops |
| `Skirt`, `Shorts`, `Trousers` | `bottom` | one per outfit; the boy wears shorts for the skirt |
| `Shoes`, `Cape` | `shoes`, `cape` | by outfit |
| `Hat_Wizard`, `Hat_Knight`, `Hat_Bear` | `hat` (vertex colours) | by headwear |

`Eyes`, `EyesB` and `Lashes` have a `Blink` morph. There is no `Smile`.
The face texture is painted in skin tone `#ffc8b6`; the game multiplies it to
the chosen tone.

## Known limits

- Closed eyes show a pale patch where the source has no eyelid.
- The skirt can show through the jacket hem in a long stride.
- A girl's default look is barefoot, as in the source.
- The Hatsune Miku archive offered as a second reference was not used and
  should not be: its textures are named like files taken from a SEGA game, and
  the character belongs to Crypton Future Media.
