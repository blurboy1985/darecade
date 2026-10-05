# Rounded character profiles

This follow-up to PR27 repairs the narrow side silhouette while preserving the existing front face, cosmetic IDs, skeleton, ownership and economy. Original geometry was rebuilt in Blender 5.2.2 LTS; no purchased mesh or store preview pixels are included.

## Reference inspection

- [KayKit Adventurers, creator's itch.io listing](https://kaylousberg.itch.io/kaykit-adventurers): inspected the actual 3D cover render, including the archer at three-quarter view. Rounded rear hair masses, clear nose projection, a continuous jaw and headwear thickness remain readable off-axis. This is a modelling benchmark, rather than a return to its original character meshes.
- [Animal Crossing: New Horizons, Nintendo](https://www.nintendo.com/us/store/products/animal-crossing-new-horizons-switch/): inspected the official gameplay image with the winter-clothed human villager and wolf resident. Compact heads, a visible small nose and solid rear head volume support readable characters in a neighbourhood scene. This informs volume and readability, not character-specific features.
- [Mamehinata, creator's BOOTH listing](https://booth.pm/en/items/4340548): retained the user's existing face benchmark. The previews inspected in this pass are the creator's illustrated front/back and expression sheets; they are not measured 3D profile scans. The large simple eyes and compact mouth remain the front-face direction.
- [K Kameworks dancer pack, Unity Asset Store](https://assetstore.unity.com/packages/3d/characters/humanoids/humans/chibi-anime-female-dancer-pack-1-3-outfits-345488): the user's original chibi/anime reference remains the direction for broad hair and outfit silhouettes.

These are established game and model references, not a claimed global popularity ranking. Public preview images were inspected locally and are not included in the game or this repository.

## Root cause and correction

The original head's exported skin surface was 0.753 units wide and 0.489 deep: depth/width 0.649. Its wide frontal face, shallow eye overlays and lack of nose projection made the profile appear flattened. The previous front-biased proof cameras did not reveal this sufficiently.

The revised skin surface is 0.754 wide and 0.608 deep: ratio 0.807. The skull and hair gain rear volume; the cheeks use a rounder cross-section; the skin mesh includes a small integrated nose and muzzle. Ears move back with the skull. Open eye borders sit closer to the skin. The existing closed-eye geometry and readable lash are retained.

The bob tapers into a rounded crown. A continuous base fills gaps between cropped curls. The hood, helmet and bucket hat fit the deeper hair, including saved mixed hair index 9 (grey curls with helmet). Helmet guards clear both curls and twin tails.

## Reproduce

```sh
CHIBI_SKIP_PORTRAITS=1 /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 --python scripts/build_chibi_character.py
PROFILE_OUTPUT=.browser/profile-after PROFILE_PORTRAITS=1 /Applications/Blender.app/Contents/MacOS/Blender -b -t 2 --python scripts/render_chibi_profiles.py
ART_REVIEW_PORT=5177 npx vite --config scripts/art-review.config.mjs
```

The profile script reads the packed `.blend` without changing it. It renders all four heads at 0°, 45°, 90°, 135°, 180° and 270°, both side expressions and four headwear directions. `PROFILE_PORTRAITS=1` also refreshes the seven existing portrait/expression proofs. The local review server supports a separate port to avoid disturbing another task's preview. `assemble_profile_evidence.py` uses Pillow to compose unchanged frames into labelled sheets; pass the before directory, after directory and output directory.

Before images come from main commit `b01bf9fdc4bb8d353877d49beb6c5ca935639c47`, with identical Blender camera, lighting and pose. `before-after.png` compares front and side. `turntable.png` shows the final four heads at front, three-quarter, side and rear. `headwear.png` and `expressions.png` cover the side fits and animation poses. Game captures use the production renderer with synthetic local fixtures.

## Measured budgets and checks

The final GLB is 1,183,428 bytes. The worst mixed avatar is 11,946 triangles in eight primitives. See [validation](VALIDATION.md) for baseline comparison, test results, independent review and limits.

## Limits

Visual checks and browser tests use desktop Chrome. Physical Android/iOS, mobile Safari and a live multi-device multiplayer session were not tested. The inherited tiny eye-surface edge can still be seen at an exact side angle during a full blink; the closed-lid topology was preserved to avoid changing the existing expression. No production account data was accessed, and this PR was not merged or deployed.
