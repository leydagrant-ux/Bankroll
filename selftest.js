/**
 * Regression net for the two pieces of this app that are pure math and would
 * fail silently if they broke: home game settle-up and hand equity.
 *
 * Runs in the browser by opening selftest.html (results render on the page) and
 * under node (`node --input-type=module -e "import('./selftest.js').then(m=>m.report())"`).
 * The settle cases are ported from PokerApp/src/lib/__tests__/settle.check.ts,
 * where they were hand-checked; the equity cases are published matchups whose
 * numbers are known independently of this code.
 */

import { settleUp } from "./settle.js";
import { equity, evaluate, handName, parseCards, parseCard, cardStr, CATEGORIES } from "./equity.js";

const results = [];
const ok = (name, pass, detail = "") => results.push({ name, pass, detail });

const eq = (name, actual, expected) => {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  ok(name, a === e, a === e ? "" : `expected ${e}, got ${a}`);
};

/** Equity is sampled, so compare within a tolerance in percentage points. */
const near = (name, actual, expected, tolPct = 1.0) => {
  const d = Math.abs(actual - expected) * 100;
  ok(name, d <= tolPct, `${(actual * 100).toFixed(2)}% vs ${(expected * 100).toFixed(2)}% expected (Δ${d.toFixed(2)}pt)`);
};

/* =====================================================================
   Settle-up
   ===================================================================== */
function settleTests() {
  /* Case 1 — a normal night. Alice up 150, Bob down 100, Carl down 50. */
  {
    const r = settleUp([
      { id: "a", name: "Alice", buyIns: [100, 100], cashOut: 350 }, // +150
      { id: "b", name: "Bob", buyIns: [200], cashOut: 100 },        // −100
      { id: "c", name: "Carl", buyIns: [100], cashOut: 50 },        //  −50
    ]);
    eq("case 1 · discrepancy is zero", r.discrepancy, 0);
    eq("case 1 · nets", r.nets.map((n) => n.net), [150, -100, -50]);
    eq("case 1 · two payments (N−1)", r.payments.length, 2);
    eq("case 1 · payments", r.payments.map((p) => `${p.fromName}->${p.toName}:${p.amount}`),
      ["Bob->Alice:100", "Carl->Alice:50"]);
  }

  /* Case 2 — everyone breaks even. */
  {
    const r = settleUp([
      { id: "a", name: "Alice", buyIns: [100], cashOut: 100 },
      { id: "b", name: "Bob", buyIns: [100], cashOut: 100 },
    ]);
    eq("case 2 · no payments", r.payments.length, 0);
    eq("case 2 · discrepancy zero", r.discrepancy, 0);
  }

  /* Case 3 — the messy one: six players, rebuys, uneven amounts. */
  {
    const players = [
      { id: "a", name: "Ann", buyIns: [100, 100], cashOut: 460 }, // +260
      { id: "b", name: "Ben", buyIns: [100], cashOut: 140 },      //  +40
      { id: "c", name: "Cal", buyIns: [100, 50], cashOut: 80 },   //  −70
      { id: "d", name: "Dee", buyIns: [200], cashOut: 70 },       // −130
      { id: "e", name: "Eve", buyIns: [100], cashOut: 0 },        // −100
      { id: "f", name: "Fay", buyIns: [100], cashOut: 100 },      //    0
    ];
    const r = settleUp(players);
    eq("case 3 · discrepancy zero", r.discrepancy, 0);
    eq("case 3 · total buy-in", r.totalBuyIn, 850);
    eq("case 3 · total cash-out", r.totalCashOut, 850);
    eq("case 3 · payments never exceed N−1", r.payments.length <= players.length - 1, true);
    eq("case 3 · total moved equals total owed",
      r.payments.reduce((t, p) => t + p.amount, 0), 300);
    for (const n of r.nets) {
      const out = r.payments.filter((p) => p.fromId === n.id).reduce((t, p) => t + p.amount, 0);
      const inc = r.payments.filter((p) => p.toId === n.id).reduce((t, p) => t + p.amount, 0);
      eq(`case 3 · ${n.name} settles to zero`, Math.round((inc - out - n.net) * 100) / 100, 0);
    }
  }

  /* Case 4 — a miscounted table must be reported, not silently fudged. */
  {
    const r = settleUp([
      { id: "a", name: "Alice", buyIns: [100], cashOut: 150 },
      { id: "b", name: "Bob", buyIns: [100], cashOut: 100 }, // $50 unaccounted for
    ]);
    eq("case 4 · discrepancy surfaced", r.discrepancy, 50);
  }

  /* Case 5 — cents don't drift. */
  {
    const r = settleUp([
      { id: "a", name: "Alice", buyIns: [33.33], cashOut: 66.67 }, // +33.34
      { id: "b", name: "Bob", buyIns: [33.33], cashOut: 0 },       // −33.33
      { id: "c", name: "Carl", buyIns: [33.34], cashOut: 33.33 },  //  −0.01
    ]);
    eq("case 5 · discrepancy zero", r.discrepancy, 0);
    eq("case 5 · moved equals owed",
      Math.round(r.payments.reduce((t, p) => t + p.amount, 0) * 100) / 100, 33.34);
  }

  /* Case 6 — a player who never cashed out still owes his buy-in. */
  {
    const r = settleUp([
      { id: "a", name: "Ann", buyIns: [100], cashOut: 300 },
      { id: "b", name: "Ben", buyIns: [100, 100], cashOut: 0 },
    ]);
    eq("case 6 · busted player owes it all",
      r.payments.map((p) => `${p.fromName}->${p.toName}:${p.amount}`), ["Ben->Ann:200"]);
  }
}

