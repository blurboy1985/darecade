import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Simulation,
  rulesVersion,
  type Input,
  type Replay,
} from "../shared/simulation.ts";
import { Store } from "../server/store.mjs";
import {
  Community,
  INVITE_CAP,
  INVITE_XP,
  PRIVACY_VERSION,
} from "../server/community.mjs";

test("an invite pays both players once the friend plays, with a cap, and cannot be farmed", () => {
  const directory = mkdtempSync(join(tmpdir(), "darecade-invite-"));
  let now = Date.parse("2026-10-06T10:00:00+08:00");
  const store = new Store(":memory:", () => now),
    community = new Community(store, { directory });
  const join_ = () =>
    community.join({
      year: 2000,
      month: 1,
      consent: true,
      privacyVersion: PRIVACY_VERSION,
    }).me.id;
  /** A short verified round of Hop Hop that ends on the first crate. */
  const round = (id: string) => {
    const session = community.begin(id, "hop");
    const sim = new Simulation("hop", session.seed),
      input: Input = [0, 0, -1, 0, -1, -1],
      events: Replay["events"] = [[0, ...input]];
    while (!sim.ended) sim.advance(input);
    now += (sim.ticks * 1000) / 60 + 1000;
    return community.finish(id, {
      id: session.id,
      score: sim.score,
      replay: { version: rulesVersion("hop"), ticks: sim.ticks, events },
    });
  };
  const xp = (id: string) => community.privateProfile(id).progress.xp;
  try {
    const host = join_();
    const link = community.invite(host);
    assert.match(link.code, /^[BCDFGHJKLMNPQRSTVWXZ2-9]{8}$/);
    assert.equal(community.invite(host).code, link.code, "one link per player");
    assert.deepEqual(
      { joined: link.joined, played: link.played, xp: link.xp, cap: link.cap },
      { joined: 0, played: 0, xp: 0, cap: INVITE_CAP },
    );
    assert.throws(() => community.acceptInvite(host, link.code), /your own/);
    assert.throws(
      () => community.acceptInvite(join_(), "NOPE"),
      /no longer open/,
    );
    assert.throws(() => community.acceptInvite(join_(), 42), /no longer open/);

    const friend = join_();
    const accepted = community.acceptInvite(friend, link.code.toLowerCase());
    assert.equal(accepted.inviter, host);
    assert.equal(accepted.xp, INVITE_XP);
    assert.equal(
      community.acceptInvite(friend, link.code).inviter,
      host,
      "accepting twice is harmless",
    );
    // Joining alone pays nothing; the friend has to play.
    assert.equal(xp(host), 0);
    assert.equal(community.invite(host).joined, 1);
    assert.equal(community.invite(host).played, 0);
    const first = round(friend);
    assert.deepEqual(first.invite, { xp: INVITE_XP });
    // The round, the welcome bonus and the invite.
    assert.equal(xp(friend), 20 + 35 + INVITE_XP);
    assert.equal(xp(host), INVITE_XP);
    assert.equal(round(friend).invite, null, "paid once");
    assert.equal(xp(host), INVITE_XP);

    // Someone who has already played cannot claim a link afterwards.
    const veteran = join_();
    round(veteran);
    assert.throws(
      () => community.acceptInvite(veteran, link.code),
      /not played/,
    );
    // A friend can follow only one invite.
    const other = join_();
    assert.throws(
      () => community.acceptInvite(friend, community.invite(other).code),
      /another invite/,
    );

    // The inviter is paid for five friends; the sixth still gets their own XP.
    for (let i = 2; i <= INVITE_CAP + 1; i++) {
      const next = join_();
      community.acceptInvite(next, link.code);
      const result = round(next);
      assert.equal(result.invite.xp, INVITE_XP);
      assert.equal(xp(host), Math.min(i, INVITE_CAP) * INVITE_XP);
    }
    const summary = community.invite(host);
    assert.equal(summary.joined, INVITE_CAP + 1);
    assert.equal(summary.played, INVITE_CAP + 1);
    assert.equal(summary.xp, INVITE_CAP * INVITE_XP);
    assert.equal(
      community.privateProfile(host).styleRewards,
      Math.floor(summary.xp / 100),
      "passive invite XP also announces earned tokens",
    );
    const lastActive = store.db
      .prepare("SELECT last_active FROM profiles WHERE player=?")
      .get(host).last_active;
    assert.ok(
      lastActive < now,
      "invite rewards do not mark the inviter active",
    );
    assert.equal(
      community.takeStyleRewards(host).tokens,
      Math.floor(summary.xp / 100),
    );
    assert.equal(community.takeStyleRewards(host).tokens, 0);
    assert.equal(community.export(host).invite.friendsJoined, INVITE_CAP + 1);
    assert.equal(community.export(friend).invite.joinedByInvite, true);
    assert.equal(community.export(friend).invite.code, null);

    // Deleting an account removes its link and its invitation records.
    community.delete(host);
    assert.throws(
      () => community.acceptInvite(join_(), link.code),
      /no longer open/,
    );
    assert.equal(
      store.db.prepare("SELECT COUNT(*) n FROM invite_joins").get().n,
      0,
    );
    assert.equal(store.db.prepare("SELECT COUNT(*) n FROM invites").get().n, 1);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
