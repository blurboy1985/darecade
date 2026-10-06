import { hairVisual, hairKey } from "../src/hair-catalog.ts";
import test from "node:test";
import assert from "node:assert/strict";
import {
  seededLook,
  distinctHair,
  separateCharacter,
} from "../src/character-identity.ts";
import { fresh, normalise } from "../src/state.ts";
import { canWear } from "../src/collections.ts";
test("stable guest IDs cover all starter shapes, skin tones and bright palettes", () => {
  const looks = Array.from({ length: 1000 }, (_, i) =>
    seededLook(`guest-${i}`),
  );
  assert.equal(new Set(looks.map((l) => l.skin)).size, 8);
  assert.equal(new Set(looks.map((l) => hairVisual(l.hair).shape)).size, 8);
  assert.equal(new Set(looks.map((l) => hairVisual(l.hair).colour)).size, 10);
  for (const [i, look] of looks.entries()) {
    assert.deepEqual(look, seededLook(`guest-${i}`));
    assert.ok(canWear("hair", look.hair, fresh(), 0));
    assert.equal(look.baseHair, look.hair);
    assert.deepEqual(
      normalise({ ...fresh(), ...look }, fresh()).hair,
      look.hair,
    );
  }
});
test("neighbours avoid occupied hair and overlapping spawn positions", () => {
  const occupied = new Set([0]);
  for (let i = 0; i < 5; i++) {
    const hair = distinctHair(0, occupied);
    assert.ok(!occupied.has(hair));
    occupied.add(hair);
  }
  const player = { x: 0, z: 10 };
  const npc = { ...player };
  separateCharacter(npc, [player], 123);
  assert.ok(Math.hypot(npc.x - player.x, npc.z - player.z) >= 2.049);
  assert.deepEqual(player, { x: 0, z: 10 });
});

test("ten characters have unique hair silhouettes/colours and at most two blues", () => {
  const used = new Set<number>();
  for (let i = 0; i < 10; i++)
    used.add(distinctHair(seededLook(`neighbour-${i}`).hair, used));
  assert.equal(new Set([...used].map(hairKey)).size, 10);
  assert.ok([...used].filter((h) => hairVisual(h).colour === 9).length <= 2);
});
