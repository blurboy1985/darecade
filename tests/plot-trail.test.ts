import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createWaterTrail,
  trailTiles,
  traceWater,
  validWaterTrail,
} from "../shared/plot-trail.ts";
import {
  crops,
  cropReadyAt,
  fresh,
  harvestCrop,
  normalise,
  plantCrop,
  tendCrop,
  waterCrop,
} from "../src/state.ts";
import { Store } from "../server/store.mjs";
import { Community, PRIVACY_VERSION } from "../server/community.mjs";

const HOUR = 3_600_000;
const START = Date.parse("2026-10-04T09:00:00+08:00");
const linksByCrop = {
  chilli: [[0], [1], [2]],
  pandan: [[0, 1], [1], [2]],
  sunflower: [
    [0, 1],
    [1, 2],
    [2, 0],
  ],
};
const turnTriples = Array.from({ length: 64 }, (_, n) => [
  n % 4,
  Math.floor(n / 4) % 4,
  Math.floor(n / 16),
]);

/** Independent coordinate-based flood fill catches row wrapping and one-way pipes. */
function expectedWater(tiles: readonly number[]) {
  const seen = new Set<number>();
  if (tiles.length === 9 && tiles[0] & 8) seen.add(0);
  for (const cell of seen) {
    const x = cell % 3;
    const y = Math.floor(cell / 3);
    for (const [dx, dy, outgoing, incoming] of [
      [0, -1, 1, 4],
      [1, 0, 2, 8],
      [0, 1, 4, 1],
      [-1, 0, 8, 2],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx > 2 || ny < 0 || ny > 2) continue;
      const next = ny * 3 + nx;
      if (tiles[cell] & outgoing && tiles[next] & incoming) seen.add(next);
    }
  }
  return {
    wet: [...seen].sort((a, b) => a - b),
    complete: seen.has(8) && Boolean(tiles[8] & 2),
  };
}

function solvedPayload(crop: string, planted: number) {
  const trail = createWaterTrail(crop, planted);
  const turns = turnTriples.find(
    (turns) => expectedWater(trailTiles(trail, turns)).complete,
  );
  assert.ok(turns, `no solution for ${crop} planted at ${planted}`);
  return { crop, planted, turns: [...turns] };
}

function malformedPayloads(payload: ReturnType<typeof solvedPayload>) {
  const bad: [string, unknown][] = [
    ["missing payload", undefined],
    ["null payload", null],
    ["boolean payload", true],
    ["number payload", 1],
    ["string payload", JSON.stringify(payload)],
    ["array payload", [payload]],
    ["empty object", {}],
    ["missing crop", { planted: payload.planted, turns: payload.turns }],
    ["missing planted", { crop: payload.crop, turns: payload.turns }],
    ["missing turns", { crop: payload.crop, planted: payload.planted }],
    ["wrong crop", { ...payload, crop: `${payload.crop}-other` }],
    ["older planting", { ...payload, planted: payload.planted - 1 }],
    ["newer planting", { ...payload, planted: payload.planted + 1 }],
    ["string timestamp", { ...payload, planted: String(payload.planted) }],
    ["empty turns", { ...payload, turns: [] }],
    ["two turns", { ...payload, turns: payload.turns.slice(0, 2) }],
    ["four turns", { ...payload, turns: [...payload.turns, 0] }],
    ["string turns", { ...payload, turns: payload.turns.join("") }],
    ["object turns", { ...payload, turns: { ...payload.turns, length: 3 } }],
    [
      "typed array turns",
      { ...payload, turns: Uint8Array.from(payload.turns) },
    ],
    ["sparse turns", { ...payload, turns: Array(3) }],
    ["incomplete trail", { ...payload, turns: [0, 0, 0] }],
    ["forged completion", { ...payload, turns: [0, 0, 0], complete: true }],
  ];
  for (let gate = 0; gate < 3; gate++) {
    const sparse = [...payload.turns];
    delete sparse[gate];
    bad.push([`gate ${gate} is missing`, { ...payload, turns: sparse }]);
    for (const value of [
      -1,
      4,
      0.5,
      NaN,
      Infinity,
      -Infinity,
      "1",
      null,
      true,
      undefined,
    ]) {
      const turns: unknown[] = [...payload.turns];
      turns[gate] = value;
      bad.push([`gate ${gate} has ${String(value)}`, { ...payload, turns }]);
    }
  }
  return bad;
}

