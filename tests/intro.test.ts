import test from "node:test";
import assert from "node:assert/strict";
import {
  DURATION,
  captions,
  captionAt,
  filmFor,
  introWanted,
} from "../src/intro-script.ts";

test("the intro film runs a minute and its narration stays inside it", () => {
  assert.equal(DURATION, 60);
  for (let i = 0; i < captions.length; i++) {
    assert.ok(captions[i].to > captions[i].from);
    if (i) assert.ok(captions[i].from >= captions[i - 1].to);
  }
  assert.ok(captions.at(-1)!.to <= DURATION);
});

test("each moment of the film has at most one line", () => {
  assert.equal(captionAt(0), null);
  assert.equal(captionAt(1)?.who, "kid");
  assert.equal(captionAt(6.5)?.text, "Meet you downstairs.");
  assert.equal(captionAt(17), null);
  assert.equal(captionAt(39)?.text, "I call it Play Simi.");
  assert.equal(captionAt(41)?.text, "Eh, play simi?");
  assert.equal(captionAt(59.5), null);
});

test("the film is cut for upright and sideways screens", () => {
  assert.equal(filmFor(1280, 720), "landscape");
  assert.equal(filmFor(390, 844), "vertical");
  assert.equal(filmFor(800, 800), "landscape");
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
