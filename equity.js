/**
 * Poker hand evaluation and equity.
 *
 * Answers the only question anyone asks after a big pot: "what was I actually
 * going to win there?" Handles you plus up to five opponents, any board from
 * preflop to river, and opponents whose cards you never saw (simulated as a
 * random hand from the live deck), so a hand that ended in a fold is still
 * loggable.
 *
 * A card is an integer 0–51: `rank * 4 + suit`, rank 0=deuce … 12=ace,
 * suit 0=♠ 1=♥ 2=♦ 3=♣. Integers, not objects — the Monte Carlo path runs
 * hundreds of thousands of evaluations and allocation is what would kill it.
 */

/* ---------------------------------------------------------------------------
   Cards
   --------------------------------------------------------------------------- */

export const RANK_CHARS = "23456789TJQKA";
export const SUIT_CHARS = "shdc";
export const SUIT_SYMBOLS = ["♠", "♥", "♦", "♣"];
/** Hearts and diamonds render red; spades and clubs take the ink colour. */
export const SUIT_IS_RED = [false, true, true, false];
export const RANK_NAMES = [
  "Deuce", "Three", "Four", "Five", "Six", "Seven", "Eight",
  "Nine", "Ten", "Jack", "Queen", "King", "Ace",
];
const RANK_PLURALS = [
  "Deuces", "Threes", "Fours", "Fives", "Sixes", "Sevens", "Eights",
  "Nines", "Tens", "Jacks", "Queens", "Kings", "Aces",
];

export const DECK = Array.from({ length: 52 }, (_, i) => i);

export const cardRank = (c) => c >> 2;
export const cardSuit = (c) => c & 3;
export const makeCard = (rank, suit) => (rank << 2) | suit;

/** "As" → card int. Returns -1 on anything it can't read. */
export function parseCard(str) {
  if (typeof str !== "string" || str.length !== 2) return -1;
  const r = RANK_CHARS.indexOf(str[0].toUpperCase());
  const s = SUIT_CHARS.indexOf(str[1].toLowerCase());
  return r < 0 || s < 0 ? -1 : makeCard(r, s);
}

/** Card int → "As". */
export const cardStr = (c) => RANK_CHARS[cardRank(c)] + SUIT_CHARS[cardSuit(c)];

/** Card int → "A♠", for display. */
export const cardLabel = (c) => RANK_CHARS[cardRank(c)] + SUIT_SYMBOLS[cardSuit(c)];

export const parseCards = (arr) => (arr || []).map(parseCard).filter((c) => c >= 0);
export const cardStrs = (arr) => (arr || []).map(cardStr);

/* ---------------------------------------------------------------------------
   7-card evaluator
   --------------------------------------------------------------------------- */

export const CATEGORIES = [
  "High card", "Pair", "Two pair", "Three of a kind", "Straight",
  "Flush", "Full house", "Four of a kind", "Straight flush",
];

/** Pack a category and up to five rank kickers into one comparable integer. */
const sc = (cat, a = 0, b = 0, c = 0, d = 0, e = 0) =>
  ((((cat * 16 + a) * 16 + b) * 16 + c) * 16 + d) * 16 + e;

/**
 * Highest rank index that tops a 5-straight in `mask`, or -1.
 * The AND-shift trick: bit i survives only if bits i..i+4 are all set, so the
 * straight it represents runs i to i+4.
 */
function straightTop(mask) {
  const s = mask & (mask >> 1) & (mask >> 2) & (mask >> 3) & (mask >> 4);
  if (s) return 31 - Math.clz32(s) + 4;
  // The wheel: ace plays low in A-2-3-4-5, topped by the five.
  if ((mask & (1 << 12)) && (mask & 0b1111) === 0b1111) return 3;
  return -1;
}

/** The top `n` set bits of a rank mask, highest first. */
function topN(mask, n) {
  const out = [];
  for (let r = 12; r >= 0 && out.length < n; r--) if (mask & (1 << r)) out.push(r);
  while (out.length < n) out.push(0);
  return out;
}

/**
 * Score any 5–7 cards. Higher is better; scores are only meaningful against
 * each other, never as an absolute.
 */