test("every crop gets a deterministic unsolved trail with a solution among all 64 turn triples", () => {
  for (const crop of crops) {
    const layouts = new Set<string>();
    for (let planting = 0; planting < 100; planting++) {
      const planted = START + planting * 97_013;
      const trail = createWaterTrail(crop.id, planted);
      const before = structuredClone(trail);
      assert.deepEqual(trail, createWaterTrail(crop.id, planted));
      assert.deepEqual(trail, createWaterTrail(crop.id, planted, 0));
      assert.equal(trail.tiles.length, 9);
      assert.ok(
        trail.tiles.every(
          (tile) => Number.isInteger(tile) && tile > 0 && tile <= 15,
        ),
      );
      assert.equal(trail.gates.length, 3);
      assert.equal(new Set(trail.gates).size, 3);
      assert.deepEqual(trail.links, linksByCrop[crop.id]);
      assert.ok(
        trail.gates.every(
          (cell) => Number.isInteger(cell) && cell >= 0 && cell < 9,
        ),
      );
      assert.equal(expectedWater(trail.tiles).complete, false);
      let solutions = 0;
      for (const turns of turnTriples) {
        const tiles = trailTiles(trail, turns);
        const expected = expectedWater(tiles);
        const actual = traceWater(tiles);
        assert.equal(new Set(actual.wet).size, actual.wet.length);
        assert.deepEqual(
          { ...actual, wet: [...actual.wet].sort((a, b) => a - b) },
          expected,
        );
        assert.equal(
          validWaterTrail(crop.id, planted, { crop: crop.id, planted, turns }),
          expected.complete,
        );
        solutions += Number(expected.complete);
      }
      assert.ok(
        solutions > 0,
        `${crop.id} planting ${planting} must be solvable`,
      );
      assert.deepEqual(
        trail,
        before,
        "trying every move must not mutate the board",
      );
      layouts.add(JSON.stringify(trail));
    }
    assert.ok(layouts.size > 1, "successive plantings should vary the puzzle");
  }
});

test("practice variations stay deterministic, unsolved and solvable", () => {
  const layouts = new Set<string>();
  for (const crop of crops) {
    for (let variation = 0; variation < 100; variation++) {
      const trail = createWaterTrail(crop.id, START, variation);
      assert.deepEqual(trail, createWaterTrail(crop.id, START, variation));
      assert.equal(expectedWater(trail.tiles).complete, false);
      assert.ok(
        turnTriples.some(
          (turns) => expectedWater(trailTiles(trail, turns)).complete,
        ),
      );
      layouts.add(JSON.stringify(trail));
    }
  }
  assert.ok(layouts.size > 1);
});

test("sunflower plantings and practice trails require at least four clicks across every legal solution", () => {
  for (let sample = 0; sample < 500; sample++) {
    const cases = [
      { planted: START + sample * 97_013, variation: 0 },
      { planted: START, variation: sample + 1 },
    ];
    for (const { planted, variation } of cases) {
      const trail = createWaterTrail("sunflower", planted, variation);
      let minimumClicks = Infinity;
      // Exhaust the actual board, including equivalent linked-control solutions.
      // Do not reuse the generator's scramble filter or production flow/turn code.
      for (const [a, b, c] of turnTriples) {
        const tiles = [...trail.tiles];
        [a + c, a + b, b + c].forEach((total, gate) => {
          const count = total % 4;
          const cell = trail.gates[gate];
          const mask = tiles[cell];
          tiles[cell] = ((mask << count) | (mask >> (4 - count))) & 15;
        });
        if (expectedWater(tiles).complete)
          minimumClicks = Math.min(minimumClicks, a + b + c);
      }
      const label = `sunflower planting ${planted}, variation ${variation}`;
      assert.ok(Number.isFinite(minimumClicks), `${label} must be solvable`);
      assert.ok(
        minimumClicks >= 4,
        `${label} takes only ${minimumClicks} clicks`,
      );
    }
  }
});

test("turns rotate only the three gates clockwise without mutating the inputs", () => {
  const trail = {
    tiles: [1, 2, 3, 4, 6, 8, 9, 10, 12],
    gates: [0, 4, 8],
    links: [[0], [1], [2]],
  };
  const before = structuredClone(trail);
  for (const turns of turnTriples) {
    const input = Object.freeze([...turns]);
    const actual = trailTiles(trail, input);
    const expected = [...trail.tiles];
    trail.gates.forEach((gate, i) => {
      const mask = trail.tiles[gate];
      expected[gate] = ((mask << turns[i]) | (mask >> (4 - turns[i]))) & 15;
    });
    assert.deepEqual(actual, expected);
    assert.notEqual(actual, trail.tiles);
    assert.deepEqual(trail, before);
    assert.deepEqual(input, turns);
  }
});

