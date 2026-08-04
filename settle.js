/**
 * Home game settle-up.
 *
 * The problem this solves: at the end of a home game, eight people each owe or
 * are owed money, and the table spends ten minutes working out who Venmos who.
 * Naively, everyone pays the host and the host pays everyone — up to 2(N−1)
 * transfers. This computes the minimum-ish set instead.
 *
 * Algorithm: net everyone out, then repeatedly match the biggest debtor to the
 * biggest creditor and settle whichever of the two is smaller. Each pass zeroes
 * out at least one player, so it terminates in at most N−1 payments. (Finding
 * the true optimum is NP-hard — partition — but greedy hits N−1 in the worst
 * case and usually well under, which is far better than anyone does by hand.)
 *
 * Ported from PokerApp/src/lib/settle.ts. Behaviour is identical; the 20
 * hand-checked cases live in selftest.js and run at ?selftest.
 */

const round2 = (n) => Math.round(n * 100) / 100;

/** Every buy-in and rebuy of the night, summed. */
export const totalBuyIn = (p) => (p.buyIns || []).reduce((sum, b) => sum + b, 0);

/** Positive = won. */
export const netOf = (p) => round2((p.cashOut || 0) - totalBuyIn(p));

/**
 * Who pays whom. Returns an empty payment list when everyone is even.
 *
 * `discrepancy` (cashOut − buyIn across the table, which should be 0) is
 * reported rather than corrected: if the table doesn't balance, the right move
 * is to tell the host to recount, not to silently fudge someone's payment.
 */
export function settleUp(players) {
  const nets = players.map((p) => ({ id: p.id, name: p.name, net: netOf(p) }));

  const tBuy = round2(players.reduce((sum, p) => sum + totalBuyIn(p), 0));
  const tCash = round2(players.reduce((sum, p) => sum + (p.cashOut || 0), 0));

  // Work on copies; largest magnitudes first so big obligations clear early.
  const debtors = nets
    .filter((n) => n.net < -0.005)
    .map((n) => ({ ...n, owed: -n.net }))
    .sort((a, b) => b.owed - a.owed);
  const creditors = nets
    .filter((n) => n.net > 0.005)
    .map((n) => ({ ...n, due: n.net }))
    .sort((a, b) => b.due - a.due);

  const payments = [];
  let di = 0;
  let ci = 0;

  while (di < debtors.length && ci < creditors.length) {
    const d = debtors[di];
    const c = creditors[ci];
    const amount = round2(Math.min(d.owed, c.due));

    if (amount > 0.005) {
      payments.push({
        fromId: d.id,
        fromName: d.name,
        toId: c.id,
        toName: c.name,
        amount,
      });
    }

    d.owed = round2(d.owed - amount);
    c.due = round2(c.due - amount);

    // Whichever side hit zero moves on. Both can, when amounts match exactly.
    if (d.owed <= 0.005) di++;
    if (c.due <= 0.005) ci++;
  }

  return {
    payments,
    nets,
    totalBuyIn: tBuy,
    totalCashOut: tCash,
    discrepancy: round2(tCash - tBuy),
  };
}

/** Plain-language summary for the host to read out or share. */
export function settleSummary(result) {
  if (result.payments.length === 0) return ["Everyone's even — nothing to settle."];
  return result.payments.map(
    (p) => `${p.fromName} pays ${p.toName} $${p.amount.toFixed(2)}`,
  );
}
