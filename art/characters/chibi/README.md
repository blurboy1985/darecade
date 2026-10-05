# Play Simi original avatar wardrobe (retired)

The game now uses the avatar described in [../sketchfab-chibi-girl/README.md](../sketchfab-chibi-girl/README.md). This model is kept because that builder takes its skeleton and three hats from `neighbour-chibi.glb` in this folder.

This production model follows the approved compact human face study. The rounded lower face, short eye-to-mouth spacing, dark blue irises and broad highlights are preserved. The skin and hair have rounded profile volume and a small integrated nose. Game eyes conform to a continuous head with tighter open borders. The game mesh avoids the study's dense boolean socket topology.

## Deliverables

- `neighbour-chibi.glb`: modular rigged game model.
- `simi-chibi.blend`: editable meshes, original packed atlas, expression keys, shared skeleton and studio setup. It opens with the ranger visible in neutral T pose.
- `palette.png`: original 512 x 512 packed colour and face atlas.
- `rogue-portrait.png`, `mage-portrait.png`, `knight-portrait.png`, `barbarian-portrait.png`: full body outfit and hair proofs.
- `face-detail.png`, `blink-face.png`, `smile-face.png`: close facial inspection and expression proofs.
- `budgets.json`: measurements from actual GLB accessors, including the original KayKit model for comparison.

The four families are a ranger tunic with field pouch and short slate hair; an academy coat, ribbon and rounded brown bob; open armor with a small shield crest and dark flowing twin tails; and a sporting overshirt with joggers and cropped grey curls and a restrained beard. Their names retain saved wardrobe IDs, including the older beard option. The alternate hood and three headwear IDs remain available. There are no weapons.

## Rebuild

Run from the repository root with Blender 5.2.2:

```sh
CHIBI_RENDER_ALL=1 /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 --python scripts/build_chibi_character.py
```

Without `CHIBI_RENDER_ALL`, export the complete wardrobe and render only the ranger full body and face detail. Blender uses two CPU threads, Cycles, 32 samples and denoising. The generated GLB uses ordinary glTF 2.0 skinning and sparse morph targets. It does not require Draco or meshopt decoders. Repeated binary buffers, including identical prefixes of joint and weight arrays, are shared losslessly after export.

The focused original face builder is `scripts/build_chibi_face.py`; geometric assembly and weight helpers are in `scripts/chibi_mesh_helpers.py`. `scripts/build_chibi_character.py` owns the atlas, outfits, hairstyle variants, exported contract and proof rendering.

## Runtime contract

Each outfit retains `Body`, `ArmLeft`, `ArmRight`, `LegLeft`, `LegRight`, `Head` and `Cape` under its original `Rogue_`, `Mage_`, `Knight_` or `Barbarian_` prefix. `Rogue_Head_Hooded`, `Mage_Hat`, `Knight_Helmet` and `Barbarian_Hat` also remain. All mesh vertex groups use the unmodified 41-bone KayKit rest hierarchy. The four materials are named `rogue`, `mage`, `knight`, and `barbarian`.

Primary cloth in every family uses palette cell 8; secondary trousers and capes use cell 9. Fixed trim, eye detail, steel and leather use separate palette cells. The same original atlas is the base colour and emissive texture. Runtime tinting must assign the same recoloured texture to both `map` and `emissiveMap`. Emissive strength is 0.38. Roughness is 1.0; matte shading and small painted gradients keep details readable under game lighting.

Canvas coordinates count downward from the exported PNG's top left:

| Region | Rectangle x, y, width, height | Treatment |
| --- | --- | --- |
| Palette | 0, 0, 512, 256 | Original 8 columns x 4 rows; each cell 64 x 64; existing cell IDs retained |
| Face skin paint | 0, 256, 256, 256 | Recolour together with skin cell 0 |
| Iris detail | 256, 256, 256, 256 | Preserve every pixel |

The neutral skin colour for both cell 0 and the skin paint is `#f7d9c6`, sRGB `[247, 217, 198]`. Multiply source skin pixels by target/base per channel so diffuse cheeks remain in the selected skin family. Preserve the iris rectangle, eye white cell 1, lash cell 2, mouth cell 15 and tongue cell 31. Palette colours for clothes and hair can use the existing swatch tint rules in the bounded top-half region.

All five heads expose `Blink` and `Smile` morph targets. Exported neutral values are explicitly zero. The two expressions use the same facial vertices. `Blink` closes shallow upper and lower skin lids while lowering the upper lash; `Smile` opens the mouth and reveals the tongue. No separate facial mesh or expression texture adds a draw call. Gaze remains fixed in the game asset.

## Provenance

Every visible mesh, palette pixel, cheek mark and iris pixel was authored for Play Simi. The approved v3 face study and its equations are original task work. Public Mamehinata creator previews were used only as a proportion and expression benchmark. No paid model, source preview pixel, costume identifier, or animal face part is included.

Only the rest skeleton of the existing KayKit Adventurers model by Kay Lousberg is reused under CC0. All imported meshes, textures and animation actions are removed before export. The game continues to pose this compatible skeleton procedurally.

## Actual budgets

| Measurement | Existing KayKit model | Original Simi model |
| --- | ---: | ---: |
| GLB bytes | 714,452 | 1,183,428 |
| Whole wardrobe triangles | 19,118 | 48,773 |
| Packed source images | 1 | 1 at 512 x 512 |
| Shared rest bones | 41 | 41 |

The entire wardrobe is loaded once. Only the selected parts are rendered. Including a cape, ranger is 9,552 triangles, academy is 10,882, knight is 10,861, and sporting adventurer is 10,180. Each uses seven mesh primitives. Without a cape each uses six. The most expensive mixed selection, including the largest optional model hat and a cape, is 11,946 triangles in eight primitives. The five exported heads have neutral `Blink = 0` and `Smile = 0` values.

The file reduction comes from sparse facial position deltas and exact binary buffer reuse, including shared all-head skinning data. Vertices, weights, colours and morph values remain unchanged by the repacker.

The follow-up profile correction, public references, comparison cameras and verification evidence are documented in [profile review](../profile-review/README.md). Use `CHIBI_SKIP_PORTRAITS=1` for a fast export and `scripts/render_chibi_profiles.py` for a separate angle matrix.
