# Face reference research — 5 October 2026

Status: Daniel selected **Mamehinata as the face-quality benchmark**, then authorized the remaining art with GPT-6.1 Sol after the revised face study. The original production wardrobe is now complete; see [chibi/README.md](chibi/README.md) and [ART-QA.md](ART-QA.md). Earlier samples were rejected and are not shipped.

## Evidence and scope

The [VRC Style ranking](https://www.vrc-style.com/avatars/osusume) currently lists Kipfel first, Shinano second, Manuka third and Mamehinata sixth. It describes its method as BOOTH wishlist counts with editorial consideration for a balance of styles. This is a third-party marketplace-interest signal, not global sales, active users, or an objective ranking of face quality.

Creator product pages and actual preview pixels were inspected for each reference below. No purchased model files or textures were downloaded. Public previews were cached under /tmp for research only and must never become shipped textures.

| Reference | Creator source | Visual observations from inspected previews |
| --- | --- | --- |
| Manuka | [STUDIO JINGO](https://jingo1016.booth.pm/items/5058077) | Short lower face, tapered chin, upper lids overlapping the irises, layered lash shapes, warm cheek color. Expression sheet preserves appeal across smile, blink and surprise. Closest detailed anime face study for the requested direction. |
| Shinano | [Ponderonium Laboratory](https://ponderogen.booth.pm/items/6106863) | Flatter, relaxed upper lids, restrained nose, small expressive mouth, soft cheek shading. More mature and less chibi; useful for eyelid shape rather than body proportions. |
| Kipfel | [Mochiyama Kingyo](https://booth.pm/ja/items/5813187) | Compact rounded lower face, low-detail eyes, strong upper lid and graphic expression changes. Sleepy personality is intentional. Useful small-screen chibi clarity benchmark. |
| Mamehinata | [Mochiyama Kingyo](https://booth.pm/ja/items/4340548) | Short eye-to-mouth distance, simple dark irises with clear highlights, strong mouth expressions, minimal nose. More mascot-like than the requested Unity reference. |
| Nendoroid Miku 2.0 | [Good Smile Company](https://www.goodsmile.com/en/product/1616/Nendoroid%2BHatsune%2BMiku%2B2.0) | Physical 3D figure, not a runtime mesh. Rounded cheeks, compact face, deliberate eye outlines and highlights. Useful for translating anime into appealing 3D volumes. |
| Requested Unity dancer pack | [K Kameworks listing](https://assetstore.unity.com/packages/3d/characters/humanoids/humans/chibi-anime-female-dancer-pack-1-3-outfits-345488) | Remains the target for chibi proportions and overall polish. Inspected centre brown-haired figure: substantial irises, controlled sclera, a small mouth close beneath the eyes, shaped cheeks and coherent bangs. |

## Diagnosis of rejected approval-v2

These are art-direction judgments from comparing the images, not universal anatomical rules.

- The lower face is too long and broad: the eyes sit over a large empty cheek/mouth area.
- The white eye apertures dominate the irises, and the repeated geometric curves look generic. Reducing height alone did not repair the relationship between lids, irises and cheek shape.
- Eyes are projected onto a nearly flat surface. This approval model has no shaped eye openings or separate adjustable eye surfaces, limiting convincing side views, gaze and blinking.
- The tiny fixed smile contributes little expression. Neutral, smile and blink need to be judged together.
- Broad physically shaded surfaces and muted lighting read as a doll. The reference relies on carefully controlled anime shading, strong lid design and intentional facial color.

## Face direction used for the production model

The head-and-shoulders study preceded the full wardrobe. Following Daniel's explicit selection, use **Mamehinata for face quality and expression design**: compact cheeks and lower face, a very short eye-to-mouth distance, simple dark irises with clear highlights, minimal nose, and lively mouths. The earlier Manuka recommendation is superseded. Keep MapleStory as the outfit/world mood reference and retain the Unity pack as overall chibi context. Do not average five incompatible face styles together.

Start with a much shorter rounded lower face; model shallow eye openings, curved eye surfaces and distinct upper lashes; let lids overlap the irises; paint original iris and cheek detail. Use controlled toon-like facial shading. Test front, three-quarter and profile under neutral and in-game-style lighting. Show neutral, smile and blink on the same head. Use an original human design without copying Mamehinata's dog ears, visor, collar or textures. That face direction was used for the original rigged wardrobe after authorization to proceed.

The exact proportions are design hypotheses to test visually, not fixed measurements taken from these commercial models. All final assets must remain original, inclusive and compatible with the existing saved appearance IDs.

## Inspected reference images

- [Manuka expression sheet](https://booth.pximg.net/8a7426aa-ba62-4ef0-9e7d-2c8ea96e7c9b/i/5058077/3175a3c4-b653-43c5-9ce4-dc483e39b6a8_base_resized.jpg)
- [Shinano portrait](https://booth.pximg.net/ed52788c-0b3b-4e38-9ded-1e5797daf0ef/i/6106863/07bd77df-a8ee-4244-8c4e-16cf7cb584bb_base_resized.jpg)
- [Kipfel expression sheet](https://booth.pximg.net/c80ffe79-d9d7-4481-bc64-40d80bcd71e6/i/5813187/de2d8105-27e5-43d3-a396-0007e22af9e1_base_resized.jpg)
- [Mamehinata expression sheet](https://booth.pximg.net/c80ffe79-d9d7-4481-bc64-40d80bcd71e6/i/4340548/e0c3228c-24e4-4cf5-81dd-8107b201e863_base_resized.jpg)
- [Nendoroid Miku figure](https://www.goodsmile.com/gsc-webrevo-sdk-storage-prd/product/image/product/20121213/3787/21955/large/d114faa3771efe0eb01e9f57b4ea4688.jpg)
