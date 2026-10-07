import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { fitHairUnderHeadwear } from "../src/headwear-fit.ts";

test("headwear takes priority while uncovered hair and shared geometry stay intact", () => {
  const geometry = new T.SphereGeometry(0.5, 24, 16);
  const original = Array.from(geometry.getAttribute("position").array);
  const root = new T.Group();
  root.position.set(7, 2, -3);
  root.rotation.y = 0.7;
  root.scale.setScalar(0.82);
  const hair = new T.Group();
  const mesh = new T.Mesh(geometry);
  hair.add(mesh);
  root.add(hair);
  const hat = new T.Mesh(new T.BoxGeometry(2, 0.2, 2));
  hat.position.y = 0.3;
  root.add(hat);
  fitHairUnderHeadwear(hair, [hat], "test-brim");
  const fitted = mesh.geometry.getAttribute("position");
  const source = geometry.getAttribute("position");
  for (let i = 0; i < fitted.count; i++) {
    assert.ok(
      fitted.getY(i) < 0.2,
      "hair cannot protrude above the brim underside",
    );
    if (source.getY(i) < 0) {
      assert.equal(fitted.getX(i), source.getX(i));
      assert.equal(fitted.getY(i), source.getY(i));
      assert.equal(fitted.getZ(i), source.getZ(i));
    }
  }
  assert.deepEqual(
    Array.from(geometry.getAttribute("position").array),
    original,
  );
  assert.equal(hair.userData.fittedHeadwear, true);
  const second = new T.Group();
  const clone = new T.Mesh(geometry);
  second.add(clone);
  root.add(second);
  fitHairUnderHeadwear(second, [hat], "test-brim");
  assert.equal(
    clone.geometry,
    mesh.geometry,
    "repeat look reuses the fitted geometry",
  );
});

test("no headwear leaves the original hairstyle available for motion", () => {
  const hair = new T.Group();
  const geometry = new T.SphereGeometry();
  const mesh = new T.Mesh(geometry);
  hair.add(mesh);
  fitHairUnderHeadwear(hair, [], "none");
  assert.equal(mesh.geometry, geometry);
  assert.equal(hair.userData.fittedHeadwear, undefined);
});