export function evaluate(cards) {
  let rankMask = 0;
  const rc = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const sMask = [0, 0, 0, 0];
  const sCount = [0, 0, 0, 0];

  for (let i = 0; i < cards.length; i++) {
    const c = cards[i];
    const r = c >> 2;
    const s = c & 3;
    rc[r]++;
    sCount[s]++;
    sMask[s] |= 1 << r;
    rankMask |= 1 << r;
  }

  // With seven cards a flush rules out both quads and a full house: a flush
  // leaves only two off-suit cards, and three-of-a-kind already needs two of
  // them, so nothing is left to pair. That makes this early return safe.
  for (let s = 0; s < 4; s++) {
    if (sCount[s] >= 5) {
      const fm = sMask[s];
      const sf = straightTop(fm);
      if (sf >= 0) return sc(8, sf);
      const k = topN(fm, 5);
      return sc(5, k[0], k[1], k[2], k[3], k[4]);
    }
  }

  let quad = -1;
  const trips = [];
  const pairs = [];
  for (let r = 12; r >= 0; r--) {
    if (rc[r] === 4) quad = r;
    else if (rc[r] === 3) trips.push(r);
    else if (rc[r] === 2) pairs.push(r);
  }

  if (quad >= 0) return sc(7, quad, topN(rankMask & ~(1 << quad), 1)[0]);
  if (trips.length >= 2) return sc(6, trips[0], trips[1]);
  if (trips.length === 1 && pairs.length >= 1) return sc(6, trips[0], pairs[0]);

  const st = straightTop(rankMask);
  if (st >= 0) return sc(4, st);

  if (trips.length === 1) {
    const k = topN(rankMask & ~(1 << trips[0]), 2);
    return sc(3, trips[0], k[0], k[1]);
  }
  if (pairs.length >= 2) {
    const k = topN(rankMask & ~(1 << pairs[0]) & ~(1 << pairs[1]), 1);
    return sc(2, pairs[0], pairs[1], k[0]);
  }
  if (pairs.length === 1) {
    const k = topN(rankMask & ~(1 << pairs[0]), 3);
    return sc(1, pairs[0], k[0], k[1], k[2]);
  }
  const k = topN(rankMask, 5);
  return sc(0, k[0], k[1], k[2], k[3], k[4]);
}

const scoreParts = (score) => {
  const p = [];
  let v = score;
  for (let i = 0; i < 5; i++) { p.unshift(v % 16); v = Math.floor(v / 16); }
  return { cat: v, k: p };
};

/** "Full house, Kings full of Threes" — what to print under a logged hand. */
export function handName(score) {
  const { cat, k } = scoreParts(score);
  switch (cat) {
    case 8: return k[0] === 12 ? "Royal flush" : `Straight flush, ${RANK_NAMES[k[0]]} high`;
    case 7: return `Four of a kind, ${RANK_PLURALS[k[0]]}`;
    case 6: return `Full house, ${RANK_PLURALS[k[0]]} full of ${RANK_PLURALS[k[1]]}`;
    case 5: return `Flush, ${RANK_NAMES[k[0]]} high`;
    case 4: return `Straight, ${RANK_NAMES[k[0]]} high`;
    case 3: return `Three of a kind, ${RANK_PLURALS[k[0]]}`;
    case 2: return `Two pair, ${RANK_PLURALS[k[0]]} and ${RANK_PLURALS[k[1]]}`;
    case 1: return `Pair of ${RANK_PLURALS[k[0]]}`;
    default: return `${RANK_NAMES[k[0]]} high`;
  }
}

/** Category name alone, for compact display. */
export const handCategory = (score) => CATEGORIES[scoreParts(score).cat];

/* ---------------------------------------------------------------------------
   Equity
   --------------------------------------------------------------------------- */

/**
 * Budget for the exact path, in hand evaluations (runouts × players). The
 * evaluator runs ~8M/sec on a laptop and perhaps a quarter of that on a phone,
 * so 500k keeps the worst enumeration well under a frame's worth of jank.
 *
 * In practice this makes every postflop spot exact — a flop is at most
 * C(45,2) = 990 runouts — and leaves only preflop (C(48,5) = 1.7M) and
 * unknown-hand spots to sampling.
 */
const MAX_EXACT_EVALS = 500000;

const choose = (n, k) => {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return Math.round(r);
};