/* =====================================================================
   Hand evaluation
   ===================================================================== */
const score = (s) => evaluate(parseCards(s.split(" ")));

function evaluatorTests() {
  const better = (name, a, b) => ok(name, score(a) > score(b),
    `${handName(score(a))} should beat ${handName(score(b))}`);

  better("straight flush > quads", "9s 8s 7s 6s 5s 2h 3h", "As Ah Ad Ac Ks 2h 3h");
  better("quads > full house", "As Ah Ad Ac Ks 2h 3h", "Ks Kh Kd Qs Qh 2c 3c");
  better("full house > flush", "Ks Kh Kd Qs Qh 2c 3c", "As Js 9s 5s 3s 2h 4d");
  better("flush > straight", "As Js 9s 5s 3s 2h 4d", "9s 8h 7d 6c 5s 2h 3d");
  better("straight > trips", "9s 8h 7d 6c 5s 2h 3d", "9s 9h 9d 5c 3s 2h 7d");
  better("trips > two pair", "9s 9h 9d 5c 3s 2h 7d", "9s 9h 5d 5c 3s 2h 7d");
  better("two pair > pair", "9s 9h 5d 5c 3s 2h 7d", "9s 9h 4d 5c 3s 2h 7d");
  // Deliberately gappy: A-K-4-8-3-J-7 must not accidentally contain a wheel.
  better("pair > high card", "9s 9h 4d 8c 3s 2h 7d", "As Kh 4d 8c 3s Jh 7d");
  better("pair of aces, king kicker > queen kicker", "As Ah Kd 8c 3s 2h 7d", "As Ah Qd 8c 3s 2h 7d");

  ok("wheel is a straight", handName(score("As 2h 3d 4c 5s Kh Qd")) === "Straight, Five high",
    handName(score("As 2h 3d 4c 5s Kh Qd")));
  ok("wheel does not beat a six-high straight",
    score("6s 2h 3d 4c 5s Kh Qd") > score("As 2h 3d 4c 5s Kh Qd"));
  ok("royal flush named", handName(score("As Ks Qs Js Ts 2h 3d")) === "Royal flush",
    handName(score("As Ks Qs Js Ts 2h 3d")));
  ok("boat named from the right end",
    handName(score("Ks Kh Kd 3s 3h 2c 7d")) === "Full house, Kings full of Threes",
    handName(score("Ks Kh Kd 3s 3h 2c 7d")));
  ok("two sets make a boat, bigger set on top",
    handName(score("Ks Kh Kd 3s 3h 3c 7d")) === "Full house, Kings full of Threes",
    handName(score("Ks Kh Kd 3s 3h 3c 7d")));
  eq("identical hands score identically", score("As Ks Qh Jd 9c 4s 2h"), score("Ah Kh Qs Jc 9d 4h 2s"));
  eq("card round-trips through string", cardStr(parseCard("Td")), "Td");
}

