// Test-only clock/alarm inspection. This module is never deployed.
import worker, {
  Neighbourhood,
  World,
} from "../.browser/cloudflare-bundle/worker.js";
export { World };
export class RelayNeighbourhood extends Neighbourhood {
  seedLegacyRelay(token) {
    const player = this.community.lookup(token);
    return this.community.relay.request(
      player,
      "create",
      { solo: true, difficulty: "practice" },
      token,
    );
  }
  setRelayTime(at) {
    this.store.now = () => at;
    this.community.now = this.store.now;
    this.community.relay.now = this.store.now;
    this.community.medalRewards.now = this.store.now;
    return true;
  }
  async relayAlarm() {
    await this.relayAlarmTask;
    return {
      at: await this.ctx.storage.getAlarm(),
      expiresAt: this.community.relay.nextExpiry(),
    };
  }
  async runRelayAlarm(at) {
    this.setRelayTime(at);
    await this.alarm();
    return {
      rooms: this.db.prepare("SELECT count(*) n FROM relay_rooms").get().n,
      members: this.db.prepare("SELECT count(*) n FROM relay_members").get().n,
    };
  }
}
export default worker;
