# Chrome Web Store Submission Checklist

Everything text-based (policy, listing copy, justifications) is drafted and ready in this
folder. What's left needs your hands — a payment, a hosting decision, and Google's own
review queue, none of which I can do from here.

## 1. Developer account (one-time, $5)

- Go to <https://chrome.google.com/webstore/devconsole>
- Sign in with whichever Google account should own the listing
- Pay the one-time $5 registration fee if you haven't already registered as a Chrome Web
  Store developer

## 2. Host the privacy policy somewhere with a real URL

The Web Store requires a **live URL**, not a file — Google's review actually fetches it.
Easiest options, roughly in order of effort:
- **GitHub Pages**: push this repo to GitHub, enable Pages (Settings → Pages → deploy from
  a branch), and the policy would live at e.g.
  `https://holdengrant.github.io/sprout-editor/docs/webstore/privacy-policy.html`
  (GitHub Pages serves Markdown as plain text by default — for it to render nicely, either
  convert `privacy-policy.md` to a simple `.html` page, or enable Jekyll, which GitHub
  Pages does automatically for repos with no custom build)
- **Any other static host** you already use (Netlify, Vercel, etc.) — just needs a stable
  public URL
- I have **not** pushed this repo anywhere — per your standing rule, I only push when you
  explicitly ask. Let me know when you're ready and I'll help prep whichever hosting path
  you pick.

## 3. Real screenshots

The listing needs at least one screenshot (1280×800 or 640×400 px) of the extension
actually working. I can't capture these myself (no browser automation available in this
environment) — grab a couple once you're testing the extension: the injected "Edit with
Sprout" button on a GitHub file page, and the editor itself with something selected in the
Inspector panel, are the two most useful shots.

## 4. Zip the extension for upload

```bash
cd ~/Documents/GitHub/sprout-editor
zip -r sprout-editor.zip . -x ".git/*" -x "docs/*" -x "*.DS_Store"
```
Upload the resulting `sprout-editor.zip` in the dashboard's "Package" tab.

## 5. Fill in the dashboard

Use the drafted copy directly:
- **Store listing** tab → `store-listing.md` (name, summary, description, category)
- **Privacy practices** tab → `permissions-justification.md` +
  `data-usage-disclosure.md`, and the hosted privacy policy URL from step 2
- **Package** tab → the zip from step 4

## 6. Submit for review

Google's review typically takes anywhere from a few hours to a couple of weeks for a new
listing, longer if it touches sensitive permissions (ours are fairly minimal, which helps).
You'll get an email either way — if it's rejected, the reason is almost always fixable from
the same dashboard.

## Optional, before or after submitting

- **Real icon design.** The current icons (`assets/icons/`) are a simple programmatically
  generated placeholder (green circle + sprout glyph) — good enough to ship, but a real
  design pass would look more polished in the store listing and browser toolbar.
- **Promo tile image** (440×280) — no longer strictly required by the dashboard, but
  improves how the listing looks if Google ever features/recommends similar tools.