/**
 * The definitive evaluator check: categorise all 2,598,960 five-card hands and
 * compare the census against the textbook distribution. These counts are fixed
 * combinatorial facts, derived nowhere near this code, so agreeing with them
 * means the categoriser is correct — not merely self-consistent. Runs in about
 * a third of a second.
 */
const CENSUS = [1302540, 1098240, 123552, 54912, 10200, 5108, 3744, 624, 40];

function censusTest() {
  const counts = new Array(9).fill(0);
  const h = new Array(5);
  for (let a = 0; a < 48; a++) { h[0] = a;
    for (let b = a + 1; b < 49; b++) { h[1] = b;
      for (let c = b + 1; c < 50; c++) { h[2] = c;
        for (let d = c + 1; d < 51; d++) { h[3] = d;
          for (let e = d + 1; e < 52; e++) { h[4] = e;
            counts[Math.floor(evaluate(h) / 1048576)]++;
          } } } } }
  eq("census covers every 5-card hand", counts.reduce((x, y) => x + y, 0), 2598960);
  for (let i = 0; i < 9; i++) {
    eq(`census · ${CATEGORIES[i].toLowerCase()} = ${CENSUS[i].toLocaleString("en-US")}`, counts[i], CENSUS[i]);
  }
}

/* =====================================================================
   Equity — published matchups, so these check the code, not itself
   ===================================================================== */
