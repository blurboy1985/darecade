/** Serialize earlier expiry scheduling; a storage failure can be retried. */
export function queueRelayExpiryAlarm(owner) {
  const expiry = owner.community.relay.nextExpiry();
  if (expiry === null || expiry >= owner.relayAlarmAt) return;
  owner.relayAlarmAt = expiry;
  owner.relayAlarmTask = (owner.relayAlarmTask || Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const old = await owner.ctx.storage.getAlarm();
      const next = owner.nextWork();
      if (old === null || next < old) await owner.ctx.storage.setAlarm(next);
    })
    .catch((error) => {
      owner.relayAlarmAt = Infinity;
      throw error;
    });
  owner.ctx.waitUntil(owner.relayAlarmTask);
}