test("linked controls turn their partners and add clockwise click counts modulo four", () => {
  const scenarios: {
    crop: keyof typeof linksByCrop;
    rotations: (turns: readonly number[]) => readonly number[];
  }[] = [
    { crop: "chilli", rotations: (turns) => turns },
    { crop: "pandan", rotations: ([a, b, c]) => [a, a + b, c] },
    { crop: "sunflower", rotations: ([a, b, c]) => [a + c, a + b, b + c] },
  ];
  for (const { crop, rotations } of scenarios) {
    const trail = createWaterTrail(crop, START);
    const before = structuredClone(trail);
    for (const turns of turnTriples) {
      const expected = [...trail.tiles];
      rotations(turns).forEach((total, gate) => {
        const count = total % 4;
        const cell = trail.gates[gate];
        const mask = trail.tiles[cell];
        expected[cell] = ((mask << count) | (mask >> (4 - count))) & 15;
      });
      assert.deepEqual(trailTiles(trail, turns), expected, `${crop}: ${turns}`);
    }
    for (let control = 0; control < 3; control++) {
      const clicks = [0, 0, 0];
      clicks[control] = 1;
      const changed = trailTiles(trail, clicks)
        .map((mask, cell) => (mask === trail.tiles[cell] ? -1 : cell))
        .filter((cell) => cell >= 0)
        .sort((a, b) => a - b);
      const linkedCells = linksByCrop[crop][control]
        .map((gate) => trail.gates[gate])
        .sort((a, b) => a - b);
      assert.deepEqual(
        changed,
        linkedCells,
        `${crop} control ${control} must turn every linked elbow`,
      );
      const once = { ...trail, tiles: trailTiles(trail, clicks) };
      clicks[control] = 3;
      assert.deepEqual(
        trailTiles(once, clicks),
        trail.tiles,
        "four clicks restore every linked pipe",
      );
    }
    assert.deepEqual(trail, before);
  }
});

test("water needs reciprocal openings, the west inlet, and the east outlet", () => {
  const snake = [10, 10, 12, 6, 10, 9, 3, 10, 10];
  const before = [...snake];
  assert.deepEqual(
    [...traceWater(snake).wet].sort((a, b) => a - b),
    [0, 1, 2, 3, 4, 5, 6, 7, 8],
  );
  assert.equal(traceWater(snake).complete, true);
  assert.deepEqual(snake, before);
  assert.deepEqual(traceWater([2, ...snake.slice(1)]), {
    wet: [],
    complete: false,
  });
  assert.deepEqual(traceWater([10, 2, ...snake.slice(2)]), {
    wet: [0],
    complete: false,
  });
  const closedOutlet = [...snake.slice(0, 8), 8];
  assert.equal(traceWater(closedOutlet).wet.length, 9);
  assert.equal(traceWater(closedOutlet).complete, false);
  for (const tiles of [[], snake.slice(0, 8), [...snake, 10]])
    assert.deepEqual(traceWater(tiles), { wet: [], complete: false });
});

test("water cannot wrap between rows or loop forever through a cycle", () => {
  const wrapped = [10, 10, 10, 12, 0, 0, 3, 10, 10];
  assert.deepEqual(traceWater(wrapped), { wet: [0, 1, 2], complete: false });
  const loop = [14, 12, 0, 3, 9, 0, 0, 0, 0];
  const result = traceWater(loop);
  assert.deepEqual(
    [...result.wet].sort((a, b) => a - b),
    [0, 1, 3, 4],
  );
  assert.equal(result.complete, false);
});

test("trail validation rejects malformed, incomplete and stale planting reports", () => {
  for (const crop of crops) {
    const payload = solvedPayload(crop.id, START);
    const before = structuredClone(payload);
    assert.equal(validWaterTrail(crop.id, START, payload), true);
    for (const [label, value] of malformedPayloads(payload))
      assert.equal(validWaterTrail(crop.id, START, value), false, label);
    assert.equal(validWaterTrail(crop.id, START + 1, payload), false);
    assert.equal(validWaterTrail("another-crop", START, payload), false);
    assert.deepEqual(payload, before);
  }
});