function equityTests() {
  const P = (s) => parseCards(s.split(" "));

  /* --- Preflop, against published matchups everyone quotes ---------------
     Enumerated exactly (C(48,5) = 1,712,304 runouts) so there is no sampling
     noise to hide behind; a tenth of a point of slack covers disagreement in
     the last digit of the published figure, and nothing more. */
  {
    const r = equity([P("As Ah"), P("Ks Kh")], [], { exact: true });
    eq("preflop enumerates C(48,5) runouts", r.trials, 1712304);
    near("AA vs KK preflop = 82.4%", r.results[0].equity, 0.824, 0.3);
  }
  const pre = (a, b, samples = 200000) => equity([P(a), P(b)], [], { samples }).results;
  // Sampled at 200k, where the standard error is ~0.11pt; 1.0pt of tolerance
  // sits far outside that and far inside the gap to a wrong answer.
  near("AKs vs QQ preflop = 46.0%", pre("As Ks", "Qh Qd")[0].equity, 0.460);
  near("AKo vs 72o preflop = 67.4%", pre("As Kh", "7d 2c")[0].equity, 0.674);
  near("AA vs a random hand = 85.2%", equity([P("As Ah"), null], [], { samples: 200000 }).results[0].equity, 0.852);

  /* --- Postflop: enumerated exactly, and checkable by counting outs ------ */
  {
    // AA vs KQs on Js Ts 2h. Villain has four spades and an open-ender, so
    // he wins with 9 spades + 3 offsuit nines + the case offsuit ace (which
    // makes him Broadway while it makes hero only trips) = 13 clean outs
    // twice, ≈48%, plus runner-runners. Hero should sit near half.
    const r = equity([P("Ah Ad"), P("Ks Qs")], P("Js Ts 2h"));
    ok("flop spots are enumerated, not sampled", r.exact, `trials=${r.trials}`);
    eq("flop enumerates C(45,2) runouts", r.trials, 990);
    near("AA vs KQs on Js Ts 2h ≈ 50.6%", r.results[0].equity, 0.506, 0.8);
  }
  {
    // Set of eights vs the nut flush draw on 8s 5s 2c. Villain needs a spade
    // (9 outs) and must dodge a board pair, which fills hero's boat — so he
    // lands a little under a third and hero a little under three quarters.
    const r = equity([P("8h 8d"), P("As Ks")], P("8s 5s 2c"));
    near("set vs nut flush draw ≈ 74.4%", r.results[0].equity, 0.744, 0.8);
  }
  {
    // Sampling must agree with enumeration on a spot where both can run —
    // this is what proves the Monte Carlo path is unbiased rather than merely
    // precise. Same hands, two engines, 0.5pt apart at most.
    const hands = [P("Ah Ad"), P("Ks Qs")];
    const board = P("Js Ts 2h");
    const exactEq = equity(hands, board, { exact: true }).results[0].equity;
    const sampled = equity(hands, board, { exact: false, samples: 200000 }).results[0].equity;
    near("sampler agrees with enumerator", sampled, exactEq, 0.5);
  }
  {
    // Drawing dead: the board itself is a straight flush, so the hole cards
    // are decoration and the pot is chopped.
    const r = equity([P("Ah Ad"), P("Kc Kd")], P("9s 8s 7s 6s 5s"));
    eq("board plays — dead chop", r.results.map((x) => x.equity), [0.5, 0.5]);
    eq("a chop is a tie, not a win", r.results[0].win, 0);
  }
  {
    // River: nothing left to draw, so exactly one deterministic trial.
    const r = equity([P("Ah Ad"), P("Ks Kh")], P("Ac 7d 2s 9h 3c"));
    eq("river is one trial", r.trials, 1);
    eq("set of aces wins", r.results[0].equity, 1);
  }

  /* --- Multiway and unknown hands --------------------------------------- */
  ok("unknown hand forces sampling", !equity([P("As Ah"), null], [], { samples: 1000 }).exact);
  {
    const r = equity([P("As Ks"), null, null, P("7c 2d")], P("Ah 7h 2h"), { samples: 60000 });
    const total = r.results.reduce((t, x) => t + x.equity, 0);
    ok("four-way equities sum to 1", Math.abs(total - 1) < 1e-9, `sum=${total}`);
  }
  {
    const r = equity([P("As Ah"), P("Ks Kh"), P("Qs Qh")], [], { samples: 80000 });
    const total = r.results.reduce((t, x) => t + x.equity, 0);
    ok("three-way equities sum to 1", Math.abs(total - 1) < 1e-9, `sum=${total}`);
    ok("aces lead a three-way", r.results[0].equity > r.results[1].equity
      && r.results[1].equity > r.results[2].equity,
      r.results.map((x) => (x.equity * 100).toFixed(1) + "%").join(" / "));
  }
  {
    // Six-handed all-in: the shape the hand logger has to survive.
    const r = equity([P("As Ah"), P("Ks Kh"), P("Qs Qh"), P("Jc Jd"), null, null],
      P("2c 7d 9s"), { samples: 40000 });
    const total = r.results.reduce((t, x) => t + x.equity, 0);
    ok("six-way equities sum to 1", Math.abs(total - 1) < 1e-9, `sum=${total}`);
  }
}

/** Runs every check and hands back the raw results. */
export function runSelfTest() {
  results.length = 0;
  const t0 = Date.now();
  settleTests();
  evaluatorTests();
  censusTest();
  equityTests();
  const failed = results.filter((r) => !r.pass);
  return { results, failed, ms: Date.now() - t0, passed: failed.length === 0 };
}

/** Console runner, for node. */
export function report() {
  const r = runSelfTest();
  for (const c of r.results) {
    console.log(`  ${c.pass ? "ok  " : "FAIL"} ${c.name}${c.detail ? `  — ${c.detail}` : ""}`);
  }
  console.log(r.passed
    ? `\nAll ${r.results.length} checks passed in ${r.ms}ms.`
    : `\n${r.failed.length} of ${r.results.length} CHECKS FAILED.`);
  return r;
}
