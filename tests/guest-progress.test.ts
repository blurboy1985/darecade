import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Community } from "../server/community.mjs";
import { Store } from "../server/store.mjs";
import { CommunityCore, PRIVACY_VERSION } from "../server/community-core.mjs";
import { Simulation, type Input, type Replay } from "../shared/simulation.ts";

const DAY = 86400000;
const consent = {
  over13: true,
  consent: true,
  privacyVersion: PRIVACY_VERSION,
};

test("guest device access renews past 30 days but cannot revive revoked or expired sessions", () => {
  let now = Date.parse("2026-10-08T10:00:00+08:00");
  const store = new Store(":memory:", () => now);
  const directory = mkdtempSync(join(tmpdir(), "simi-device-session-"));
  const c = new Community(store, { directory });
  try {
    const guest = c.join(consent);
    now += 31 * DAY;
    assert.equal(c.renewGuestSession(guest.token), guest.me.id);
    now += 340 * DAY;
    assert.equal(c.lookup(guest.token), guest.me.id);
    c.renewGuestSession(guest.token);
    c.logout(guest.me.id, guest.token);
    assert.equal(c.renewGuestSession(guest.token), null);
    // Upgrade a still-valid cookie created by the old 30-day guest policy.
    const legacy = c.issue(guest.me.id);
    store.db
      .prepare("UPDATE sessions SET expires=? WHERE player=?")
      .run(now + 30 * DAY, guest.me.id);
    now += 29 * DAY;
    assert.equal(c.renewGuestSession(legacy), guest.me.id);
    now += 31 * DAY;
    assert.equal(c.lookup(legacy), guest.me.id);
    c.delete(guest.me.id);
    assert.equal(c.renewGuestSession(legacy), null);
    const second = c.join(consent).token;
    now += 366 * DAY;
    assert.equal(c.renewGuestSession(second), null);
    assert.equal(c.lookup(second), null);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("guest replay scores earn XP, daily medal tokens and weekly and season ranks without email", () => {
  let now = Date.parse("2026-10-04T10:00:00+08:00");
  const store = new Store(":memory:", () => now);
  const c = new CommunityCore(store, {
    seasonView: true,
    competitionSeasons: JSON.stringify([
      {
        id: "guest-season",
        name: "Guest season",
        startsAt: "2026-10-05T00:00:00+08:00",
      },
    ]),
  });
  now += DAY;
  try {
    const guest = c.join(consent),
      host = c.join(consent);
    const play = (id: string, target?: string) => {
      const run = c.begin(id, "hop", target);
      assert.equal(run.ranked, true);
      const sim = new Simulation("hop", run.seed);
      const input: Input = [0, 0, -1, 0, -1, -1];
      while (!sim.ended) sim.advance(input);
      const replay: Replay = {
        version: 1,
        ticks: sim.ticks,
        events: [[0, ...input]],
      };
      now += Math.ceil((sim.ticks / 60) * 1000) + 1000;
      const payload = { id: run.id, score: sim.score, replay };
      const result = c.finish(id, payload);
      assert.deepEqual(c.finish(id, payload).profile, result.profile);
      assert.equal(c.finish(id, payload).ranked, true);
      return result;
    };
    play(host.me.id);
    const result = play(guest.me.id, host.me.id);
    assert.ok(result.profile.progress.xp > 0);
    assert.equal(c.state(guest.me.id).competitionReady, true);
    assert.ok(
      c.state(guest.me.id).boards.hop.some((r) => r.id === guest.me.id),
    );
    assert.throws(() => c.begin(guest.me.id, "hop", host.me.id), /already/);
    now += DAY;
    store.settle();
    const state = c.state(guest.me.id);
    assert.equal(state.profile.progress.medalTokens, 3);
    assert.ok(state.weekly.some((r) => r.id === guest.me.id));
    assert.ok(state.season.standings.some((r) => r.id === guest.me.id));
    assert.equal(state.profile.account, null);
    assert.equal(
      store.db.prepare("SELECT count(*) n FROM accounts").get().n,
      0,
    );
    assert.equal(
      store.db.prepare("SELECT count(*) n FROM medal_email_outbox").get().n,
      0,
    );
  } finally {
    store.close();
  }
});
