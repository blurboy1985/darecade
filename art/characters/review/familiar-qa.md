# Familiar and magic review, 2026-10-05

Scoped to src/pets.ts, src/magic.ts, and tests/pet-magic.test.ts. Standalone browser harness and evidence are ignored QA files.

The inherited original recipes remain for Mochi 1, Peaches 4, Mer 24, Orbiting stars 1, Rune circle 17, and Forest spirits 26. Other cosmetic recipes and saved IDs were preserved. No reference image pixels are shipped. The official Maple creature reference and approved neutral character face were inspected as visual benchmarks.

Review pass completed the missing mergeVertices patch after mergeGeometries. Indexed batches preserve normals, UVs, and vertex colours while reducing uploaded vertices. Shared geometry and materials have process lifetime. Replacing a pet removes its root; replacing magic releases private particle buffers and materials exactly once. The star tilt now keeps five-point silhouettes readable during the orbit.

| Cosmetic | Draws | Triangles | Particles | Mesh vertices | Mesh buffer bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Mochi 1 | 8 | 2214 | 0 | 1730 | 89404 |
| Peaches 4 | 8 | 2470 | 0 | 1894 | 98156 |
| Mer 24 | 4 | 2710 | 0 | 2055 | 106680 |
| Orbiting stars 1 | 4 | 456 | 18 | 1080 | 50256 |
| Rune circle 17 | 2 | 648 | 12 | 840 | 40848 |
| Forest spirits 26 | 2 | 0 | 20 | 0 | 0 |

Counts include only the cosmetic, excluding floor and placeholder avatar. Buffer totals sum mesh attributes and indices. These recipes are shared across players, and particle layers are private per effect.

Passed focused Node tests, tsc --noEmit, Prettier checks, and git diff --check. Five tests cover saved IDs, budgets, finite vertices and particles, indexed bounds, articulation, fixed-clock reduced motion, 30 replacements per selected pet and spell, strict sharing identity, retained shared materials, and idempotent disposal of private particles.

CUA verified standalone front, three-quarter, rear, bird's-eye, daytime, and animated night views using root's existing Vite port 5176. Browser warnings/errors were empty. Screenshot saves were confirmed in the browser and on disk. The test harness uses fixed t=0 when animation is disabled, matching the production caller's reduced-motion clock contract. Full game wardrobe, cameras, remote swaps and fallback checks were subsequently completed; see ../ART-QA.md.

Local detailed evidence in .browser/art-evidence (the three-quarter proof is also committed here):

- familiars-front-day.png
- familiars-three-quarter-day.png
- familiars-rear-day.png
- familiars-overhead-day.png
- familiars-three-quarter-night.png, animated clock 17.8

No blockers for this assigned cosmetic slice. No merge, deployment, economy, or UI changes were made.
