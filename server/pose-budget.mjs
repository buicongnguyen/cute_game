/**
 * How far an online explorer may move between two pose messages. Every proximity rule on the server (requireNear, the
 * pond, the cage, a friend's bed) trusts peer.pose, so a pose may only follow the explorer's real movement.
 *
 * The old check allowed 55 m/s times the gap (capped at 5 s) plus 8 m per message, and any pose near the village centre:
 * after a 5 s pause one message could cross the map (283 m), and the centre exception plus the 8 m slack per 65 ms
 * message made about 180 m/s. Now a budget refills at TOP_SPEED and saves up at most BURST: a pause buys a short burst
 * (stepping into the cottage, a dash), never a crossing. A join or a respawn (the server moves the explorer itself)
 * grants one ARRIVAL budget for the client's landing spot. The Home button's snap to the village centre is allowed at
 * home, once every SNAP_MS.
 *
 * A dropped pose would otherwise leave the server's spot behind for good: the budget never covers more than BURST, so
 * once the client is further than that from the last accepted pose every later pose is dropped too (and every proximity
 * rule refuses). So a drop answers with poseFix: the server's spot, at most once per FIX_MS, and the client puts its
 * explorer back there. The server stays the authority on where the explorer is, and the next pose is accepted again.
 */
export const TOP_SPEED = 55, BURST = 20, ARRIVAL = 40, ARRIVAL_MS = 10_000, SNAP_MS = 5000, FIX_MS = 500;

/** The server placed the explorer (join, respawn, visit): for a few seconds the poses may settle on the client's landing spot. */
export function arrived(peer, now = Date.now()) { peer.arrivedAt = now; peer.budgetAt = now; peer.poseBudget = ARRIVAL; }

/** Accepts or drops one pose; true when accepted (the caller then stores it). Updates the peer's budget (refilled from its own clock, so a dropped pose does not count the same time twice). */
export function poseStep(peer, at, distance, now) {
  if (!Number.isFinite(distance) || distance < 0 || !Number.isFinite(now)) return false;
  const last = peer.budgetAt; peer.budgetAt = now;
  const cap = now - (peer.arrivedAt ?? -Infinity) < ARRIVAL_MS ? ARRIVAL : BURST;
  // The first packet spends the same finite arrival budget as later packets. Reconnecting
  // must not turn a forged first pose into a teleport past every proximity check.
  const budget = Math.min(cap, (peer.poseBudget ?? BURST) + TOP_SPEED * Math.max(0, now - (last ?? now)) / 1000);
  if (distance <= budget) { peer.poseBudget = budget - distance; return true; }
  const snap = peer.planet === 'home' && !peer.visit && Math.hypot(at.x, at.z) < 2 && now - (peer.snapAt ?? -Infinity) >= SNAP_MS;
  if (snap) { peer.snapAt = now; peer.poseBudget = budget; return true; }
  peer.poseBudget = budget; return false;
}

/** After a dropped pose: the correction to send the client (its last accepted spot), or null when one went out under FIX_MS ago. */
export function poseFix(peer, now) {
  if (now - (peer.fixAt ?? -Infinity) < FIX_MS) return null;
  peer.fixAt = now;
  return { type: 'poseFix', planet: peer.planet, visit: peer.visit ?? null, x: peer.pose.x, z: peer.pose.z };
}
