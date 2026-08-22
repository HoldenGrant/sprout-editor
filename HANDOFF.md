# Handoff

Where things stand, for picking this back up later (a future session, or someone else
entirely). Read `README.md` for how the extension works and `CHANGELOG.md` for the full
history — this file is the "state of the world right now" summary.

## Status: working, not yet published

The extension is fully functional and has been verified against the real
`HoldenGrant/sprout` repo (a live child care business site): load, edit, undo/redo,
save-as-commit, and now switch between files, all confirmed working end-to-end.

It is **not** on the Chrome Web Store yet — still `chrome://extensions` → Load unpacked
only. See `docs/webstore/submission-checklist.md` for exactly what's left, and note that
most of it needs a human (the $5 developer fee, real screenshots, the actual submit).

## What's actually been verified live

Not just "written and assumed correct" — these were diagnosed and fixed against real
failures on the real test repo, not hypothetically:

- Loading a private repo's files (auth, both PAT and OAuth device flow)
- A GitHub App being authorized but not installed anywhere (the two-step consent gotcha
  — see the README's Setup section)
- A stuck JS-driven loading-screen overlay, and a missing image with an `onerror`
  fallback — both on the actual `services.html` file
- Plain-text `<div>`s not being detected as editable (found via a real template's
  `stat-label` divs)
- The "Edit with Sprout" button not appearing at all on a fresh navigation, and
  separately, appearing then vanishing seconds later — two different root causes, both
  fixed (see CHANGELOG "Fixed" section for 2026-08-22)
- The device-flow sign-in code being generated correctly but never visually appearing
  (a CSS specificity bug)

## Open items

- **Chrome Web Store submission** — not started beyond the drafted materials in
  `docs/webstore/`. Needs: the developer account fee, real screenshots of the extension
  in use, zipping it, and going through review.
- **Real icon design** — `assets/icons/*.png` are a simple programmatically-generated
  placeholder (see `assets/icons/generate_icons.py`), fine to ship but not a real design
  pass.
- **Large-file support** — the Contents API's ~1MB inline-content cap isn't worked
  around with the Git Blobs API yet (documented limitation, not silently broken).
- **Branch-protected repos** — saving assumes a direct commit to the branch always
  succeeds; a repo requiring PR review would just fail the save with whatever error
  GitHub returns. No "create branch + open PR" fallback exists.
- **Inline `background-image:url(...)` styles** aren't inlined for preview (documented
  limitation — only `<link rel="stylesheet">`, `<img src>`, and CSS `url()` inside
  fetched stylesheets are).

## Key decisions worth knowing before changing things

- **No backend server, anywhere, on purpose.** OAuth uses GitHub's Device Flow
  specifically because it needs no client secret — adding any feature that would need a
  secret (token refresh included) breaks that constraint. If a GitHub App's "Expire user
  authorization tokens" setting is ever turned on, tokens would need re-authentication
  every ~8 hours rather than a silent refresh, since refreshing requires a secret we
  don't have anywhere to hold. Current guidance if that comes up: leave that setting off
  rather than build a backend for it.
- **The preview iframe never runs the site's own JavaScript**, deliberately (see
  `editor/canvas.js`'s sandbox comment) — this is what makes "Smart handling for
  script-dependent sites" in the README necessary, and it's a constraint worth keeping,
  not a gap to "fix" by enabling `allow-scripts`.
- **Save always replays onto a fresh parse of the pristine original HTML**, never the
  live (asset-URL-rewritten) preview DOM — see the top-of-file comment in
  `services/html-utils.js`. This is the single most load-bearing piece of the
  architecture; don't shortcut it even for a quick fix.

## Reference material

- **CHANGELOG.md** — full chronological history of what changed and why.
- **docs/webstore/** — Chrome Web Store submission materials + checklist.
- **[Sprout Care GitHub Guide](https://claude.ai/code/artifact/5fa9594c-cab3-4a2e-9cbb-eb3d5d6b7d32)**
  — a separate, illustrated guide for editing `index.html`/`services.html` directly on
  GitHub's own web editor, without this extension at all. Published as a Claude artifact
  (private by default), not part of this repo.
- **[holdengrant.github.io/sprout-editor](https://holdengrant.github.io/sprout-editor/)**
  — the extension's own public homepage (source: `docs/index.html`).
