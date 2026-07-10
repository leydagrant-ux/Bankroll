# Bankroll

Poker bankroll tracker with private cloud sync and a weekly leaderboard for your league.
Single-page vanilla JS app; Firebase (Auth + Firestore) backend; hosted on GitHub Pages.

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
data live only in that browser (used for local testing).

## Notes

- Bump `VERSION` in `sw.js` whenever `index.html` changes, or phones may serve a stale copy.
- Sessions are private per account; leagues share only nickname + weekly/all-time totals.
- CSV export/import is the migration path in and out.