test("tending applies the existing single boost without XP and survives save reload", () => {
  for (const crop of crops) {
    const state = fresh();
    state.xp = 27;
    assert.equal(plantCrop(state, crop.id, START), true);
    const original = structuredClone(state);
    const payload = solvedPayload(crop.id, START);
    const now = START + 12_347;
    for (const [label, value] of malformedPayloads(payload)) {
      assert.equal(tendCrop(state, value, now), false, label);
      assert.deepEqual(state, original, `${label} must not mutate progress`);
    }
    const legacy = structuredClone(state);
    assert.equal(waterCrop(legacy, now), true);
    assert.equal(tendCrop(state, payload, now), true);
    assert.deepEqual(
      state,
      legacy,
      "the puzzle must preserve existing watering rewards",
    );
    assert.equal(state.plotWatered, true);
    assert.equal(state.xp, 27);
    assert.equal(
      cropReadyAt(state),
      START + crop.hours * HOUR - Math.floor((crop.hours * HOUR - 12_347) / 4),
    );
    const after = structuredClone(state);
    assert.equal(tendCrop(state, payload, now), false, "replayed completion");
    assert.equal(
      tendCrop(state, solvedPayload(crop.id, state.plotPlanted), now),
      false,
      "fresh solution cannot bypass the watering cap",
    );
    assert.equal(
      waterCrop(state, now),
      false,
      "legacy watering shares the same cap",
    );
    assert.deepEqual(state, after);
    assert.deepEqual(
      normalise(JSON.parse(JSON.stringify(state)), fresh()),
      state,
    );
    assert.equal(harvestCrop(state, cropReadyAt(state) - 1), null);
    assert.equal(harvestCrop(state, cropReadyAt(state))?.id, crop.id);
    assert.equal(state.xp, 27 + crop.xp);
    assert.equal(state.harvests, 1);
  }
});

test("watering through old clients prevents a second boost from tending", () => {
  const state = fresh();
  assert.equal(plantCrop(state, "pandan", START), true);
  const originalPayload = solvedPayload(state.plotCrop, state.plotPlanted);
  assert.equal(waterCrop(state, START + HOUR), true);
  const after = structuredClone(state);
  assert.equal(tendCrop(state, originalPayload, START + HOUR), false);
  assert.equal(
    tendCrop(
      state,
      solvedPayload(state.plotCrop, state.plotPlanted),
      START + HOUR,
    ),
    false,
  );
  assert.deepEqual(state, after);
});

test("tending floors the quarter-time boost and refuses empty or mature plots", () => {
  const empty = fresh();
  const emptyBefore = structuredClone(empty);
  assert.equal(tendCrop(empty, solvedPayload("chilli", START), START), false);
  assert.deepEqual(empty, emptyBefore);
  for (const remaining of [1, 2, 3, 4, 5, 7, 1_001]) {
    const state = fresh();
    plantCrop(state, "chilli", START);
    const ready = cropReadyAt(state);
    const now = ready - remaining;
    assert.equal(tendCrop(state, solvedPayload("chilli", START), now), true);
    assert.equal(cropReadyAt(state), ready - Math.floor(remaining / 4));
    assert.ok(
      cropReadyAt(state) > now,
      "watering cannot skip the remaining growth",
    );
    assert.equal(state.xp, 0);
  }
  for (const late of [0, 1, 30 * 24 * HOUR]) {
    const state = fresh();
    plantCrop(state, "chilli", START);
    const before = structuredClone(state);
    assert.equal(
      tendCrop(
        state,
        solvedPayload("chilli", START),
        cropReadyAt(state) + late,
      ),
      false,
    );
    assert.deepEqual(state, before);
  }
});

test("a previous planting's solution cannot water the same crop after harvest and replanting", () => {
  const state = fresh();
  plantCrop(state, "chilli", START);
  const old = solvedPayload("chilli", START);
  const nextPlanting = cropReadyAt(state) + 1;
  assert.equal(harvestCrop(state, nextPlanting)?.id, "chilli");
  assert.equal(plantCrop(state, "chilli", nextPlanting), true);
  const before = structuredClone(state);
  assert.equal(tendCrop(state, old, nextPlanting), false);
  assert.deepEqual(state, before);
  assert.equal(
    tendCrop(state, solvedPayload("chilli", nextPlanting), nextPlanting),
    true,
  );
  assert.equal(state.xp, 10);
});

