// Test-only clock control. This module is never deployed.
import worker, {
  Neighbourhood,
  World,
} from "../.browser/cloudflare-bundle/worker.js";
export { World };
export class AwardsNeighbourhood extends Neighbourhood {
  async runAwardAlarm(time) {
    this.store.now = () => time;
    this.community.now = this.store.now;
    this.community.medalRewards.now = this.store.now;
    await this.alarm();
    return true;
  }
}
export default worker;
