import test from "node:test";
import assert from "node:assert/strict";
import {
  DURATION,
  scenes,
  cue,
  captions,
  sceneAt,
  captionAt,
  introWanted,
} from "../src/intro-script.ts";

test("the intro film runs 30 to 45 seconds and every scene starts on a beat", () => {
  assert.ok(DURATION >= 30 && DURATION <= 45);
  assert.equal(scenes[0].start, 0);
  for (let i = 0; i < scenes.length; i++) {
    assert.equal(scenes[i].start % 0.5, 0, scenes[i].id);
    if (i) assert.ok(scenes[i].start > scenes[i - 1].start, scenes[i].id);
  }
  assert.ok(scenes.at(-1)!.start < DURATION);
  for (const at of Object.values(cue).flat()) {
    assert.equal(at % 0.5, 0);
    assert.ok(at < DURATION);
  }
});

test("each moment of the film belongs to one scene", () => {
  assert.deepEqual(sceneAt(0), { id: "arrival", start: 0, end: 4.5 });
  assert.equal(sceneAt(4.49).id, "arrival");
  assert.equal(sceneAt(4.5).id, "countdown");
  assert.equal(sceneAt(cue.crash).id, "race-fail");
  assert.equal(sceneAt(cue.rim).id, "hoops-fail");
  assert.equal(sceneAt(cue.gameOver).id, "arcade-fail");
  assert.equal(sceneAt(cue.swish).id, "hoops-win");
  assert.equal(sceneAt(cue.pass).id, "race-win");
  assert.equal(sceneAt(cue.pose).id, "stage");
  assert.deepEqual(sceneAt(39.9), { id: "logo", start: 34, end: DURATION });
});

test("captions never overlap and the dare is followed by a beat of silence", () => {
  for (let i = 0; i < captions.length; i++) {
    assert.ok(captions[i].to > captions[i].from);
    if (i) assert.ok(captions[i].from >= captions[i - 1].to);
  }
  assert.equal(captionAt(3)?.text, "You’re late.");
  assert.equal(captionAt(3.6)?.who, "you");
  assert.equal(captionAt(10), null);
  assert.equal(captionAt(31.5)?.text, "One more round?");
  assert.equal(captionAt(32.8), null);
  assert.equal(captionAt(33.5)?.text, "Or you scared?");
  assert.equal(captionAt(cue.logo), null);
});

test("the intro plays once, can be replayed or turned off, and skips automation", () => {
  const visit = {
    search: "",
    seen: false,
    reducedMotion: false,
    automated: false,
  };
  assert.equal(introWanted(visit), true);
  assert.equal(introWanted({ ...visit, seen: true }), false);
  assert.equal(introWanted({ ...visit, reducedMotion: true }), false);
  assert.equal(introWanted({ ...visit, automated: true }), false);
  assert.equal(introWanted({ ...visit, search: "?intro=0" }), false);
  assert.equal(
    introWanted({
      search: "?playtest=1&intro=1",
      seen: true,
      reducedMotion: true,
      automated: true,
    }),
    true,
  );
});
