import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { hairSurface } from "../src/hair-surface.ts";
import { hairShapes } from "../src/hair-catalog.ts";

test("every hair shell is connected, shares its seam, and has finite nondegenerate faces", () => {
  for (const style of hairShapes)
    for (const capped of [false, true]) {
      const geometry = hairSurface(style, capped);
      const p = geometry.getAttribute("position"),
        n = geometry.getAttribute("normal");
      const index = geometry.getIndex()!;
      assert.ok(index.count / 3 <= 1500, `${style}: shell triangle budget`);
      const neighbours = Array.from(
        { length: p.count },
        () => new Set<number>(),
      );
      const a = new T.Vector3(),
        b = new T.Vector3(),
        c = new T.Vector3();
      for (let i = 0; i < index.count; i += 3) {
        const ids = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
        a.fromBufferAttribute(p, ids[0]);
        b.fromBufferAttribute(p, ids[1]);
        c.fromBufferAttribute(p, ids[2]);
        assert.ok(
          b.sub(a).cross(c.sub(a)).lengthSq() > 1e-16,
          `${style}: collapsed triangle`,
        );
        for (const id of ids) for (const next of ids) neighbours[id].add(next);
      }
      const seen = new Set<number>(),
        queue = [0];
      while (queue.length) {
        const id = queue.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        queue.push(...[...neighbours[id]].filter((n) => !seen.has(n)));
      }
      assert.equal(seen.size, p.count, `${style}: disconnected hair lump`);
      const positions = new Set<string>();
      for (let i = 0; i < p.count; i++) {
        const point = [p.getX(i), p.getY(i), p.getZ(i)];
        assert.ok(point.every(Number.isFinite));
        const key = point.map((v) => v.toFixed(6)).join(",");
        assert.ok(!positions.has(key), `${style}: unwelded seam`);
        positions.add(key);
        assert.ok(
          Math.abs(Math.hypot(n.getX(i), n.getY(i), n.getZ(i)) - 1) < 1e-5,
        );
      }
      assert.ok(n.getY(0) > 0.9, `${style}: inverted top`);
      if (capped) {
        geometry.computeBoundingBox();
        assert.ok(geometry.boundingBox!.max.y <= 0.231);
      }
    }
});

test("colour variants share geometry without modifying the uncapped style", () => {
  for (const style of hairShapes) {
    const first = hairSurface(style, false);
    const before = Array.from(first.getAttribute("position").array);
    hairSurface(style, true);
    assert.equal(hairSurface(style, false), first);
    assert.deepEqual(Array.from(first.getAttribute("position").array), before);
  }
});
