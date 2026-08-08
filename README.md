# Bankroll

Poker bankroll tracker with private cloud sync, a weekly leaderboard for your league,
and a home game manager (live timer, hand logger, settle-up).
Single-page vanilla JS app; Firebase (Auth + Firestore) backend; hosted on GitHub Pages.
No build step and no dependencies — what's in the repo is what ships.

## One-time setup

1. **Firebase** (free Spark plan, no card):
   - console.firebase.google.com → Add project (disable Analytics, it's not needed).
   - Build → Authentication → Get started → Sign-in method → enable **Email/Password**.
   - Build → Firestore Database → Create database (production mode, closest region).
   - Firestore → Rules → paste the contents of `firestore.rules` → Publish.
   - Project settings → Your apps → Web app (`</>`) → register → copy the `firebaseConfig`
     object into the marked block near the top of `index.html`.
   - Authentication → Settings → Authorized domains → add your GitHub Pages domain
     (`<username>.github.io`).
2. **GitHub Pages**: push this folder to a public repo → Settings → Pages →
   deploy from branch `main`, root. App appears at `https://<username>.github.io/<repo>/`.

While `index.html` still says `PASTE_ME`, the app runs in **demo mode**: accounts and
data live only in that browser. Once a real config is in place, add `?demo` to the URL
to get the same throwaway local backend for testing.

## Layout

| File | What it is |
| --- | --- |
| `index.html` | The whole app — markup, styles and logic in one file. |
| `settle.js` | Who-pays-whom for a home game, as a pure function. |
| `equity.js` | Hand evaluation and equity, enumerated or sampled. |
| `selftest.js` | Regression net over those two modules. |
| `selftest.html` | Runs the self test in a browser and renders the results. |
| `firestore.rules` | Access control; paste into the Firebase console when it changes. |
| `sw.js` | Service worker — caches the app shell for offline use. |
| `manifest.webmanifest`, `icons/` | Installable-PWA metadata and home screen icons. |

`settle.js` and `equity.js` are split out of `index.html` precisely so they can be tested
headlessly. Run the suite in a browser via `selftest.html`, or under node:

```
node --input-type=module -e "import('./selftest.js').then(m=>m.report())"
```

## Notes

- Bump `VERSION` in `sw.js` whenever `index.html` changes, or phones may serve a stale copy.
- Sessions sync privately to your account. League sharing defaults to **full sessions** —
  each session's date, location, stakes, buy-in, cash-out and length — which is what puts
  your curve on the league chart; switch to **totals only** in Account at any time. Your
  nickname and weekly/all-time totals are shared either way, and notes never are.
- CSV export/import is the migration path in and out.
