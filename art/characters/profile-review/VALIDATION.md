# Profile correction validation

Final model SHA-256: `40e4474a24d3db11765cb82ff51285f8e3252cf5f1faf19085166e7126da0b0a`.

| Measurement | PR27 main | Profile correction |
| --- | ---: | ---: |
| GLB bytes | 1,129,444 | 1,183,428 |
| Entire modular wardrobe triangles | 46,045 | 48,773 |
| Worst mixed avatar triangles | 11,514 | 11,946 |
| Worst mixed avatar primitives | 8 | 8 |
| Materials / packed images / bones | 4 / 1 / 41 | 4 / 1 / 41 |
| Skin depth / width | 0.649 | 0.807 |

The model remains below 1.5 MB, 12,000 selected avatar triangles and eight selected avatar primitives, including cape and optional GLB headwear. These counts exclude independent pets, magic and neighbourhood geometry. No new draw call or texture is added by the profile correction. All five heads retain neutral Blink/Smile values of zero.

- `npm test`: 273 tests, 267 passed, six browser cases skipped in the ordinary Node run.
- Actual Chrome run of `world-picker-menu`, `onboarding-account`, `fallback-browser` and `arcade-motion`: 15 passed, none skipped.
- Focused final GLB, avatar lifecycle, pets/magic and wardrobe suite: 20 passed.
- `npm run build`: TypeScript and production Vite build passed. Existing large-chunk advisory remains.
- Blender 5.2.2 LTS: genuine rebuild/export, packed editable neutral `.blend`, 56 profile/headwear/expression frames plus seven refreshed portraits rendered successfully.
- Production Three.js review fixture: all 145 cosmetic indices and nine pose modes passed, independent rigs/tints passed, 24 remote avatars create/swap/remove passed, ten fitting-room create/swap/dispose cycles passed, reduced-motion freeze passed. Machine-readable results are in `runtime-verification.json`.
- All 155 wardrobe thumbnails were regenerated from the final real renderer; 119 containing avatars changed. Pet-only thumbnails remained byte-identical.
- Actual local game UI: third-person world with synthetic peers, wardrobe selection and pointer drag to the profile checked; browser graphics fallback is covered above. No player account or production API was used.
- GPT-6.1 Sol independent review: checked front, quarter, both profiles, back, expressions, headwear and mixed curly/helmet and twin-tail/helmet looks. Detected bob and headwear intersections were corrected and re-rendered; no new blocking findings remained.
- Independent binary audit: joint names/order, inverse-bind buffers and original atlas pixels match PR27 main exactly. Cosmetic mappings and economy files are unchanged.
- `git diff --check` passed.

A saved-2D Chrome smoke attempt timed out while Blender was rendering. The final isolated fallback rerun and the complete 15-case Chrome run both passed. Physical mobile devices, mobile Safari and live multi-device multiplayer remain unverified. The inherited tiny closed-eye profile edge remains documented in README.