function serverFixture() {
  const directory = mkdtempSync(join(tmpdir(), "darecade-plot-trail-"));
  let now = START;
  const store = new Store(":memory:", () => now);
  const community = new Community(store, { directory });
  const { me } = community.join({
    month: 1,
    year: 2000,
    consent: true,
    privacyVersion: PRIVACY_VERSION,
  });
  return {
    store,
    community,
    player: me.id,
    setTime: (time: number) => {
      now = time;
    },
    go: (event: string, value?: unknown) =>
      community.progression(me.id, event, value).progress,
    persisted: () => ({
      // total_changes also counts rolled-back writes, so rejected attempts must
      // fail before persistence rather than merely relying on transaction rollback.
      writes: store.db.prepare("SELECT total_changes() count").get().count,
      profile: store.db
        .prepare("SELECT * FROM profiles WHERE player=?")
        .get(me.id),
      player: store.db.prepare("SELECT * FROM players WHERE id=?").get(me.id),
    }),
    close: () => {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

test("the server rejects incomplete, malformed and stale tend reports before any persistence write", () => {
  for (const crop of crops) {
    const server = serverFixture();
    try {
      const payload = solvedPayload(crop.id, START);
      const empty = server.persisted();
      assert.throws(() => server.go("tend", payload));
      assert.deepEqual(server.persisted(), empty);
      server.go("plant", crop.id);
      server.setTime(START + 12_347);
      const before = server.persisted();
      for (const [label, value] of malformedPayloads(payload)) {
        assert.throws(() => server.go("tend", value), undefined, label);
        assert.deepEqual(server.persisted(), before, `${crop.id}: ${label}`);
      }
      const planted = server.community.privateProfile(server.player).progress;
      assert.equal(planted.plotWatered, false);
      assert.equal(planted.plotPlanted, START);
      assert.equal(planted.xp, 0);
    } finally {
      server.close();
    }
  }
});

test("the server uses its own clock, persists one tending boost and pays only normal harvest XP", () => {
  const server = serverFixture();
  try {
    server.go("plant", "chilli");
    const payload = solvedPayload("chilli", START);
    server.setTime(START + 12_347);
    const writesBefore = server.persisted().writes;
    const tended = server.go("tend", {
      ...payload,
      now: START + 100 * HOUR,
      xp: 9999,
    });
    const ready = START + HOUR - Math.floor((HOUR - 12_347) / 4);
    assert.equal(tended.plotWatered, true);
    assert.equal(cropReadyAt(tended), ready);
    assert.equal(tended.xp, 0);
    assert.ok(server.persisted().writes > writesBefore);
    assert.deepEqual(
      server.community.privateProfile(server.player).progress,
      tended,
    );
    const after = server.persisted();
    for (const replay of [
      payload,
      solvedPayload("chilli", tended.plotPlanted),
    ]) {
      assert.throws(() => server.go("tend", replay));
      assert.deepEqual(server.persisted(), after);
    }
    assert.throws(() => server.go("water"));
    assert.deepEqual(server.persisted(), after);
    server.setTime(ready - 1);
    assert.throws(() => server.go("harvest"), /not ready/);
    assert.deepEqual(server.persisted(), after);
    server.setTime(ready);
    const harvested = server.go("harvest");
    assert.equal(harvested.plotCrop, "");
    assert.equal(harvested.harvests, 1);
    assert.equal(harvested.xp, 10);
    server.setTime(ready + 1);
    const replanted = server.go("plant", "chilli");
    const secondPlanting = server.persisted();
    assert.throws(() => server.go("tend", payload));
    assert.deepEqual(server.persisted(), secondPlanting);
    assert.equal(
      server.go("tend", solvedPayload("chilli", replanted.plotPlanted)).xp,
      10,
    );
  } finally {
    server.close();
  }
});

test("the server keeps legacy watering compatible and rejects tending mature crops without writes", () => {
  const server = serverFixture();
  try {
    server.go("plant", "pandan");
    server.setTime(START + HOUR);
    const watered = server.go("water");
    assert.equal(cropReadyAt(watered), START + 2.5 * HOUR);
    const before = server.persisted();
    assert.throws(() =>
      server.go("tend", solvedPayload("pandan", watered.plotPlanted)),
    );
    assert.deepEqual(server.persisted(), before);
    server.setTime(cropReadyAt(watered));
    server.go("harvest");
    const planted = server.go("plant", "sunflower");
    server.setTime(cropReadyAt(planted));
    const mature = server.persisted();
    assert.throws(() =>
      server.go("tend", solvedPayload("sunflower", planted.plotPlanted)),
    );
    assert.deepEqual(server.persisted(), mature);
    assert.equal(server.go("harvest").xp, 40);
  } finally {
    server.close();
  }
});