/**
 * Win probability for each hand.
 *
 * @param hands  array of 1–6 entries; each is a 2-card array, or null/[] for
 *               an opponent whose cards you never saw
 * @param board  0, 3, 4 or 5 community cards
 * @param opts   { samples } to override the Monte Carlo sample count;
 *               { exact: true } to force full enumeration whatever the cost
 *               (ignored when any hand is unknown — there is nothing finite to
 *               enumerate), { exact: false } to force sampling
 * @returns { results: [{win, tie, equity}], trials, exact }
 *          `equity` counts a k-way chop as 1/k, which is what you actually got
 *          paid; `win` is outright wins only.
 */
export function equity(hands, board = [], opts = {}) {
  const n = hands.length;
  const wins = new Array(n).fill(0);
  const tiesN = new Array(n).fill(0);
  const eq = new Array(n).fill(0);

  const used = new Uint8Array(52);
  const mark = (c) => {
    if (c >= 0 && c < 52) used[c] = 1;
  };
  for (const h of hands) for (const c of h || []) mark(c);
  for (const c of board) mark(c);

  const deck = [];
  for (let c = 0; c < 52; c++) if (!used[c]) deck.push(c);

  const unknown = [];
  for (let i = 0; i < n; i++) if (!hands[i] || hands[i].length !== 2) unknown.push(i);

  const boardNeed = 5 - board.length;
  if (boardNeed < 0) throw new Error("Board can hold at most five cards");

  // Scratch state reused across every trial — no allocation in the hot loop.
  const holes = hands.map((h) => (h && h.length === 2 ? [h[0], h[1]] : [-1, -1]));
  const full = [board[0] ?? -1, board[1] ?? -1, board[2] ?? -1, board[3] ?? -1, board[4] ?? -1];
  const seven = new Array(7);
  const scores = new Array(n);

  const tally = () => {
    let best = -1;
    let winners = 0;
    for (let i = 0; i < n; i++) {
      seven[0] = holes[i][0];
      seven[1] = holes[i][1];
      seven[2] = full[0]; seven[3] = full[1]; seven[4] = full[2];
      seven[5] = full[3]; seven[6] = full[4];
      const s = evaluate(seven);
      scores[i] = s;
      if (s > best) { best = s; winners = 1; }
      else if (s === best) winners++;
    }
    const share = 1 / winners;
    for (let i = 0; i < n; i++) {
      if (scores[i] !== best) continue;
      eq[i] += share;
      if (winners === 1) wins[i]++;
      else tiesN[i]++;
    }
  };

  const draws = boardNeed + unknown.length * 2;
  const runouts = choose(deck.length, boardNeed);
  const exact = opts.exact !== undefined
    ? opts.exact && unknown.length === 0
    : unknown.length === 0 && runouts * n <= MAX_EXACT_EVALS;
  let trials = 0;

  if (exact) {
    // Enumerate every runout. `pick` walks combinations of the live deck.
    const idx = new Array(boardNeed);
    const pick = (start, depth) => {
      if (depth === boardNeed) {
        for (let j = 0; j < boardNeed; j++) full[board.length + j] = deck[idx[j]];
        tally();
        trials++;
        return;
      }
      for (let i = start; i <= deck.length - (boardNeed - depth); i++) {
        idx[depth] = i;
        pick(i + 1, depth + 1);
      }
    };
    pick(0, 0);
  } else {
    const samples = opts.samples || (n <= 3 ? 200000 : 100000);
    for (let t = 0; t < samples; t++) {
      // Partial Fisher–Yates: the first `draws` slots become a fresh random
      // deal, and the array stays a valid permutation for the next trial.
      for (let i = 0; i < draws; i++) {
        const j = i + ((Math.random() * (deck.length - i)) | 0);
        const tmp = deck[i]; deck[i] = deck[j]; deck[j] = tmp;
      }
      let d = 0;
      for (let j = 0; j < boardNeed; j++) full[board.length + j] = deck[d++];
      for (const i of unknown) { holes[i][0] = deck[d++]; holes[i][1] = deck[d++]; }
      tally();
      trials++;
    }
  }

  return {
    trials,
    exact,
    results: hands.map((_, i) => ({
      win: wins[i] / trials,
      tie: tiesN[i] / trials,
      equity: eq[i] / trials,
    })),
  };
}

/** Convenience for the hand logger: equity from string cards. */
export const equityFromStrings = (handStrs, boardStrs, opts) =>
  equity(handStrs.map((h) => (h && h.length === 2 ? parseCards(h) : null)), parseCards(boardStrs), opts);
