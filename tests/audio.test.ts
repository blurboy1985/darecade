import test from "node:test";
import assert from "node:assert/strict";
import { audio } from "../src/audio.ts";

test("restoring enabled audio preferences waits for a player gesture", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  let created = 0;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      AudioContext: class {
        constructor() {
          created++;
          throw Error("Audio started without a gesture");
        }
      },
    },
  });
  try {
    audio.configure(true, true);
    audio.setTheme("night");
    audio.play("step");
    // Coast Rush's music, effects and engine loop follow the same rule.
    audio.setTheme("race");
    audio.setTempo(1.12);
    audio.play("shell");
    audio.engine(1, true, true);
    audio.engineOff();
    assert.equal(created, 0);
  } finally {
    audio.configure(false, false);
    audio.setTempo(1);
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
